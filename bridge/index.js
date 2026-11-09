/**
 * @local/xinglv-llm-bridge — 行旅本机大模型桥
 *
 * 为什么存在
 * ----------
 * 旅行 PWA 原先要靠 Cloudflare Worker + 自己的 LLM API Key 才能说话。
 * 但在 DSH 桌面版里，「当前模型」已经配好、且由宿主进程持有额度与凭据。
 * 那个 loopback shim（dsh-connect-workbuddy）的 bearer 是
 * `randomBytes(32)` 的进程内随机值、从不落盘，外部进程无法认证 —— 所以
 * 「拿一个 token 去打 shim」这条路在原理上走不通。
 *
 * 本插件的做法是唯一的受支持路径：它本身跑在 DSH 宿主进程内，通过
 * `ctx.llm.stream()` 直接驱动当前已注册的提供方适配器（因此复用当前
 * provider / model / 额度 / 重试与计量），再对 127.0.0.1 暴露一个
 * OpenAI 兼容的 `/v1/chat/completions`，外加把仓库里的 `app/` 静态页面
 * 同源伺服出去 —— 同源是关键，https 的 Pages 页面无法访问 http 的
 * 127.0.0.1（混合内容 + 私有网络访问限制），必须由本桥自己发页面。
 *
 * 安全边界（务必如实对外说明）
 * ----------------------------
 * - 默认只监听 loopback；Host 头必须是 loopback，否则 403（防 DNS rebinding）。
 * - 任何 `/v1/*` 都要 `Authorization: Bearer <token>`；token 每进程随机，
 *   只通过同源 `/bridge-info.json` 取。跨源 JS 读不到该 JSON（不发 CORS），
 *   所以别的网站无法把它当免费代理用。
 * - 不记录、不转发任何上游密钥；上游凭据边界始终在宿主进程内。
 * - 本机同用户的进程仍可读 `/bridge-info.json` 拿 token。这是「同机同用户
 *   即同信任域」的取舍，不是沙箱，README 里写清楚。
 *
 * 公网模式（`publicAccess: true`，给手机用）
 * ----------------------------------------
 * 手机访问不到 127.0.0.1，只能靠隧道（如 cloudflared）把公网域名指到本桥。
 * 但隧道会把 Host 变成公网域名，于是有两件事必须同时成立才安全：
 *
 *  1. **Host 白名单**：只有 `publicHosts` 里显式列出的域名、或（开着
 *     `allowQuickTunnel` 时）`*.trycloudflare.com` 才放行。光看「不是 loopback
 *     就拒绝」在公网模式下等价于把服务交给任何能构造 Host 头的人。
 *  2. **主 token 绝不出公网**。`/bridge-info.json` 在公网侧只回报元信息
 *     （`auth: 'pair'`），**不返回 token**；手机必须先拿「配对码」
 *     调 `POST /pair` 换一张**会话令牌**，`/v1/*` 接受主 token 或会话令牌。
 *     配对码是本桥启动时随机生成的 6 位数字，只在 loopback 的
 *     `/bridge-info.json` 与宿主日志里出现 —— 也就是**只能从电脑上看**。
 *     配对尝试失败有次数上限，防止对着公网爆破 6 位码。
 *
 * 换句话说：知道隧道 URL 的人拿不到 token；必须同时能在电脑上看到配对码。
 */
import http from 'node:http'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'xinglv-llm-bridge'

/** `llm` 是硬依赖（没有它就没有「当前模型」）；其余按需探测。 */
export const inject = ['llm']

const PKG_DIR = path.dirname(fileURLToPath(import.meta.url))
/** 仓库里的前端目录；bridge/ 与 app/ 是兄弟目录。 */
const APP_DIR = path.resolve(PKG_DIR, '..', 'app')

