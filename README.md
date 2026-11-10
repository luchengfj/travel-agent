# 行旅 · Travel Agent

> **仓库地址**：https://github.com/luchengfj/travel-agent （public，分支 `main`）

一个「用真实翻车事故喂大」的中文旅行规划 Agent 提示词工程。它不是一段提示词，
而是一套 **提示词 + 图卡渲染器 + 实时取数脚本 + 回归基准** 的小型软件系统。

> 核心方法论：先实测再下结论（且敢推翻自己上一轮的结论）· 把每次翻车变成可重跑的断言 ·
> 查不到就如实标注，不编一个像样的数字。

---

## 仓库结构

```
.
├── travel-agent.md              # 主提示词（460 行 / 20 章节 / 21 条硬规则）
├── AGENT-解析.md                # 全解析：逐节拆解 + 翻车点地图 + 已知边界
├── AGENTS.md                   # 给接手 Agent 的工作区指引（唯一真值源 / 硬边界 / 怎么加检查）
├── .github/workflows/regress.yml # CI 门禁：push / PR 自动跑静态回归
├── .github/workflows/deploy-pages.yml # GitHub Actions 部署 Pages（只发布 app/）
├── .gitignore
├── cardtest/                    # 图卡渲染 + 实时取数
│   ├── shot.py                  # HTML+CSS → 无头 Edge 截全页 → Pillow 自动裁白边
│   ├── ledger.py                # spend 记账内核（PLAN 唯一真值源 / compute / render_spend）
│   ├── ledger-golden.json       # 记账内核的 golden 夹具
│   ├── hotel_price.py           # 免登录 SSR 抓 trip.com 实时房价（支持 city / zone）
│   ├── *.html                   # 各张卡片的排版源码
│   ├── *.png                    # 渲染产物（2160px 宽 2 倍图）
│   └── *-prices-*.json          # 实测房价快照
├── app/                         # 手机 PWA（零构建纯静态，GitHub Pages 托管）
│   ├── index.html / styles.css / app.js / sw.js / manifest.webmanifest
│   ├── icons/                   # 192 / 512 PWA 图标
│   └── sample-plan.md / sample-plan-card.png   # Demo 模式的已核实静态成品
├── worker/                      # Cloudflare Worker：LLM 代理（API Key 只在 secret）
│   ├── src/index.js             # /api/chat，前置注入 system=travel-agent.md
│   └── src/prompt.js            # build-system-prompt.mjs 生成的提示词副本
├── bridge/                      # 本机模型桥：DSH 宿主内插件，用「当前 LLM」且不需任何 Key
│   ├── index.js                 # ctx.llm.stream() → OpenAI 兼容 /v1/chat/completions，同源发 app/
│   ├── cordis.patch.yml         # 插件注册（127.0.0.1:8789 + 兜底端口）
│   ├── test.mjs                 # 离线单测（mock ctx.llm，43 条）
│   └── locale/ + icon.svg + README.md  # 显示元数据（官方清单硬要求）
├── tools/build-system-prompt.mjs # 幂等构建：travel-agent.md → prompt.js
├── tools/tunnel.mjs             # 一条命令：起公网隧道 + 实测 /healthz + 打印手机地址与配对码
├── examples/                    # 回归基准
│   ├── README.md                # 怎么跑回归 / 判定标准 / 历史翻车点
│   ├── guilin-example.md        # plan 全流程（4 天 3 晚）
│   ├── hangzhou-example.md      # deal / prep / ontrip / review 四模式
│   ├── team-example.md          # 多角色冲突裁决
│   ├── bangkok-example.md       # 境外变体（签证 / 汇率 / 时差 / 现金门槛）
│   ├── facts.json               # 易过期事实台账（claim + verified_on + source_url）
│   ├── cases.json               # 行为回放用例（不判分只留痕）
│   ├── replay.py                # 行为回放操作卡：list / prompt / trace
│   ├── regress.py               # 一次性静态自检脚本（PASS 253 / FAIL 0）
│   └── report.md                # 最近一次回归报告
├── hangzhou-5d-budget.md        # 杭州 5 天预算原始底稿
├── perfect-trip-card.png        # 桂林阳朔 3 天 2 夜「完美攻略」成品卡
├── guilin-card.png              # 桂林 4 天 3 晚卡
├── guilin-3d2n-card.png         # 桂林 3 天 2 夜卡（回填了真实房价）
├── guilin-spend-card.png        # 消费记录卡（空白模板）
├── bangkok-card.png             # 曼谷 4 天 3 晚「境外卡」样板（5 个固定附加块）
├── hangzhou-card.png            # 杭州 plan 卡
├── hangzhou-{deal,prep,ontrip,review}-card.png
└── ...
```

