# Worker —— 行旅 Agent 的 LLM 代理

手机 PWA 不直接调 LLM（否则 API Key 会暴露在前端）。这一层 Cloudflare Worker 做三件事：

1. 把 `travel-agent.md`（经 `tools/build-system-prompt.mjs` 生成 `src/prompt.js`）作为 **system prompt** 强制注入；
2. 剥除客户端伪造的 `system` / `tool` 消息，只保留 `user` / `assistant`；
3. 用 `env.LLM_API_KEY`（secret）调任意 OpenAI 兼容 `/chat/completions`，只返回 assistant 文本。

**密钥只存在于 Worker 的 secret，不进仓库、不进前端、不进日志。** 本目录里没有任何真实 Key。

## 文件

| 文件 | 作用 |
|---|---|
| `src/index.js` | `fetch(request, env)`：CORS 白名单、限额、清洗消息、注入 prompt、转发上游、统一错误 |
| `src/prompt.js` | **自动生成**，别手改。由 `node tools/build-system-prompt.mjs` 从根 `travel-agent.md` 生成 |
| `wrangler.toml` | 非敏感配置：`LLM_BASE_URL` / `LLM_MODEL` / `ALLOWED_ORIGIN` |
| `test.mjs` | Node 内置测试，mock 上游 `fetch`，无需账号/真实 Key |
| `package.json` | `npm test` = `node --test test.mjs`；`wrangler` 仅部署用 |
| `.dev.vars.example` | 本地调试用的占位键名，真实 `.dev.vars` 已排除 |

## 接口

```
POST https://<你的 worker>.workers.dev/api/chat
Content-Type: application/json
Origin: https://<你的 pages 源>

{ "messages": [ { "role": "user"|"assistant", "content": "…" } ] }
```

成功：`200 { "reply": "(当前：plan) …" }`
失败：`4xx/5xx { "error": "静态说明文案" }`（**绝不回显密钥或上游响应体**）

限额：消息 ≤ 20 条、单条 ≤ 4000 字、合计 ≤ 8000 字。无 `Origin` 头的服务端调用放行；带 `Origin` 时必须命中 `ALLOWED_ORIGIN` 白名单。

## 部署（需要你自己的 Cloudflare 账号）

```bash
cd worker
npm install                 # 只装 wrangler（devDependency）
npx wrangler login
npx wrangler deploy          # 记下输出的 https://xxx.workers.dev
npx wrangler secret put LLM_API_KEY     # 粘贴真实 Key， stdin 输入，不落盘
```

三个非敏感变量在 `wrangler.toml` 的 `[vars]` 里改：

- `LLM_BASE_URL`：OpenAI 兼容端点 base，不带 `/chat/completions`。
  例：DeepSeek `https://api.deepseek.com`、OpenAI `https://api.openai.com/v1`、或任意兼容网关。
- `LLM_MODEL`：模型 id，如 `deepseek-chat`。
- `ALLOWED_ORIGIN`：你的 GitHub Pages 源（精确协议+域名，无路径），通常是
  `https://<用户名>.github.io`；多个源用逗号分隔。开发期可临时填 `*`，**生产务必收窄**。

拿到 `https://xxx.workers.dev` 后，打开手机 PWA → 「设置」→ 填入这个 URL（存 localStorage，不写死在代码里）。

## 本地测试

```bash
cd worker
npm test            # node --test test.mjs，全部离线、mock 上游
npm run check       # node --check src/index.js 语法
```

测试覆盖：system 注入且在最前、伪造 system 被剥除、非白名单 Origin 被拒、
超长/超轮数被拒、错误响应不含密钥、`prompt.js` 与 `travel-agent.md` 逐字一致。

## 改了提示词之后

```bash
node tools/build-system-prompt.mjs   # 重新生成 src/prompt.js
npm test                             # 验证一致性
```

**别跳过这一步**：`examples/regress.py` 的 `[K]` 块会比对 `src/prompt.js` 与
根 `travel-agent.md`，两者不一致时 CI 会直接 FAIL，防止「提示词改了但线上 Worker 还是旧版」。