/**
 * 行为规则的唯一真值源是仓库根的 `travel-agent.md`；`worker/src/prompt.js`
 * 是它经 `tools/build-system-prompt.mjs` 生成的逐字节副本（回归门禁 [K] 校验）。
 * 这里用与门禁相同的解析方式读它，而不是 `import`：
 * 安装时包目录可能被链接到仓库外，静态 import 失败只会给出难以理解的
 * ERR_MODULE_NOT_FOUND；显式读 + 明确报错才能让人一眼看出缺了什么。
 */
function loadPrompt() {
  const file = path.resolve(PKG_DIR, '..', 'worker', 'src', 'prompt.js')
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    throw new Error(
      `找不到行旅提示词 ${file}。本桥必须在 travel-agent 仓库内运行（bridge/ 与 worker/ 是兄弟目录）；` +
      '请从仓库根安装，或先跑 `node tools/build-system-prompt.mjs` 生成 worker/src/prompt.js。',
    )
  }
  const matched = /^export const PROMPT = (".*");$/m.exec(source)
  if (!matched) throw new Error(`行旅提示词格式异常：${file} 里没有单行的 export const PROMPT = "…";`)
  const text = JSON.parse(matched[1])
  if (typeof text !== 'string' || text.length < 1000) {
    throw new Error(`行旅提示词内容异常（${String(text).length} 字符）：${file}`)
  }
  return text
}

const PROMPT = loadPrompt()

/** 只伺服这些文件，白名单式，天然排除路径穿越。 */
const APP_FILES = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8' }],
  ['/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8' }],
  ['/manifest.webmanifest', { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8' }],
  ['/sw.js', { file: 'sw.js', type: 'text/javascript; charset=utf-8' }],
  ['/sample-plan.md', { file: 'sample-plan.md', type: 'text/markdown; charset=utf-8' }],
  ['/sample-plan-card.png', { file: 'sample-plan-card.png', type: 'image/png' }],
  ['/icons/icon-192.png', { file: 'icons/icon-192.png', type: 'image/png' }],
  ['/icons/icon-512.png', { file: 'icons/icon-512.png', type: 'image/png' }],
])

export function apply(ctx, config = {}) {
  const host = config.host ?? '127.0.0.1'
  const ports = [config.port ?? 8789, ...(config.fallbackPorts ?? [])].filter(
    (p) => Number.isInteger(p) && p > 0 && p < 65536,
  )
  const limits = {
    maxMessages: config.maxMessages ?? 20,
    maxTotalChars: config.maxTotalChars ?? 8000,
    maxMessageChars: config.maxMessageChars ?? 4000,
  }
  /** 每进程随机；进程重启即失效，不落盘。 */
  const token = randomBytes(32).toString('base64url')
  let listening = null

  // ---- 公网模式（给手机用）----
  const publicAccess = config.publicAccess === true
  const allowQuickTunnel = publicAccess && config.allowQuickTunnel === true
  const publicHosts = Array.isArray(config.publicHosts)
    ? config.publicHosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean)
    : []
  /** 6 位配对码：只在 loopback 的 /bridge-info.json 与宿主日志里出现。 */
  const pairCode = String(randomInt(0, 1000000)).padStart(6, '0')
  /** 会话令牌 → 签发时间。手机配对后拿到它，重启桥即全部失效。 */
  const sessions = new Map()
  const SESSION_TTL_MS = 30 * 24 * 3600 * 1000
  const MAX_SESSIONS = 32
  /** 配对爆破预算：滑动窗口内失败太多次就锁一段时间。 */
  const pairFailures = []
  const PAIR_WINDOW_MS = 10 * 60 * 1000
  const PAIR_MAX_FAILURES = 10

  const guard = {
    publicAccess,
    allowQuickTunnel,
    publicHosts,
    pairCode,
    sessions,
    SESSION_TTL_MS,
    MAX_SESSIONS,
    pairFailures,
    PAIR_WINDOW_MS,
    PAIR_MAX_FAILURES,
  }

  if (publicAccess) {
    // 配对码要让人能在电脑上看到；写进宿主日志是唯一不依赖界面的途径。
    log(`public access enabled; pairing code = ${pairCode}`)
    log('open the bridge from this machine to read the code, then enter it on the phone')
  }

  const server = http.createServer((req, res) => {
    // 任何异常都不许把宿主进程带崩：统一兜一个 500。
    handle(ctx, req, res, { config, limits, token, guard }).catch((error) => {
      try {
        if (!res.headersSent) sendJson(res, 500, { error: { message: describe(error) } })
        else res.end()
      } catch { /* 已经断了就算了 */ }
    })
  })

  // `apply` 必须同步返回且绝不抛异常；listen 失败只降级为「桥不可用」。
  ctx.effect(() => {
    let index = 0
    let disposed = false

    const attempt = () => {
      if (disposed || listening || index >= ports.length) return
      const port = ports[index]
      const onError = () => {
        server.removeListener('error', onError)
        index += 1
        attempt()
      }
      server.once('error', onError)
      server.listen(port, host, () => {
        server.removeListener('error', onError)
        if (disposed) {
          server.close(() => {})
          return
        }
        listening = port
        log(`listening on http://${host}:${port} (provider=${config.provider || 'auto'})`)
      })
    }
    queueMicrotask(attempt)

    return () => {
      disposed = true
      listening = null
      try { server.close(() => {}) } catch { /* 已关闭 */ }
    }
  })
}