## 快速开始

### 1. 当 Agent 用
把 `travel-agent.md` 全文作为 system prompt 喂给模型。它会首轮标 `(当前：plan)`、
问 ≤3 个带默认值的问题、出「省钱 / 均衡 / 深度」三档、逐日表格、图卡与待核实清单。

### 2. 验「改完没退化」
```bash
cd C:/ai/agent
PY="C:/Users/cheng/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/python/python.exe"
PYTHONIOENCODING=utf-8 "$PY" examples/regress.py --report
```
退出码 `0` = 全绿 / `1` = 有 FAIL。Windows 必须带 `PYTHONIOENCODING=utf-8`（GBK 编不了报告里的 ✅/❌）。

### 2b. CI 自动门禁（.github/workflows/regress.yml）
`regress.py` 纯标准库、零依赖、不联网、不调 LLM、不渲染，所以直接搬进了 GitHub Actions：
- `on: push(main) / pull_request` → `actions/setup-python@3.11` → `python examples/regress.py`（退出码即门禁）；
- `if: always()` 再跑一次 `--report`，把 `examples/report.md` 存成 artifact，失败也能看到是哪条断言红了；
- workflow 本身只用 `contents: read`，无 secret、无写权限。

它把「改完提示词记得跑一条」从**人记得**变成**仓库强制**，也把刚加的 [D] 断言自检放到了每次 push 上——
谁误删了一条防复发正则，CI 立刻红。注意边界不变：**静态全绿 ≠ 行为没退化**（见下节），
逐轮行为对照、图卡像素级目检、实时数据现查仍需人工；脚本刻意不联网，避免外部数据源抖动把 CI 变红。

### 3. 让手机用上「当前 LLM」
```bash
cd C:/ai/agent
"C:/Users/cheng/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/node/bin/node.exe" tools/tunnel.mjs
```
它做四件事：检查桥活着 → 起 cloudflared quick tunnel（**必须** `--protocol http2`）→
实测公网 `/healthz` 真的返回 200（拿到域名 ≠ 能用）→ 打印手机地址 + 6 位配对码。
手机打开那个地址 → 右下 ⚙ → 输入配对码，之后这台手机就能用你电脑上 DSH 的当前模型。

两条如实说明：域名是临时的（隧道重启就换）、配对码每个 DSH 进程随机（重启就变）。
要固定域名得走 Cloudflare Dashboard 出 token，见 `bridge/README.md`「公网模式」。

### 4. 渲一张卡
```bash
cd C:/ai/agent/cardtest
"$PY" shot.py guilin3d2n.html "C:/ai/agent/cardtest/guilin3d2n.png" 1080
```

### 5. 查实时房价（免登录、免账号、不撞 2FA）
```bash
cd C:/ai/agent/cardtest
"$PY" hotel_price.py --city 871 --zone 4532 \
  --checkin 2026-12-01 --checkout 2026-12-03 --curr CNY --json out.json
```
`--city 871` = 阳朔，`--zone 4532` = 西街商圈。换日期价格会变，非静态缓存。

---

## 能力边界（务必如实标注）

