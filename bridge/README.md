# 行旅本机大模型桥（@local/xinglv-llm-bridge）

让「行旅」旅行 PWA **用 DSH 正在使用的当前模型**回答，不需要 Cloudflare Worker，
也不需要你自己准备 API Key。

## 它解决什么问题

PWA 原先只有两条路：Demo（静态样例）或 Cloudflare Worker（要 `LLM_API_KEY`）。
但在 DSH 桌面版里，模型已经配好、额度与凭据都由宿主进程持有。本插件跑在宿主进程内，
通过 `ctx.llm.stream()` 直接驱动当前已注册的模型适配器，因此：

- 复用当前 provider / model / 推理强度，模型换了桥自动跟着换；
- 复用宿主的额度、重试与计量，**桥里没有任何密钥**；
- 对 `127.0.0.1` 暴露 OpenAI 兼容的 `POST /v1/chat/completions`，别的本机工具也能用。

## 为什么必须由桥自己发页面

GitHub Pages 是 `https://`，本机桥是 `http://127.0.0.1`。浏览器会同时拦住
混合内容与私有网络请求，所以「Pages 页面调本机桥」在原理上做不到。
因此桥把仓库里的 `app/` 同源伺服出去——打开 `http://127.0.0.1:<port>/` 得到的
就是行旅 PWA，且在同一源上调用 `/v1/chat/completions`，不涉及跨源。

## 安全边界（如实说明，别当成沙箱）

| 措施 | 说明 |
|---|---|
| 只监听 loopback | 默认 `127.0.0.1:8789`，失败依次退到 8794/8795/8796 |
| Host 头校验 | 不是 loopback（或未在公网白名单 `publicHosts` / `publicHostSuffixes` / quick tunnel 规则里）一律 403，挡 DNS rebinding |
| bearer 鉴权 | 所有 `/v1/*` 需 `Authorization: Bearer <token>` |
| token 每进程随机 | `randomBytes(32)`，不落盘，重启即失效 |
| 引导端点不发 CORS | `/bridge-info.json` 只同源可读，别的网站拿不到 token |
| 丢弃客户端 system | 行为规则只能来自 `travel-agent.md`，防提示词篡改 |

**这不是沙箱**：本机同用户的其它进程仍可读 `http://127.0.0.1:8789/bridge-info.json`
拿到 token。这是「同机同用户即同信任域」的取舍，README 与界面都不假装它更安全。

## 公网模式（让手机也能用）

手机访问不到你电脑的 `127.0.0.1`。把 `config.publicAccess` 打开，再用隧道
（如 `cloudflared`）把公网域名指到本桥，手机就能打开同一个 PWA。

**打开它要求下面两条同时成立，缺一不可：**

1. **Host 白名单**：只有下面三种 Host 被接受，其余一律 403：
   - `publicHosts` 里**精确**列出的域名；
   - `publicHostSuffixes` 里**后缀**命中的域名 —— 恰好一层子域 + 该后缀，如填
     `["lhr.life"]` 就是放行 `xxxx.lhr.life`（锚定在 label 边界：`evil-lhr.life`、
     `a.b.lhr.life`、`xxxx.lhr.life.attacker.com` 都不放行；单段后缀如 `["life"]`
     等于放开整个 TLD，会被忽略）；
   - `allowQuickTunnel: true` 时匹配 `^[a-z0-9-]+\.trycloudflare\.com$`（同样精确一层子域，
     `evil-trycloudflare.com` 不放行）。

   `publicHostSuffixes` 是为 `cloudflared` quick tunnel 准备的：它的域名每次重启都换
   （`xxxx.lhr.life`），没法预先写进 `publicHosts`；但后缀清单仍要显式填、用完清空，
   **默认是 `[]`**（即只认 loopback + `publicHosts` + quick tunnel 规则）。
2. **主 token 不出公网**：公网侧 `/bridge-info.json` 只回元信息 + `auth:'pair'`，
   **不下发 token、也不下发配对码**。手机必须先用 **6 位配对码**调 `POST /pair`
   换一张**会话令牌**（30 天 TTL，进程重启全失效）。

配对码由 `randomInt(0, 1000000)` 生成，只出现在：
- **loopback** 的 `/bridge-info.json`（`pairCode` 字段 → 电脑上的设置面板显示）
- 宿主日志（`public access enabled; pairing code = ……`）

也就是说**「知道公网 URL」不足以换到令牌**，还得能看到你电脑屏幕。
配对失败有滑动窗口预算（10 分钟内 10 次 → 429），否则 10^6 的码空间几分钟就能穷举。

```yaml
config:
  publicAccess: true      # 默认 false；改回 false 即完全退回「只认 loopback」
  allowQuickTunnel: true  # quick tunnel 域名每次变，无法预写进 publicHosts
  publicHosts: []         # 固定域名的命名隧道写这里（小写、不含协议端口）
  publicHostSuffixes: []  # 后缀白名单：填 ["lhr.life"] 放行 xxxx.lhr.life；默认空
```

### 手机接入步骤

**最省事：一条命令。** 在仓库根目录跑

```bash
node tools/tunnel.mjs
```

它会检查桥、起隧道、**实测公网 `/healthz` 真返回 200**（不是「拿到域名」就报成功），
然后直接把手机地址和 6 位配对码打出来。手机打开 → ⚙ → 输配对码 → 保存完事。

**手动等价命令**（`tools/tunnel.mjs` 就是把它包装了一层）：

1. 电脑上打开 `http://127.0.0.1:8789` → ⚙ 设置 → 看到 **6 位配对码**。
   （或在 PowerShell 里 `(Invoke-RestMethod http://127.0.0.1:8789/bridge-info.json).pairCode`）
