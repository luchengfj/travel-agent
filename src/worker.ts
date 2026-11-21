/** Worker 入口：/api/plan（SSE 流式规划） + /api/health + 静态资源 */
import { runAgent } from './agent.ts';
import { isConfigured } from './amadeus.ts';
import { handleImageRequest } from './images.ts';
import { llmMode } from './llm.ts';
import type { ChatMsg, Env, SSEEvent } from './types.ts';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === '/api/health') {
      return Response.json(
        {
          ok: true,
          amadeus: isConfigured(env),
          llm: llmMode(env),
          time: new Date().toISOString(),
        },
        { headers: CORS },
      );
    }

    if (pathname === '/api/plan') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (req.method !== 'POST') {
        return Response.json({ error: '请使用 POST' }, { status: 405, headers: CORS });
      }
      let body: { messages?: ChatMsg[] };
      try {
        body = (await req.json()) as { messages?: ChatMsg[] };
      } catch {
        return Response.json({ error: '无效的请求体' }, { status: 400, headers: CORS });
      }
      const msgs = (body.messages ?? []).filter(
        (m) => m && typeof m.content === 'string' && m.content.trim() && m.role !== 'system',
      );
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') {
        return Response.json({ error: 'messages 需要以用户消息结尾' }, { status: 400, headers: CORS });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (e: SSEEvent) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
            } catch {
              // 客户端断开
            }
          };
          try {
            await runAgent(env, msgs, emit);
          } catch (err) {
            emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
            emit({ type: 'done' });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...CORS,
        },
      });
    }

    if (pathname === '/api/img') {
      return handleImageRequest(env, new URL(req.url));
    }

    // 分享：POST 存攻略 → 短 ID；GET 取回
    if (pathname === '/api/share' && req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (pathname === '/api/share' && req.method === 'POST') {
      if (!env.CACHE) return Response.json({ error: 'KV 未配置，无法分享' }, { status: 503, headers: CORS });
      let body: { plan?: unknown };
      try {
        body = (await req.json()) as { plan?: unknown };
      } catch {
        return Response.json({ error: '无效请求体' }, { status: 400, headers: CORS });
      }
      if (!body.plan || typeof body.plan !== 'object') {
        return Response.json({ error: '缺少 plan' }, { status: 400, headers: CORS });
      }
      const id = Math.random().toString(36).slice(2, 8);
      await env.CACHE.put(`share:${id}`, JSON.stringify(body.plan), { expirationTtl: 604_800 });
      return Response.json({ id }, { headers: CORS });
    }
    if (pathname.startsWith('/api/share/') && req.method === 'GET') {
      const id = pathname.slice('/api/share/'.length).replace(/[^a-z0-9]/gi, '');
      if (!id || !env.CACHE) return Response.json({ error: '不存在' }, { status: 404, headers: CORS });
      const raw = await env.CACHE.get(`share:${id}`);
      if (!raw) return Response.json({ error: '分享不存在或已过期' }, { status: 404, headers: CORS });
      return new Response(raw, { headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
    }

    // 其余全部交给静态资源（public/）
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('静态资源绑定未配置', { status: 500 });
  },
};