- **静态全绿 ≠ 行为没退化**：`regress.py` 只做静态结构 + 算术重算 + 基准完整性 + 断言自检 + 事实台账 + 卡片静态健全 + 价格快照交叉 + 出境卡附加块 + 记账内核 + 行为回放用例 + 应用一致性(PWA/Worker) + 本机模型桥，不调 LLM、不渲染、不查实时数据。逐轮行为、图卡目检、实时数据现查仍需人工对照。
- **房价只到城市 / 商圈粒度**：能拿「阳朔西街 12 家 ¥80–479 / 中位 ¥171」，不能定位具体某店的可下单价。SSR 是约 12 条/页的快照，**非可下单承诺价**，下单前必须重读。
- **天气窗口外只能给气候常态**：工具实测只覆盖 7 天，更远的行程标「历史同期，非实时预报」并给复核提醒。
- **图卡自检依赖模型视觉能力**：无视觉能力时走「尺寸 / 内容 / 溢出」三项结构化校验，并明说「未做像素级目检」。
- **金额多为混合口径**：历史账单均值（±20%）、估算、合理偏保守基准并存，页脚必须写清来源与误差。

## 设计铁律（踩坑换来）

基准样例文件的职责就是**记录** bug，对基准全文做「错值必须缺席」在原理上不成立
（首跑 7 个假 FAIL 里 5 个由此而来）。因此：
- 基准样例 → 只断言「正确值必须出现」+「bug 记录区还在」；
- 干净交付物（`cardtest/guilin.html`、`cardtest/guilin3d2n.html`、`cardtest/bangkok.html`、`cardtest/guilin-spend.html`、`travel-agent.md`）→ 才做「错值缺席 / 修复项在场」。

注意 `travel-agent.md:30` 的 `¥168/人` 是**故意的反例说明**，缺席清单绝不能含它。

**2026-11-04 补的覆盖缺口**：3 天 2 夜卡此前完全不在 `CLEAN_FILES` 里——它最新、
最复杂，且刚修过 flex 空白、返程漏算、天数写错三类问题，改坏了脚本一个都查不出来。
现已纳入 15 条断言（kicker 天数、三处同步、`不写「已计入」`、`align-items:flex-start`、
免登录 SSR 与气候常态标注等），并用「故意注入 `3 DAYS 3 NIGHTS` → 必须 FAIL 2 / exit 1 →
还原 → exit 0」反向验证过断言真的有效。PASS 50 → 65。

**2026-11-05 补的第二层缺口：断言自己没人测**。上面 15 条防复发断言写进 `CLEAN_FILES` 后，
如果某条正则被改坏（写死字符、转义错、误删），bug 真复发时脚本照样全绿——「有断言」不等于
「断言活着」。现新增 **[D] 自检**：`SELFTEST` 给每条 `absent` 断言配一个内存里的「错值样例」，
`check_self()` 校验 ①配置规模（4 基准 / 3 干净交付物）②文件真实存在且断言数 > 0 ③每条
断言都有活体样例 ④`has(sample, pat)` 真能命中。反向验证：把 `3 DAYS 3 NIGHTS` 的正则改成
`3 DAYS [Z]3 NIGHTS` → 自检准确报「断言失效：正则认不出自己的错值样例」、exit 1；字节级还原
→ exit 0。**PASS 65 → 88**（新增 23 条）。

**2026-11-05 补的第三层缺口（PASS 88 → 157）**：CI 只在门禁上跑，断言覆盖不到的地方照样会烂。
新增三层、69 条断言，全部静态可验、跨平台、不依赖凭据/LLM：
- **[E] 事实台账 `examples/facts.json`**：11 条易过期事实（政策生效日 / 12345 并入 / 汇率 / TDAC 窗口 / city id / 商圈 id / 高铁价）
  各带 `verified_on` + `source_url` + 复核周期；脚本逐条核对 claim 仍在声明的文件里。过了复核期只报 INFO 提醒，不把 CI 变红。
- **[F] 卡片静态健全**：此前 `CLEAN_FILES` 只盯 3 个文件，8 张入库卡里 5 张改坏了脚本照样全绿。
  现对全部卡断言基础色板 / 强调色 ≥2 / DOCTYPE / charset，并抽出通用规则 **kicker 的 DAYS = NIGHTS + 1**（不再只修具体字符串）。
