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
├── .gitignore
├── cardtest/                    # 图卡渲染 + 实时取数
│   ├── shot.py                  # HTML+CSS → 无头 Edge 截全页 → Pillow 自动裁白边
│   ├── hotel_price.py           # 免登录 SSR 抓 trip.com 实时房价（支持 city / zone）
│   ├── *.html                   # 各张卡片的排版源码
│   ├── *.png                    # 渲染产物（2160px 宽 2 倍图）
│   └── *-prices-*.json          # 实测房价快照
├── examples/                    # 回归基准
│   ├── README.md                # 怎么跑回归 / 判定标准 / 历史翻车点
│   ├── guilin-example.md        # plan 全流程（4 天 3 晚）
│   ├── hangzhou-example.md      # deal / prep / ontrip / review 四模式
│   ├── team-example.md          # 多角色冲突裁决
│   ├── bangkok-example.md       # 境外变体（签证 / 汇率 / 时差 / 现金门槛）
│   ├── facts.json               # 易过期事实台账（claim + verified_on + source_url）
│   ├── regress.py               # 一次性静态自检脚本（PASS 157 / FAIL 0）
│   └── report.md                # 最近一次回归报告
├── hangzhou-5d-budget.md        # 杭州 5 天预算原始底稿
├── guilin-card.png              # 桂林 4 天 3 晚卡
├── guilin-3d2n-card.png         # 桂林 3 天 2 夜卡（回填了真实房价）
├── guilin-spend-card.png        # 消费记录卡（空白模板）
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
cd C:/ai
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

### 3. 渲一张卡
```bash
cd C:/ai/cardtest
"$PY" shot.py guilin3d2n.html "C:/ai/cardtest/guilin3d2n.png" 1080
```

### 4. 查实时房价（免登录、免账号、不撞 2FA）
```bash
cd C:/ai/cardtest
"$PY" hotel_price.py --city 871 --zone 4532 \
  --checkin 2026-12-01 --checkout 2026-12-03 --curr CNY --json out.json
```
`--city 871` = 阳朔，`--zone 4532` = 西街商圈。换日期价格会变，非静态缓存。

---

## 能力边界（务必如实标注）

- **静态全绿 ≠ 行为没退化**：`regress.py` 只做静态结构 + 算术重算 + 基准完整性 + 断言自检 + 事实台账 + 卡片静态健全 + 价格快照交叉，不调 LLM、不渲染、不查实时数据。逐轮行为、图卡目检、实时数据现查仍需人工对照。
- **房价只到城市 / 商圈粒度**：能拿「阳朔西街 12 家 ¥80–479 / 中位 ¥171」，不能定位具体某店的可下单价。SSR 是约 12 条/页的快照，**非可下单承诺价**，下单前必须重读。
- **天气窗口外只能给气候常态**：工具实测只覆盖 7 天，更远的行程标「历史同期，非实时预报」并给复核提醒。
- **图卡自检依赖模型视觉能力**：无视觉能力时走「尺寸 / 内容 / 溢出」三项结构化校验，并明说「未做像素级目检」。
- **金额多为混合口径**：历史账单均值（±20%）、估算、合理偏保守基准并存，页脚必须写清来源与误差。

## 设计铁律（踩坑换来）

基准样例文件的职责就是**记录** bug，对基准全文做「错值必须缺席」在原理上不成立
（首跑 7 个假 FAIL 里 5 个由此而来）。因此：
- 基准样例 → 只断言「正确值必须出现」+「bug 记录区还在」；
- 干净交付物（`cardtest/guilin.html`、`cardtest/guilin3d2n.html`、`travel-agent.md`）→ 才做「错值缺席 / 修复项在场」。

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

**2026-11-05 加 CI 门禁**：上面这套自检再好用，也只在本地、只在人记得跑的时候生效。
新增 `.github/workflows/regress.yml`，push / PR 自动跑 `regress.py` 当门禁并上传报告 artifact。
因 `.gitignore` 是白名单模式（`*` 忽略一切），同步放行了 `/.github/workflows/*.yml`，
且确认没把 `qq-bot/` 等无关目录顺带放进来。

---

完整逐节解析、演进脉络、翻车点地图见 [AGENT-解析.md](AGENT-解析.md)。
回归的判定标准、数字自检、历史翻车点见 [examples/README.md](examples/README.md)。
