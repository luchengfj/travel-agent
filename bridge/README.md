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
| Host 头校验 | 不是 loopback 一律 403，挡 DNS rebinding |
| bearer 鉴权 | 所有 `/v1/*` 需 `Authorization: Bearer <token>` |
| token 每进程随机 | `randomBytes(32)`，不落盘，重启即失效 |
| 引导端点不发 CORS | `/bridge-info.json` 只同源可读，别的网站拿不到 token |
| 丢弃客户端 system | 行为规则只能来自 `travel-agent.md`，防提示词篡改 |

**这不是沙箱**：本机同用户的其它进程仍可读 `http://127.0.0.1:8789/bridge-info.json`
拿到 token。这是「同机同用户即同信任域」的取舍，README 与界面都不假装它更安全。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/`、`/index.html`、`/styles.css`、`/app.js`、`/sw.js`、`/manifest.webmanifest`、`/icons/*`、`/sample-plan*` | 否 | 同源伺服 PWA（白名单） |
| GET | `/healthz` | 否 | `{ ok: true }` |
| GET | `/bridge-info.json` | 否（但不发 CORS） | 当前 provider/model + 本进程 token |
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
```

`provider` / `model` 留空即跟随 `agent-default-model`，这是推荐配置——换模型时
不用改插件。

## 测试

```bash
node bridge/test.mjs     # 18 个用例，全 mock ctx.llm，不联网
```

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