- **[G] 价格快照交叉**：三个价格 JSON 补 `fetched_at`（生成器 `hotel_price.py` 同步写采集时间，历史快照诚实标注「补录、仅到日」）；
  脚本按快照统计值生成「每晚 ¥110–952，中位 ¥332」这类句子再去提示词里找，两边数字对不上就 FAIL。
反向验证三处都通过：改事实 claim / 改 `4 DAYS 3 NIGHTS`→`4 DAYS 4 NIGHTS` / 改提示词中位 ¥332→¥999，各 exit 1 且准确命中对应检查项，还原 exit 0。
另新增 `AGENTS.md` 给接手者写清唯一真值源、硬边界、加检查必须反向验证、推送走 SSH。

**2026-11-06 补的第四层缺口（PASS 161 → 182）**：出境卡「5 个固定附加块」此前只写在
`travel-agent.md:396-401`，从没有任何渲染卡、回归也只在提示词文本里 grep 关键词（A4）——
规格写了产物没跟上。现新增 `cardtest/bangkok.html`（曼谷 4 天 3 晚境外卡样板）与 **[H] 出境卡**：
- 5 个附加块逐块验必备文本（kicker 天数 / 汇率行带采集日期 / 入境登记 TDAC 时间窗 /
  现金门槛「只认现金」/「不适用游客」政策陷阱与「谁有资格」）；
- 大数字 `3,072` / `6,144` 用紧贴 DOM 的 `>3,072<` / `>¥6,144<` 与基准样例交叉，
  防止卡里某处备注残留同数字就让大数字改错也全绿；
- 4 条「错值必须缺席」放进 `CLEAN_FILES` 由 [D] 的 `SELFTEST` 做活体测试；
- 反向验证 4 处故障注入（改 kicker / 删只认现金 / 改两个大数字）各 exit 1 且准确命中、还原 exit 0。
顺带把 `shot.py` 的渲染高度做成第 4 个参数可覆盖（`shot.py <html> <png> 1080 6000`），
根治反复出现的「高卡页脚被 --screenshot 裁掉」。**共 +21 条断言**。

**2026-11-07 补的第五层缺口（PASS 182 → 209）：一处空头承诺收口 + 行为层可观测性**。
盘点发现 `travel-agent.md:201,273` 与 `cardtest/guilin-spend.html` 都承诺「说『记一笔 ¥XX 项目』
就自动追加一行、自动更新对账」，但仓库里根本没有记账逻辑——spend/review 两模式只在纸面成立。
本轮补三件、全部静态可验、跨平台、不依赖凭据/LLM：
- **[I] 记账内核 `cardtest/ledger.py`**：兑现承诺。`PLAN` 是计划额唯一真值源
  （交通 1102 / 住宿 1008 / 餐饮 650 / 门票 400 / 市内交通 240 = 3400）；
  `add_entry(..., *, amount, ...)` 的 `amount` **必填无默认值**，从接口杜绝替用户编金额；
  `compute()` 纯函数算各类目已花/差额；`render_spend(空账本)` 生成空白模板态 HTML。
  顺带修掉 `guilin-spend.html` 一个真 bug：旧卡计划额写成 780/510/300=¥3,700（人均 1850），
  与基准 ¥3,400（人均 1700）和卡头「¥1,700/人」自相矛盾，现由生成器统一产出。
  `[I]` 直接 `compile()` 源码调用 `compute()` 与 `ledger-golden.json` 的 3 笔演示账对账，
  并断言「入库卡 == render_spend(空)」——改 PLAN 会自动同步三处。
- **[J] 行为回放「不判分只留痕」`examples/cases.json` + `replay.py`**：把 5 个基准的复现输入
  固化成用例，`replay.py list/prompt/trace` 生成带时间戳的逐轮留痕供**人眼 diff**。
  **刻意不给 PASS/FAIL**：行为层非确定性，脚本自动判分只会制造假绿灯。`[J]` 只验 cases 结构
  （schema/用例数/source 指向存在/字段齐全/「不判分」声明还在），把行为对照诚实地留给人。