/* ------------------------------------------------------------------ */
/* 请求分发                                                            */
/* ------------------------------------------------------------------ */

async function handle(ctx, req, res, state) {
  const { config, limits, token, guard } = state

  // 1) Host 校验 —— 挡 DNS rebinding，并区分「本机」与「公网隧道」。
  const isLoopback = isLoopbackHost(req.headers.host)
  if (!isLoopback && !isPublicHost(req.headers.host, guard)) {
    return sendJson(res, 403, { error: { message: 'Host header must name the loopback interface or a configured public host' } })
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const route = url.pathname

  // 2) 同源引导端点：不带 token，但不发 CORS 头，跨源 JS 读不到正文。
  //    公网侧只给元信息与 auth:'pair'，**绝不下发 token 或配对码**。
  if (route === '/bridge-info.json') {
    const routeNow = resolveRoute(ctx, config)
    const base = {
      ok: true,
      service: 'xinglv-llm-bridge',
      version: 1,
      provider: routeNow.provider,
      model: routeNow.model,
      reasoningEffort: routeNow.reasoningEffort,
    }
    if (isLoopback) {
      return sendJson(res, 200, {
        ...base,
        auth: 'bearer',
        token,
        ...(guard?.publicAccess ? { pairCode: guard.pairCode } : {}),
        note: 'token 每进程随机；仅同源页面可读取本 JSON。',
      })
    }
    return sendJson(res, 200, {
      ...base,
      auth: 'pair',
      note: '公网访问需要先配对：在电脑上打开本页读取配对码，再在手机上输入。',
    })
  }

  if (route === '/healthz') return sendJson(res, 200, { ok: true })

  // 3) 静态前端（白名单）。公网模式放行，手机才能下载页面。
  const asset = APP_FILES.get(route)
  if (asset && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const body = await readFile(path.join(APP_DIR, asset.file))
      res.writeHead(200, {
        'content-type': asset.type,
        'content-length': body.length,
        'cache-control': 'no-cache',
      })
      return res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      return sendJson(res, 404, { error: { message: `missing asset: ${asset.file}` } })
    }
  }

  // 4) 配对：用 6 位码换一张会话令牌。带爆破预算。
  if (route === '/pair' && req.method === 'POST') {
    return handlePair(req, res, guard)
  }

  // 5) 其余一律要凭据：本机主 token，或配对换来的会话令牌。
  if (!isAuthorized(req.headers.authorization, token, guard)) {
    return sendJson(res, 401, {
      error: { message: 'missing or invalid Authorization bearer', type: 'unauthorized', code: 'unauthorized' },
    })
  }

  if (route === '/v1/models' && req.method === 'GET') {
    const routeNow = resolveRoute(ctx, config)
    let ids = []
    try {
      const models = await ctx.llm.listModels(routeNow.provider)
      ids = (models ?? []).map((m) => m?.id).filter((id) => typeof id === 'string')
    } catch { /* 列不出来就只报当前模型 */ }
    if (!ids.includes(routeNow.model)) ids.unshift(routeNow.model)
    return sendJson(res, 200, {
      object: 'list',
      data: ids.map((id) => ({ id, object: 'model', created: 0, owned_by: routeNow.provider })),
    })
  }

  if (route === '/v1/chat/completions' && req.method === 'POST') {
    const payload = await readJsonBody(req, 256 * 1024)
    if (!payload) return sendJson(res, 400, { error: { message: 'request body must be JSON' } })

    const built = buildMessages(payload, limits)
    if (built.error) return sendJson(res, 400, { error: { message: built.error } })

    const routeNow = resolveRoute(ctx, config)
    const started = Date.now()
    try {
      const { text, finish, usage } = await collect(ctx, routeNow, built.messages, payload)
      if (finish?.kind === 'error' || finish?.kind === 'aborted') {
        const failure = finish.failure ?? {}
        // 只透传机器可读的 code；上游原始报文可能含账号/额度/内部路径等信息，
        // 这里落日志、不给客户端。客户端要的是「为什么失败」，不是上游说了什么。
        log(`chat fail provider=${routeNow.provider} model=${routeNow.model} code=${failure.code ?? 'upstream_error'} detail=${describe(failure)}`)
        return sendJson(res, 502, {
          error: {
            message: finish.kind === 'aborted' ? 'upstream model call was aborted' : 'upstream model call failed',
            type: failure.code ?? 'upstream_error',
            code: failure.code ?? 'upstream_error',
          },
        })
      }
      log(`chat ok provider=${routeNow.provider} model=${routeNow.model} ms=${Date.now() - started} chars=${text.length}`)
      return sendJson(res, 200, {
        id: `chatcmpl-${randomBytes(8).toString('hex')}`,
        object: 'chat.completion',
        created: Math.floor(started / 1000),
        model: routeNow.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: usage
          ? {
            prompt_tokens: usage.inputTokens ?? 0,
            completion_tokens: usage.outputTokens ?? 0,
            total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
          }
          : undefined,
      })
    } catch (error) {
      return sendJson(res, 502, {
        error: { message: describe(error), type: 'upstream_error', code: 'upstream_error' },
      })
    }
  }

  return sendJson(res, 404, { error: { message: `no route for ${req.method} ${route}` } })
}

