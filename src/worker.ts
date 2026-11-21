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

    // 其余全部交给静态资源（public/）
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('静态资源绑定未配置', { status: 500 });
  },
};