- 6 处故障注入（spend 卡旧错值 / PLAN 漂移 / golden 改数 / cases 引用失效 / 丢「不判分」/
  replay.py 操作卡丢失）各 exit 1 且准确命中、还原 exit 0。反向验证还抓到并修掉一个真弱点：
  `check_ledger()` 原用 `importlib` 会读 `__pycache__` 旧 `.pyc`（等长数字改回命中缓存）产生假 FAIL，
  现改成从源码字节 `compile()`，注释写明「回归断言必须只信当前源码字节，不能信任何缓存」。


**2026-11-07 补的第六层缺口（PASS 209 → 229）：把提示词做成随时可调用的手机 PWA**。用户要「旅行智能体做成小程序，随时能做旅游计划」，遂按已批准的方案落地三层：
- **`app/` 手机 PWA（零构建零依赖，GitHub Pages 托管）**：对话收发、极简 Markdown 渲染、历史 localStorage、Service Worker 离线开外壳、安装到主屏幕；**Demo 模式**用已核实静态成品（明确「样例，非实时生成」），未配 Worker / 离线时**绝不针对本次输入编造计划**。
- **`worker/` Cloudflare Worker**：`POST /api/chat` 剥掉客户端伪造的 system、前置注入 `travel-agent.md` 全文、Origin 白名单、限长限轮数，`LLM_API_KEY` 只放 Authorization 头且统一 `{error}` 不回显密钥；前端/仓库/CI 日志 0 命中。
- **`tools/build-system-prompt.mjs` + `[K]` 应用一致性门禁**：`prompt.js` 是提示词的生成副本，改了 `travel-agent.md` 忘了重跑 builder 就会让线上行为与基准脱节。`[K]` 逐字节比对两者、验应用骨架齐全 / manifest 合法 / SW 缓存清单 / 凭据正则活体样例 / 运行时 0 密钥。5 处故障注入（提示词漂移 / 塞假 key / 删 manifest 键 / 删 SW 缓存项 / wrangler 写密钥）各 exit 1 且准确命中、还原 exit 0。**共 +20 条断言**。
> 部署需用户一次性操作：Cloudflare 建 Worker / `wrangler secret put LLM_API_KEY` / 仓库 Settings 把 Pages Source 设为 **GitHub Actions** / 手机 Settings 填 Worker URL。脚本与文档不能代做，已在 `app/README.md`、`worker/README.md` 写全步骤。

**2026-11-08 补的第七层（PASS 229 → 240）：让 PWA 直接用「当前 LLM」，不需要任何 API Key**。
上一层的 Worker 方案有个绕不过的短板：得自己准备 LLM Key、自己付额度、手机上还得填地址。
用户要的是「连到我现在这个 Agent」。做法与三条关键结论：
- **外部进程认证不了宿主的 loopback shim**：`dsh-connect-workbuddy` 的 bearer 是
  `randomBytes(32)` 进程内随机、从不落盘（`bearerOk` 用 `timingSafeEqual` 比对），
  唯一暴露点是 `token: () => SHARED_SECRET`，只给宿主内的 pi-ai 适配器用。
  查到的 `~/.dsh/openai-gateway/api-key` 是 13 天前某个市场插件留下的过期凭据，不是它。
- **唯一受支持的路子是宿主内插件**：`bridge/` 用 `ctx.llm.stream()` 跑当前适配器
  （复用 provider/model/额度/重试/计量），对 `127.0.0.1:8789` 暴露 OpenAI 兼容接口。
- **必须同源发页面**：https 的 GitHub Pages 页访问不了 http 的 `127.0.0.1`
  （混合内容 + Private Network Access），所以桥自己伺服 `app/`，前端是
  「本机桥 > Worker > Demo」三态。
- `[L]` 桥一致性门禁（24 条）：提示词与 `[K]` **同源**（都从 `worker/src/prompt.js` 读，
  不出现第二份真值源）、`cordis.patch.yml` 与 `index.js` 端口不得漂移、
  六个安全件（Host 校验 / bearer / 随机 token / 丢弃客户端 system 等）必须全在、
  locale 元数据非模板、桥源码 0 密钥、前端三态与优先级、SW 把新接口排除缓存。
