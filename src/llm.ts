/** LLM 适配层：默认 Cloudflare Workers AI，可切换到任意 OpenAI 兼容接口 */
import type { ChatMsg, Env } from './types.ts';

const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export function llmMode(env: Env): string {
  return env.LLM_API_KEY ? `openai-compatible(${env.LLM_MODEL ?? '默认模型'})` : `workers-ai(${WORKERS_AI_MODEL})`;
}

/**
 * 统一对话接口，返回模型输出的纯文本。
 * - 配置了 LLM_API_KEY：走 OpenAI 兼容 /chat/completions
 * - 否则：走 Workers AI 绑定（本地 dev 需要 `wrangler login`）
 */
export async function chat(
  env: Env,
  messages: ChatMsg[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 2048;
  const temperature = opts.temperature ?? 0.3;

  if (env.LLM_API_KEY) {
    const base = (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'gpt-4o-mini',
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM 接口错误（HTTP ${res.status}）：${text.slice(0, 300)}`);
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? '';
  }

  if (!env.AI) {
    throw new Error('LLM 未配置：请先 `npx wrangler login`（使用 Workers AI），或在 .dev.vars / secrets 里配置 LLM_API_KEY');
  }
  const result = (await env.AI.run(WORKERS_AI_MODEL, {
    messages,
    max_tokens: maxTokens,
    temperature,
  })) as { response?: unknown };
  let out: string;
  const raw: unknown = result?.response;
  // local 返回 string；remote 绑定可能返回 ReadableStream 或嵌套对象
  if (typeof raw === 'string') {
    out = raw;
  } else if (raw instanceof ReadableStream) {
    out = await new Response(raw).text();
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const nested = obj.response ?? obj.data ?? obj.result ?? obj.text;
    if (typeof nested === 'string') {
      out = nested;
    } else if (nested instanceof ReadableStream) {
      out = await new Response(nested).text();
    } else {
      out = JSON.stringify(obj);
    }
  } else {
    out = raw === undefined || raw === null ? '' : String(raw);
  }
  return out;
}

/** 从模型输出里鲁棒地抠出第一个 JSON 对象（容忍 ```json 围栏和前后废话） */
export function extractJson<T>(text: string): T {
  let t = (text ?? '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  if (start === -1) throw new Error('模型未返回 JSON');
  let depth = 0;
  let end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('模型返回的 JSON 不完整');
  return JSON.parse(t.slice(start, end + 1)) as T;
}
