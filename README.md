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
│   ├── regress.py               # 一次性静态自检脚本（PASS 65 / FAIL 0）
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

- **静态全绿 ≠ 行为没退化**：`regress.py` 只做静态结构 + 算术重算 + 基准完整性，不调 LLM、不渲染、不查实时数据。逐轮行为、图卡目检、实时数据现查仍需人工对照。
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

---

完整逐节解析、演进脉络、翻车点地图见 [AGENT-解析.md](AGENT-解析.md)。
回归的判定标准、数字自检、历史翻车点见 [examples/README.md](examples/README.md)。