- **反向验证抓到 3 个真问题**（都是断言/验证器自身不合格，不是桥的 bug）：
  ① FAIL 行是 `- ❌` 开头，用 `startswith("❌")` 解析永远得到 0 条 → 反向验证变成假绿；
  ② 「桥优先」原用整文件正则，`sendToBackend` 里另一个 `if (bridge)` 就能充数
     → 改成只在 `updateMode()` 函数体内找；
  ③ SW 守卫原查「文件里出现过路径」，而注释里也写了一遍 → 改成查 `endsWith("...")` 实调用。
  修后 5 处故障注入各 exit 1 且准确命中、字节级还原 exit 0。
- 端到端实测：真浏览器点发送 → 回复是「行旅」标准 plan 结构（模式标签 / 一句话结论 / ≤3 问 /
  三档承诺）。**提示词是否真的注入，用行为验证而不是 token 数**：问「你的角色名是什么」
  答「行旅」；问「复述你的第一条价格硬性纪律」能准确答出「只允许写 `¥X/间/晚`，
  绝不写每人」。这一条是修出来的——最初拿 `prompt_tokens=10531` 当证据，后来同一问题
  只报 163～172（上游会计入/不计入缓存 prompt），说明**token 数不是可靠判据**，
  改成行为验证后才真正证明注入生效。
  目检还抓到一处自相矛盾：桥连通时横幅仍写「Demo 模式：没连 LLM」，与顶栏
  「模式：本机 deepseek-v4.1-flash」打架 —— 已修，并把 `CACHE_VERSION` 升到 `xinglv-v3`
  （否则 SW 的 stale-while-revalidate 会继续吐旧 `app.js`，第一次重截图的 sha256 完全没变就是证据）。

**2026-11-09 补的第八层（PASS 240 → 247）：让手机也能用 —— 公网隧道 + 配对码**。
上一层的桥只绑 `127.0.0.1`，手机访问不到（这是当时如实说明的限制）。第八层把它打开：

- `cloudflared` quick tunnel 实测能注册（`protocol=http2`；默认 QUIC 在本机出站被挡，
  precheck 报 `Allow outbound QUIC traffic on port 7844 or use HTTP2`），公网域名经隧道
  落到本桥。第一次跑返回 **403 `Host header must name the loopback interface`** ——
  也就是**隧道本身是通的，唯一阻塞是桥自己的 Host 校验**。
- 于是改两件事，缺一不可：
  1. **Host 白名单**：只有 `publicHosts` 里显式列出的域名、或开了 `allowQuickTunnel` 时
     匹配 `^[a-z0-9-]+\.trycloudflare\.com$`（**精确一层子域**，防 `evil-trycloudflare.com`）
     才放行。光把「非 loopback 就拒」改成全放行，等于把服务交给任何会构造 Host 头的人。
  2. **主 token 绝不出公网**：公网侧 `/bridge-info.json` 只回元信息 + `auth:'pair'`，
     **不下发 token、更不下发配对码**。手机先拿 6 位**配对码**调 `POST /pair` 换**会话令牌**
     （30 天 TTL，进程重启全失效）；配对码由 `randomInt(0,1000000)` 生成，只出现在
     **loopback 的 `/bridge-info.json` 和宿主日志**里 —— 即「只能从电脑上看到」。
     配对失败有滑动窗口预算（10 分钟 10 次 → 429），否则 10^6 的码空间几分钟就被穷举。
- 前端从三态扩成四态：**本机直连 > 已配对 > 待配对 > Worker > Demo**。手机未配对时
  明确说「输入配对码」，不再谎称在线也不退化成 Demo。