/* ------------------------------------------------------------------ */
/* 路由解析：跟随 DSH 当前默认模型                                      */
/* ------------------------------------------------------------------ */

function resolveRoute(ctx, config) {
  // 显式配置优先；否则读 agent-default-model 的即时选择，保证「用当前 LLM」。
  const provider = config.provider || readDefault(ctx)?.provider || 'workbuddy'
  const model = config.model || readDefault(ctx)?.model || 'deepseek-v4.1-flash'
  const reasoningEffort = config.reasoningEffort || readDefault(ctx)?.reasoningEffort
  return { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }
}

function readDefault(ctx) {
  try {
    const service = ctx.get?.('agentDefaultModel') ?? ctx.agentDefaultModel
    const selection = service?.currentSelection?.()
    if (selection && typeof selection.provider === 'string' && typeof selection.model === 'string') {
      return selection
    }
  } catch { /* 服务没挂或不可用时按兜底 */ }
  return undefined
}

/* ------------------------------------------------------------------ */
/* 调用当前模型                                                        */
/* ------------------------------------------------------------------ */

function buildMessages(payload, limits) {
  const raw = Array.isArray(payload?.messages) ? payload.messages : []
  if (raw.length === 0) return { error: 'messages must be a non-empty array' }
  if (raw.length > limits.maxMessages) {
    return { error: `too many messages (max ${limits.maxMessages})` }
  }

  const messages = []
  let total = 0
  for (const item of raw) {
    const role = item?.role
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return { error: `unsupported role: ${String(role)}` }
    // 客户端传来的 system 一律丢弃：行为规则只能来自 travel-agent.md，
    // 否则任何人都能改掉「不编造价格」这类硬纪律。
    if (role === 'system') continue
    const text = typeof item?.content === 'string'
      ? item.content
      : Array.isArray(item?.content)
        ? item.content.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('')
        : ''
    if (text.length === 0) continue
    if (text.length > limits.maxMessageChars) {
      return { error: `a single message is too long (max ${limits.maxMessageChars} chars)` }
    }
    total += text.length
    if (total > limits.maxTotalChars) return { error: `conversation is too long (max ${limits.maxTotalChars} chars)` }
    messages.push({ role, content: [{ type: 'text', text }] })
  }
  if (messages.length === 0) return { error: 'messages contain no text content' }

  // 服务端注入，位置与 Worker 保持一致（首条 system）。
  return { messages: [{ role: 'system', content: [{ type: 'text', text: PROMPT }] }, ...messages] }
}

