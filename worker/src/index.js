// worker/src/index.js
// Cloudflare Worker：手机 PWA 与 LLM 之间的最小代理。
//
// 设计红线（与仓库 AGENTS.md 的「凭据不进仓库」一致）：
//   - LLM_API_KEY 只在 env（wrangler secret）里，只放进上游 Authorization 头；
//     绝不写进响应体、绝不写进日志、绝不回显给前端。
//   - system prompt 由服务端从 worker/src/prompt.js 注入（唯一真值源 travel-agent.md），
//     客户端传来的任何 system 消息一律剥除，防止用户改写 Agent 行为规则。
//   - 不记录 messages 内容：本文件里没有任何 console.log(requestBody)。
//
// 请求： POST /api/chat   { "messages": [{ "role": "user"|"assistant", "content": "…" }] }
// 响应： 200 { "reply": "…" }  或  4xx/5xx { "error": "…" }

import { PROMPT } from "./prompt.js";

// ── 限额：防止被滥用把上游 Token 打爆 ────────────────────────────
const MAX_MESSAGES = 20;      // 一轮对话最多 20 条消息
const MAX_TOTAL_CHARS = 8000; // 所有消息正文合计字符上限
const MAX_ONE_CHARS = 4000;   // 单条消息正文上限

const CORS_HEADERS_BASE = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
};

function jsonReply(obj, status, origin, allowed) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    ...CORS_HEADERS_BASE,
  });
  // 只允许白名单里的源拿到 CORS 头；回显具体 origin（而非 *），避免配 credentials 时踩坑。
  if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  // 204 不能带 body（Node undici / Workers 都不允许），单独处理。
  if (status === 204) return new Response(null, { status, headers });
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(obj), { status, headers });
}

// 判定 Origin 是否被允许。
//   - 没有 Origin 头（curl / 服务端调用 / 同源）：放行，不构成浏览器跨站 CSRF。
//   - ALLOWED_ORIGIN === "*"：开发期放行任意源（部署时务必改成 Pages 具体源）。
//   - 否则按逗号分隔的精确白名单比对。
function originAllowed(origin, allowedRaw) {
  if (!origin) return true;
  const allowed = (allowedRaw || "").trim();
  if (!allowed) return false; // 配了 Origin 却没配白名单 → 拒绝，保守
  if (allowed === "*") return true;
  return allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
}

function fail(msg, status, origin, allowed) {
  // msg 一律是面向用户的静态描述，绝不拼接 env / 上游响应体。
  return jsonReply({ error: msg }, status, origin, allowed);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedRaw = env.ALLOWED_ORIGIN || "";
    const allowed = originAllowed(origin, allowedRaw);

    // 1) 预检
    if (request.method === "OPTIONS") {
      if (!allowed) return fail("Origin 不被允许", 403, origin, false);
      return jsonReply({}, 204, origin, true);
    }

    // 2) 只接受 POST /api/chat
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/chat") {
      return fail("Not Found", 404, origin, allowed);
    }

    // 3) Origin 白名单
    if (!allowed) return fail("Origin 不被允许", 403, origin, false);

    // 4) Content-Type
    const ct = request.headers.get("Content-Type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return fail("需要 application/json", 415, origin, allowed);
    }

    // 5) 解析请求体
    let payload;
    try {
      payload = await request.json();
    } catch {
      return fail("请求体不是合法 JSON", 400, origin, allowed);
    }

    // 6) 校验并清洗 messages：只留 user / assistant，剥掉伪造的 system / tool / function
    const incoming = payload && payload.messages;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return fail("messages 必须是非空数组", 400, origin, allowed);
    }
    if (incoming.length > MAX_MESSAGES) {
      return fail(`消息条数超过上限（${MAX_MESSAGES}）`, 413, origin, allowed);
    }

    let total = 0;
    const cleaned = [];
    for (const m of incoming) {
      if (!m || (m.role !== "user" && m.role !== "assistant")) continue; // 丢弃 system 等
      const content = typeof m.content === "string" ? m.content : "";
      if (content.length > MAX_ONE_CHARS) {
        return fail("单条消息过长", 413, origin, allowed);
      }
      total += content.length;
      if (total > MAX_TOTAL_CHARS) {
        return fail("消息总长度超限", 413, origin, allowed);
      }
      cleaned.push({ role: m.role, content });
    }
    if (cleaned.length === 0) {
      return fail("没有可用的对话消息", 400, origin, allowed);
    }

    // 7) 检查服务端配置（不回显任何值）
    const base = (env.LLM_BASE_URL || "").replace(/\/+$/, "");
    const model = env.LLM_MODEL || "";
    const key = env.LLM_API_KEY || "";
    if (!base || !model || !key) {
      return fail("服务端未配置完整的 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY", 500, origin, allowed);
    }

    // 8) 注入 system（唯一真值源），调用 OpenAI 兼容上游
    const upstreamBody = {
      model,
      stream: false,
      temperature: 0.3,
      messages: [{ role: "system", content: PROMPT }, ...cleaned],
    };

    let upstream;
    try {
      upstream = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(upstreamBody),
      });
    } catch {
      return fail("上游连接失败，请稍后重试", 502, origin, allowed);
    }

    if (!upstream.ok) {
      // 不把上游响应体回显（可能含敏感信息），只给状态码类别。
      const code = upstream.status === 429 ? 429 : 502;
      return fail(
        code === 429 ? "上游限流（429），请稍后重试" : "上游返回错误，请稍后重试",
        code,
        origin,
        allowed
      );
    }

    let data;
    try {
      data = await upstream.json();
    } catch {
      return fail("上游响应解析失败", 502, origin, allowed);
    }
    const reply =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
    if (typeof reply !== "string" || !reply) {
      return fail("上游未返回文本内容", 502, origin, allowed);
    }

    return jsonReply({ reply }, 200, origin, allowed);
  },
};