- `publicAccess` 默认 `false`，关掉即完全退回「只认 loopback」，与原行为一致。
- **端到端实测（经真实公网隧道）**：公网 `/bridge-info.json` 无 token/无配对码 → 静态
  PWA 外壳 6 个文件全 200 → 错码 401、正确码换到 43 字符会话令牌 → 用会话令牌
  `/v1/models` 200 → `POST /v1/chat/completions` 问「只回答两个字：收到」得 **`收到`**
  （`model=deepseek-v4.1-flash`）→ 行为验证问角色名答 **`行旅`**（提示词确实注入）。
  无凭据仍 401。`bridge/test.mjs` 当时 **PASS 34 / FAIL 0**（新增公网用例 16 条；
  后续第九层补到 43 条）。
- **`[L]` 从 11 条扩到 18 条**（当时文档写的是「16 条」，实测 `check_bridge()` 是 18 条 ——
  见第九层的计数订正），新增的里逐条点名的 5 条全是公网安全看门狗。反向验证又抓到
  2 个**我自己写弱了的断言**：① 「配对限流」原只查 `PAIR_MAX_FAILURES` 常量存在，
  把它改成 `1e9`（等于无限流）依然通过 → 补「数值必须落在 1–100」；
  ② 同一条只查常量名，删掉真正的 429 分支也不报 → 补「比较式 + 429 实调用」。
  这说明**断言只查「名字在不在」几乎总是假的**。

**2026-11-09 补的第九层（PASS 247 → 252，`[L]` 18 → 23）：隧道域名改成「后缀白名单」**。
第八层的 Host 白名单只能一个个域名写死 `publicHosts`，而 `cloudflared` 每次重启都换一个
随机域名（`xxxx.lhr.life`），写不过来。于是桥加了配置 `publicHostSuffixes`：放行
**恰好一层子域 + 指定后缀**的域名（写 `["lhr.life"]` 就放行 `xxxx.lhr.life`）。
安全上它比 `publicHosts` 更容易写错，所以 `[L]` 补了 5 条看门狗，加固轮再补 1 条（`escapeRegExp` 函数体）：

- **后缀白名单锚定**：`matchesHostSuffix()` 必须用 `^[a-z0-9-]+\.<转义后缀>$` 构造正则 ——
  即 `new RegExp(\`^[a-z0-9-]+\\\\.${escapeRegExp(suffix)}$\`)`，**函数体内不许出现裸
  `endsWith(suffix)`**。理由：`'evil-lhr.life'.endsWith('lhr.life')` 为真，裸后缀比对等于
  「谁能注册 `xxx.lhr.life` 谁就能冒充」；不过 `escapeRegExp` 则后缀里的 `.` 变通配、
  `xxx.lhrXlife` 也会放行。**注意这条必须只 grep 函数体**：文件里 :483 的注释正好写着
  「不用 `endsWith`」，整文件 grep 会把注释当代码（这条是踩过的假绿）。