2. 起隧道：`cloudflared tunnel --url http://127.0.0.1:8789 --protocol http2`
   （本机默认 QUIC 出站被挡，必须指定 `--protocol http2`）。
3. 手机打开隧道给的 `https://xxx.trycloudflare.com` → ⚙ 设置 → 输入配对码 → 保存。
4. 之后直接发消息即可，顶栏显示「模式：本机 <模型名>」。

> quick tunnel 的域名**每次重启都变**，配对码也是。换域名后浏览器里存的是旧域名的
> 令牌，需要在新域名下重新配对一次。

### 想要「重启后地址不变」怎么办

`tools/tunnel.mjs` 用的是 quick tunnel，域名随机。要固定域名，只能走 Cloudflare 的
**命名隧道 + Dashboard token**（本机 `cloudflared tunnel login` 那条路在部分网络下
会卡在拉证书，实测不可用）：

1. 打开 <https://one.dash.cloudflare.com> → Networks → Tunnels → Create a tunnel → 选 **Cloudflared**；
2. 给它起个名，复制页面上那串 **token**；
3. 在 **Public Hostname** 加一条：子域填你想要的名字，域名选你的域，**Service 填 `http://127.0.0.1:8789`**；
4. 本机跑：`cloudflared tunnel run --token <TOKEN>`（token 是凭据，别提交进仓库）；
5. 把那个固定域名写进 `bridge/cordis.patch.yml` 的 `publicHosts: ["xinglv.example.com"]`，
   重装插件（`plugin_manager` 的 `install_bundle`）——**否则会被 403 挡掉**，
   报错正是 `Host header must name the loopback interface or a configured public host`。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/bridge-info.json` | 否（不发 CORS） | loopback 回 token + pairCode；公网只回元信息 + `auth:'pair'` |
| POST | `/pair` | 配对码 | `{code}` → `{token, expiresIn}`；`publicAccess=false` 时 404 |

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/`、`/index.html`、`/styles.css`、`/app.js`、`/sw.js`、`/manifest.webmanifest`、`/icons/*`、`/sample-plan*` | 否 | 同源伺服 PWA（白名单） |
| GET | `/healthz` | 否 | `{ ok: true }` |
| GET | `/bridge-info.json` | 否（但不发 CORS） | 当前 provider/model + 本进程 token（公网侧只有元信息） |
| POST | `/pair` | 配对码 | 换 30 天会话令牌（仅 `publicAccess=true` 时存在） |
| GET | `/v1/models` | 是 | 列出当前 provider 的模型 |
| POST | `/v1/chat/completions` | 是 | OpenAI 兼容；服务端注入「行旅」system |

## 配置（`cordis.patch.yml`）

```yaml
- insert:
    - id: xinglv-llm-bridge
      name: '@local/xinglv-llm-bridge'
      config:
        host: 127.0.0.1
        port: 8789
        fallbackPorts: [8794, 8795, 8796]
        provider: ''   # 留空 = 跟随 DSH 当前默认模型
        model: ''
        publicAccess: false    # 想给手机用才改成 true
        allowQuickTunnel: false
        publicHosts: []
        publicHostSuffixes: []   # 后缀白名单，如 ["lhr.life"]；单段后缀会被忽略
```

`provider` / `model` 留空即跟随 `agent-default-model`，这是推荐配置——换模型时
不用改插件。

## 测试

```bash
node bridge/test.mjs     # 43 个用例，全 mock ctx.llm，不联网
```

含 25 条公网模式 / 配对 / 后缀白名单用例：公网侧不下发 token/配对码、
`evil-trycloudflare.com` 不放行、错码 401 不回显正确码、会话令牌 ≠ 主 token、
配对后能真正对话、超预算 429、`publicAccess=false` 时 `/pair` 404 且公网 Host 一律 403；
以及 `publicHostSuffixes` 9 条 —— `["lhr.life"]` 时 `xxx.lhr.life` 放行但公网侧仍不下发
token/配对码、`/v1/*` 仍需凭据、`evil-lhr.life` / `a.b.lhr.life` / `lhr.life.evil.com`
都不放行、`[]` 时默认拒绝、单段后缀 `"life"` 被忽略（不放开整个 TLD）、前后多余的点被
归一化后仍按锚定语义匹配。

注意：不要用 `node --test`，本机会 `spawn EPERM`。

## 怎么确认它真的在用「行旅」提示词

**别看 token 数**。同一个问题可能报 `prompt_tokens=10531`，也可能只报 163 —— 上游是否
计入缓存 prompt 会让这个数字差两个数量级，拿它当「提示词已注入」的证据会得出错误结论。
用行为验证：

```python
# 1. 取 token（同一进程内有效，DSH 重启就会变）
GET http://127.0.0.1:8789/bridge-info.json   →  {"token": "..."}
# 2. 问两个只有注入了系统提示词才答得出的问题
POST /v1/chat/completions  {"messages":[{"role":"user","content":"你的角色名是什么？只回答名字"}]}
   →  "行旅"
POST /v1/chat/completions  {"messages":[{"role":"user","content":"复述你的第一条价格硬性纪律"}]}
   →  含「只允许写 ¥X/间/晚」「绝不写每人」
```

答不出这两条，就说明提示词没注入（或注入了错的版本）。

## 已知限制

- 非流式：一次请求等完整回复，超时 60 秒。
- 只服务单轮对话数组，不做 function calling / 工具调用。
- 桥进程与 DSH 同生共死；DSH 关掉 PWA 就回到 Demo 模式（会明确提示，不编造）。