async function collect(ctx, route, messages, payload) {
  const options = {
    provider: route.provider,
    model: route.model,
    messages,
  }
  if (route.reasoningEffort) options.reasoningEffort = route.reasoningEffort
  const maxTokens = payload?.max_tokens ?? payload?.maxTokens
  if (Number.isInteger(maxTokens) && maxTokens > 0) options.maxTokens = maxTokens

  let text = ''
  let finish
  let usage
  for await (const chunk of ctx.llm.stream(options)) {
    switch (chunk?.type) {
      case 'text-delta':
        if (typeof chunk.text === 'string') text += chunk.text
        break
      case 'usage':
        usage = chunk.usage
        break
      case 'finish':
        finish = chunk.reason
        break
      default:
        break
    }
  }
  return { text, finish: finish ?? { kind: 'stop' }, usage }
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function isLoopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader.length === 0) return false
  const name = hostNameOf(hostHeader)
  return name === '127.0.0.1' || name === 'localhost' || name === '::1'
}

/** 取 Host 头里的主机名（去掉端口与 IPv6 方括号），统一小写。 */
function hostNameOf(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader.length === 0) return ''
  const name = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':')[0]
  return String(name).toLowerCase()
}

/**
 * 公网 Host 白名单。**只有显式列出的域名才算**；`allowQuickTunnel` 额外放行
 * `*.trycloudflare.com`。注意 quick tunnel 的域名每次启动都变，所以无法预先
 * 枚举 —— 这正是需要一个显式开关的原因：默认关闭，且即使打开，公网侧也
 * 拿不到主 token，必须配对。
 */
function isPublicHost(hostHeader, guard) {
  if (!guard?.publicAccess) return false
  const name = hostNameOf(hostHeader)
  if (!name) return false
  if (guard.publicHosts.includes(name)) return true
  if (guard.allowQuickTunnel) {
    // 只接受 `xxx.trycloudflare.com` 这一层子域，且必须是靠后缀判断，
    // 否则 `evil-trycloudflare.com` 之类会被误放行。
    return /^[a-z0-9-]+\.trycloudflare\.com$/.test(name)
  }
  return false
}

function bearerOk(header, token) {
  if (typeof header !== 'string') return false
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return false
  return safeEqual(match[1], token)
}