- **后缀转义函数**：`escapeRegExp()` 的**函数体**必须转义全部正则元字符
  （`. * + ? ^ $ { } ( ) | [ ] \`）。调用点写着 `escapeRegExp(suffix)` 不代表它在真的转义：
  函数体被改成只转义斜杠，后缀里的 `.` 仍是通配，`abc.lhrxlife` 就能冒充 `abc.lhr.life`。
  **这条是第二轮注入抓出来的**（详见下方「加固轮」）。
- **后缀接进 Host 判定**：`isPublicHost()` 要在 `publicAccess` 总开关之后、`publicHosts`
  精确匹配之外，真的 `return matchesHostSuffix(name, guard.publicHostSuffixes)`；
  改成 `return false` 立刻 FAIL（光有漂亮函数、没人调用是典型的「实现存在但没接线」）。
- **后缀配置归一化**：`publicHostSuffixes` 读入后 trim / 小写 / 去首尾点，并被
  `/^[a-z0-9-]+(\.[a-z0-9-]+)+$/` 挡掉单段与非法项，结果进 `guard`。`["life"]` 这种单段后缀
  等于放开整个 `.life` TLD，必须被忽略。
- **默认留空**：`cordis.patch.yml` 里 `publicHostSuffixes` 默认 `[]`、且键**恰好出现一次**
  （YAML 重复键是 last-wins，第一处留空也能被后面的非空值绕过）—— 安全默认，
  要放行隧道必须显式填，用完清空。
- **判定器活体**：把正确实现和 8 个错值样例（裸 `endsWith` / `includes` 换皮 / 缺 `^` /
  缺 `$` / 没过 `escapeRegExp` / 多层 label 放行 / 不拦单段 / 命中却 `return false`）喂给同一个判定器，必须
  「好的判过、坏的全判死」。**没有这一条，判定函数本身写死也会显示全绿**。
- 反向验证：7 处注入（裸 `endsWith` / `${suffix}` 不转义 / 去掉 `$` / 删单段 skip /
  `isPublicHost` 不调用 / 过滤正则放宽 / yml 默认填 `[lhr.life]`）**各 exit 1 且只命中
  对应那一条**，还原后三份 bridge 文件 SHA256 逐一核对一致、再跑 exit 0（PASS 252）。
- **2026-11-10 加固轮（PASS 252 → 253，`[L]` 23 → 24）**：上面那 7 处注入都是
  「把代码改坏得很明显」，能接住不代表能接住**形状没变、语义已坏**的改法。于是又做了
  第二轮 8 处语义注入，**只接住 3 处**，暴露 4 个真实缺口（全是断言自己的问题，不是桥的 bug）：
  ① `if (pattern.test(name)) return true` 改成 `return false`（极性写反，等于永不放行）→ 仍全绿；
  ② `escapeRegExp` 函数体被换成只转义斜杠 → 仍全绿（只查了调用点字符串）；
  ③ `guard` 里 `publicHostSuffixes,` 被写成 `publicHostSuffixes: publicHosts,` → 仍全绿
  （只查了名字在不在 guard 块里）；
  ④ 后缀判定被提到 `!guard?.publicAccess` 之前（关掉公网也放行）→ 仍全绿（只查子串在不在，没查顺序）。
  修法：新增 `桥·后缀转义函数` 1 条（判 `escapeRegExp` 函数体的字符类 + 行为对拍，另带
  「只转义斜杠 / 只转义点」两个错值样例反查）；给锚定条补「命中必须 `return true`」、
  给接线条补「`publicAccess` 必须在 `matchesHostSuffix` 之前」、给归一化条补「guard 里必须是
  简写属性」。第三轮再补 4 处更刁的注入，又抓到 1 个绕过：**yml 里写第二个
  `publicHostSuffixes` 键**（YAML last-wins，第一处留 `[]` 就能骗过检查）→ 改成「键必须恰好出现一次」。
  最终 **19 处注入全部 exit 1 且只命中对应那条**（7 明显 + 8 语义 + 4 刁钻），
  每轮三份 bridge 文件 SHA256 核对还原一致，终态 exit 0（PASS 253）。
- **顺带订正一处文档账目**：文档此前写「`[L]` 16 条」，实测 `check_bridge()` 当时是 **18 条**
  （第八层实际加了 7 条而非 5 条，逐条点名的只有 5 条）。本轮按**实际计数**改为 18 → 23，
  不再沿用 16 这个错数；加固轮后按实际计数书写为 18 → 24。
- 同一轮 `bridge/test.mjs` 也补了后缀白名单用例，从 34 条涨到 **43 条**（`await test(` 计数，
  其中 9 条是 `publicHostSuffixes`）。**这一条本轮未执行验证** —— 按分工 `bridge/` 已冻结、
  由另一位协作者跑过；本文档只记录静态计数。

**2026-11-05 加 CI 门禁**：上面这套自检再好用，也只在本地、只在人记得跑的时候生效。
新增 `.github/workflows/regress.yml`，push / PR 自动跑 `regress.py` 当门禁并上传报告 artifact。
因 `.gitignore` 是白名单模式（`*` 忽略一切），同步放行了 `/.github/workflows/*.yml`，
且确认没把 `qq-bot/` 等无关目录顺带放进来。

---

完整逐节解析、演进脉络、翻车点地图见 [AGENT-解析.md](AGENT-解析.md)。
回归的判定标准、数字自检、历史翻车点见 [examples/README.md](examples/README.md)。
