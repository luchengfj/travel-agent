/**
 * Node.js 零依赖入口 —— 用于 ALTAR（或任何 Node 22+ / Docker）24 小时运行，
 * 与 Cloudflare Worker 版共用同一套业务代码。
 *
 * 必需环境变量：LLM_API_KEY（OpenAI 兼容接口，如智谱 GLM；Node 下没有 Workers AI 绑定）
 * 可选环境变量：LLM_BASE_URL、LLM_MODEL、AMADEUS_CLIENT_ID、AMADEUS_CLIENT_SECRET、PORT（默认 8080）
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { runAgent } from './src/agent.ts';
import { isConfigured } from './src/amadeus.ts';
import { handleImageRequest } from './src/images.ts';
import { llmMode } from './src/llm.ts';
import type { ChatMsg, Env, SSEEvent } from './src/types.ts';

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = process.cwd();

const env: Env = {
  AMADEUS_CLIENT_ID: process.env.AMADEUS_CLIENT_ID,
  AMADEUS_CLIENT_SECRET: process.env.AMADEUS_CLIENT_SECRET,
  TRAVELPAYOUTS_TOKEN: process.env.TRAVELPAYOUTS_TOKEN,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  LLM_MODEL: process.env.LLM_MODEL,
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res: ServerResponse, obj: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(obj));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error('请求体过大');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const safe = normalize(decodeURIComponent(pathname)).split(sep).join('/');
  let file = safe === '/' || safe === '' ? '/index.html' : safe;
  if (file.includes('..')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const buf = await readFile(join(ROOT, 'public', file));
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

async function handlePlan(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { messages?: ChatMsg[] };
  try {
    body = JSON.parse(await readBody(req)) as { messages?: ChatMsg[] };
  } catch {
    json(res, { error: '无效的请求体' }, 400);
    return;
  }
  const msgs = (body.messages ?? []).filter(
    (m) => m && typeof m.content === 'string' && m.content.trim() && m.role !== 'system',
  );
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') {
    json(res, { error: 'messages 需要以用户消息结尾' }, 400);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...CORS,
  });
  let closed = false;
  req.on('close', () => {
    closed = true;
  });
  const emit = (e: SSEEvent) => {
    if (!closed) res.write(`data: ${JSON.stringify(e)}\n\n`);
  };
  try {
    await runAgent(env, msgs, emit);
  } catch (err) {
    emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    emit({ type: 'done' });
  }
  res.end();
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/api/health') {
    json(res, { ok: true, runtime: 'node', amadeus: isConfigured(env), llm: llmMode(env) });
    return;
  }
  if (url.pathname === '/api/img') {
    void handleImageRequest(env, url).then(async (r) => {
      const buf = Buffer.from(await r.arrayBuffer());
      const headers: Record<string, string> = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      res.writeHead(r.status, headers);
      res.end(buf);
    }).catch(() => {
      res.writeHead(500).end();
    });
    return;
  }
  if (url.pathname === '/api/plan') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (req.method !== 'POST') {
      json(res, { error: '请使用 POST' }, 405);
      return;
    }
    void handlePlan(req, res);
    return;
  }
  void serveStatic(url.pathname, res);
}).listen(PORT, () => {
  console.log(`🧭 旅行规划 Agent（Node）已启动: http://0.0.0.0:${PORT}`);
  console.log(`   LLM: ${llmMode(env)} | Amadeus: ${isConfigured(env) ? '已配置' : '未配置'}`);
  if (!env.LLM_API_KEY) {
    console.warn('   ⚠️ 未设置 LLM_API_KEY：Node 模式没有 Workers AI，生成行程将不可用');
  }
});
