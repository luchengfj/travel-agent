# 🧭 旅行规划 Agent

一个部署在 **Cloudflare Workers** 上的旅游 Agent：聊天输入需求 → 实时生成每日行程 + 真实价格（机票 / 酒店 / 景点门票 / 火车票），价格卡片均标注来源。

## 工作原理（三步流水线）

1. **理解需求**：LLM 从对话提取结构化参数（出发地/目的地/日期/人数/预算/偏好），信息不足会先追问
2. **并行查价**（真实数据，全部标注来源）：
   - ✈️ 机票：Travelpayouts 实时最低价（Trip.com 等 OTA 报价源，含 Aviasales 预订链接）
   - 🚄 火车票：尝试直连 12306 公开接口（海外网络成功率低），失败自动降级为按里程的参考估算
   - 🏨 酒店：Wikivoyage 社区参考价（如"万豪 500-1300"）+ Booking 深链查实时
   - 🎟️ 门票：Wikivoyage 社区参考价（如"大足石刻 ¥120"）+ 携程深链购票
   - > 说明：Amadeus 自助注册已关停、Hotellook 酒店 API 已于 2025-10 下线，真正的秒级实时房价/门票需要 B2B 签约（ETG / GetYourGuide）；本项目的参考价来自 Wikivoyage 社区维护的结构化数据，真实但可能滞后，UI 均标注"参考价"。
3. **生成攻略图**：LLM 输出结构化行程 JSON（时间段/地点坐标/费用/来源），前端渲染：
   - 逐日时间轴（每段含时间、地点、交通、费用与来源徽章）
   - Leaflet 路线地图（按天标色连线，底图 © OpenStreetMap）
   - **实景图片**：`/api/img` 服务端代理抓取 Wikimedia Commons（地理检索优先，Wikidata 实体主图兜底），KV 缓存 24h——用户浏览器无需直连 Wikimedia，国内可正常加载
   - 价格汇总表 + 预订建议，支持打印/PDF、下载攻略 HTML、复制 Markdown

LLM 默认用 **Cloudflare Workers AI**（免费额度，无需额外 Key）；也可以配置任意 OpenAI 兼容接口（智谱 GLM / DeepSeek 等）。

## 本地运行

```bash
cd travel-agent
npm install
npm run dev        # http://localhost:8787
```

> 本项目本机已配好便携版 Node（`C:\ai\tools\node-v22.23.5-win-x64`），在新终端里先：
> `export PATH="/c/ai/tools/node-v22.23.5-win-x64:$PATH"`（Git Bash）

本地 `npm run dev` 要使用 Workers AI，需要先登录一次 Cloudflare：

```bash
npx wrangler login      # 浏览器跳转授权（就是你已打开的 Cloudflare 账号）
```

不登录也可以跑 UI 和接口框架，但生成行程会提示"AI 服务不可用"。

## 配置 Travelpayouts（机票实时价，推荐）

Amadeus 自助注册已于 2026 年 7 月关停，现用 **Travelpayouts**（Aviasales 联盟网络）获取真实机票报价：

1. 注册 https://www.travelpayouts.com （免费，需填一个网站地址，可用本站 URL）
2. 完成首次引导（会要求把一段脚本加到网站验证——已内置在 `public/index.html`，不想参与返佣可验证完成后删除该行）
3. 后台 → **Account → Profile → API token** 复制 Token
4. 线上：`printf "<你的Token>" | npx wrangler secret put TRAVELPAYOUTS_TOKEN`
5. 本地：`.dev.vars` 里加 `TRAVELPAYOUTS_TOKEN=<你的Token>`

效果：机票卡片显示**实时最低价**（数据源 Trip.com 等 OTA），来源徽章"实时 · Travelpayouts"，每张卡带 Aviasales 预订链接（走你的联盟 ID，有订单还能返佣）。返程会单独给出最低参考价。酒店实时 API（Hotellook 签名版）已下线，酒店保留估算 + Booking 深链。

## 部署到 Cloudflare

```bash
npx wrangler login                                  # 首次
npx wrangler kv namespace create CACHE              # 创建缓存 KV，把输出里的 id 填进 wrangler.jsonc 并取消 kv_namespaces 注释
npx wrangler secret put AMADEUS_CLIENT_ID           # 可选
npx wrangler secret put AMADEUS_CLIENT_SECRET       # 可选
npm run deploy
```

部署完成后会得到 `https://travel-agent.<你的子域>.workers.dev` 公网地址。

## 部署到 ALTAR（24 小时 Node 服务）

项目里自带零依赖 Node 入口 `server.ts` 和 `Dockerfile`，与 Worker 版共用同一套代码。三种方式任选：

1. **Docker 镜像**：新建应用 → Docker 镜像 → 用本目录构建的镜像（`docker build -t travel-agent .`），端口 `8080`
2. **GitHub**：把仓库推到 GitHub，新建应用 → GitHub → 选仓库，启动命令 `node server.ts`（Node 22+ 运行时）
3. **编程语言运行时**：选 Node.js 运行时，上传/指向本目录，启动命令 `npm start`

ALTAR 环境变量（必填 `LLM_API_KEY`，因为 Node 模式没有 Workers AI）：

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_API_KEY` | **是** | OpenAI 兼容接口 Key，如智谱 GLM |
| `LLM_BASE_URL` | 建议 | `https://open.bigmodel.cn/api/paas/v4`（GLM） |
| `LLM_MODEL` | 建议 | `glm-4-flash`（免费）或其他 |
| `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` | 否 | Amadeus 免费 API |
| `PORT` | 否 | 默认 8080（ALTAR 分配的端口） |

## 环境变量 / Secrets

| 变量 | 必填 | 说明 |
|---|---|---|
| `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` | 否 | Amadeus 免费 API；不配则相关报价跳过 |
| `LLM_API_KEY` | 否 | 配了就走 OpenAI 兼容接口，替代 Workers AI |
| `LLM_BASE_URL` | 否 | 如 `https://open.bigmodel.cn/api/paas/v4`（智谱 GLM） |
| `LLM_MODEL` | 否 | 如 `glm-4-flash` |

## 接口

- `GET /api/health` — 服务状态（Amadeus 是否配置、LLM 模式）
- `POST /api/plan` — `{ "messages": [{ "role": "user", "content": "..." }] }`，返回 SSE 流：
  `step`（执行步骤）→ `prices`（价格卡片）→ `itinerary`（行程 Markdown）→ `done`

## 已知限制（如实说明）

- Amadeus **测试环境**是抽样真实数据：国际主流航线/城市覆盖好，国内航班酒店覆盖有限，查不到时会明确提示而不是编造
- 12306 无官方公开 API，从海外服务器直连常被拦：火车票大多走"里程估算"回退，UI 标注"估算"
- Workers AI 免费额度（10k neurons/天）足够开发与轻度使用
- 不提供支付/预订下单，价格仅供决策参考