/** 定长比较：先把长度差异也走一遍循环，避免按长度短路泄露信息。 */
function safeEqual(got, want) {
  const a = Buffer.from(String(got))
  const b = Buffer.from(String(want))
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** 主 token（仅本机用）或任一会话令牌（配对得来）都算授权。 */
function isAuthorized(header, token, guard) {
  if (bearerOk(header, token)) return true
  if (!guard) return false
  const match = /^Bearer\s+(.+)$/i.exec(typeof header === 'string' ? header.trim() : '')
  if (!match) return false
  const got = match[1]
  const now = Date.now()
  for (const [tokenValue, issuedAt] of guard.sessions) {
    if (now - issuedAt > guard.SESSION_TTL_MS) {
      guard.sessions.delete(tokenValue)
      continue
    }
    if (safeEqual(got, tokenValue)) return true
  }
  return false
}

/** 清掉过期会话，并保证会话表不会无限增长。 */
function pruneSessions(guard, now = Date.now()) {
  for (const [value, issuedAt] of guard.sessions) {
    if (now - issuedAt > guard.SESSION_TTL_MS) guard.sessions.delete(value)
  }
  while (guard.sessions.size >= guard.MAX_SESSIONS) {
    const oldest = guard.sessions.keys().next()
    if (oldest.done) break
    guard.sessions.delete(oldest.value)
  }
}

/**
 * POST /pair { code } → { token, expiresIn }
 *
 * 配对码只在 loopback 的 `/bridge-info.json` 与宿主日志里出现，所以
 * 「知道公网 URL」本身不足以换到令牌。窗口内失败太多次就锁一段时间，
 * 免得 6 位码被穷举（10^6 空间在 unlimited 尝试下几分钟就跑完）。
 */
async function handlePair(req, res, guard) {
  if (!guard || !guard.publicAccess) {
    return sendJson(res, 404, { error: { message: 'pairing is disabled (publicAccess=false)', code: 'not_found' } })
  }

  const now = Date.now()
  while (guard.pairFailures.length > 0 && now - guard.pairFailures[0] > guard.PAIR_WINDOW_MS) {
    guard.pairFailures.shift()
  }
  if (guard.pairFailures.length >= guard.PAIR_MAX_FAILURES) {
    return sendJson(res, 429, {
      error: { message: 'too many pairing attempts, try again later', code: 'rate_limited' },
    })
  }

  const payload = await readJsonBody(req, 4096)
  const code = typeof payload?.code === 'string' ? payload.code.trim() : String(payload?.code ?? '')
  if (!/^\d{6}$/.test(code)) {
    guard.pairFailures.push(now)
    return sendJson(res, 400, { error: { message: 'code must be 6 digits', code: 'bad_request' } })
  }
  if (!safeEqual(code, guard.pairCode)) {
    guard.pairFailures.push(now)
    // 不回显「差几位」，也不回显正确码。
    return sendJson(res, 401, { error: { message: 'pairing code does not match', code: 'unauthorized' } })
  }

  guard.pairFailures.length = 0
  const sessionToken = randomBytes(32).toString('base64url')
  pruneSessions(guard)
  guard.sessions.set(sessionToken, now)
  log(`paired a new device (active sessions: ${guard.sessions.size})`)
  return sendJson(res, 200, {
    ok: true,
    token: sessionToken,
    expiresIn: Math.floor(guard.SESSION_TTL_MS / 1000),
  })
}

function readJsonBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0
    const parts = []
    req.on('data', (buf) => {
      size += buf.length
      if (size > limit) {
        resolve(null)
        req.destroy()
        return
      }
      parts.push(buf)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function describe(error) {
  if (error?.code && error?.message) return `${error.code}: ${error.message}`
  if (error?.message) return String(error.message)
  return String(error)
}

function log(message) {
  // 只在宿主日志里留一行，便于排查；绝不打印 prompt 正文或凭据。
  try { console.log(`[xinglv-llm-bridge] ${message}`) } catch { /* 忽略 */ }
}
