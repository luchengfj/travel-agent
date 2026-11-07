# 行旅 PWA（前端）

手机浏览器里「随时能调用」的旅行规划智能体前端。**零构建、零第三方运行时依赖**，纯静态文件，可直接被 GitHub Pages 托管，也可「添加到主屏幕」当 App 用。

## 两种模式

| 模式 | 触发 | 行为 |
|---|---|---|
| **在线** | ⚙ 设置里填了 Worker 地址 | 对话经你自己的 Cloudflare Worker 转发到真实 LLM；`travel-agent.md` 由 Worker 注入 system prompt |
| **Demo** | 未填 Worker 地址 / 离线 | 展示仓库里**已核实、已上 CI 的静态成品**（`sample-plan.md` + 图卡），明确标注「样例，非本次生成」，**绝不编造**一份像样的计划 |

离线时 Service Worker 缓存 App 外壳与静态样例，可打开界面、回看历史；`/api/chat` 一律 network-only，离线不会伪造 LLM 回复。

## 文件

- `index.html` 结构：顶栏 / 常驻免责声明 / 对话区 / 输入区 / 设置面板 / 历史抽屉 / 样例画廊
- `styles.css` 移动端优先，复用图卡色板（`#FBF8F2` `#1E3A34` `#C8553D` `#C89B3C` `#5B7C99`）；管道表格在手机上横向滚动、长回复折叠、`(当前：plan)` 外壳高亮
- `app.js` 对话收发 / 极简 Markdown 渲染（标题·管道表格·粗体·列表·⚠️ 引用）/ 历史(localStorage) / 设置(Worker URL 存本机) / Demo / 生成中态与错误处理
- `manifest.webmanifest` `display: standalone`、`theme_color: #1E3A34`、192/512 图标
- `sw.js` 预缓存 App 外壳 + 样例；版本号手动 bump
- `icons/` PWA 图标
- `sample-plan.md` / `sample-plan-card.png` 从 `examples/perfect-trip.md` 与图卡复制来的静态成品

## 本地试跑

在本目录起任意静态服务器（SW 需要 http(s)，`file://` 不行）：

```
cd app
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

未填 Worker 地址时自动进 Demo 模式，可点「查看完整样例成品 + 图卡」。

## 连真实 LLM

1. 部署后端 `worker/`（见 `worker/README.md`），拿到 `https://xxx.workers.dev`
2. 打开 App → ⚙ → 填这个地址 → 「连接并保存」（只存本机 localStorage，不写死在代码/仓库）
3. 发一句「广西 3 天 2 夜，2 人，预算 3000 总共」，验证首轮 `(当前：plan)` + ≤3 问、三档骨架、逐日表、⚠️ 待核实清单

## 安全与边界

- **前端不含任何 API Key、不硬编码 Worker 域名**；Key 只在 Worker secret 里
- 常驻免责声明：AI 生成，价格 / 政策 / 班次以官方核实为准；本版未接实时房价 / 天气工具
- v1 不做：function-calling 工具、LLM 现场生成 HTML 图卡（渲染器依赖本机 Windows Edge，云端跑不了）、流式输出、用户登录 / 云同步、原生微信小程序、行为自动判分
- 静态一致性（prompt.js 与提示词是否同步、manifest 是否合法、有无凭据泄漏）由仓库根 `examples/regress.py` 的 `[K]` 门禁覆盖
