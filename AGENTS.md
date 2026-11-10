# AGENTS.md — 给接手的 Agent / 协作者

本仓库是「行旅 · Travel Agent」：**一段提示词 + 一个渲染器 + 一个取数脚本 + 一套回归基准**，
不是一个会自己跑的服务。改任何东西之前，先把这四条记住。

## 1. 唯一真值源与文件分工

| 文件 | 角色 | 改它时要同步什么 |
|---|---|---|
| `travel-agent.md` | 主提示词（Agent 的全部行为规则） | 章节/硬规则/图卡规格变动 → `examples/regress.py` 的 `required_heads` / `rules` / `cards` |
| `examples/*-example.md` | 4 份基准样例（桂林 / 杭州 / 多角色 / 曼谷）+ `perfect-trip.md` 端到端成品 | 数字 → `check_numbers()`；事实锚点 → `FACTS` / `examples/facts.json` |
| `examples/regress.py` | 一次性静态回归，`--report` 出 `report.md` | 改断言 → 必须同步 `SELFTEST` 里对应的错值样例 |
| `examples/facts.json` | 易过期事实台账（claim + verified_on + source_url） | 事实改了 → 台账先改，再改提示词/样例 |
| `cardtest/*.html` | 10 张图卡的 HTML 源 | 改数字/天数/色板 → 回归的 `[F]`/`[G]` 会校验 |
| `cardtest/*-prices-*.json` | 价格快照（含 `fetched_at`） | 提示词里的实测数字必须和快照统计一致（`[G]`） |
| `cardtest/hotel_price.py` | 免登录 SSR 取价，写 JSON 时带 `fetched_at` | 别删 `fetched_at` |
| `cardtest/ledger.py` | spend 记账内核（PLAN 唯一真值源 / compute / render_spend） | 改计划额 → `[I]` 会重算并比对 golden |
| `cardtest/shot.py` | Edge 无头渲染 HTML→PNG | 只在本机 Windows 用，CI 不跑 |
| `cardtest/ledger-golden.json` | 记账内核的 golden 夹具（3 笔演示账 + expected） | `[I]` 用它对 compute() 结果 |
| `examples/cases.json` + `replay.py` | 行为回放「不判分只留痕」用例与操作卡 | `[J]` 只验结构，行为对照归人眼 |
| `app/` + `worker/` + `tools/` | 手机 PWA 前端 / Cloudflare Worker 代理 / 提示词→`prompt.js` 幂等构建 | 改 `travel-agent.md` 后必须重跑 `node tools/build-system-prompt.mjs`，否则 `[K]` 门禁立刻 FAIL |
| `bridge/` | 本机模型桥（DSH 宿主内插件）：`ctx.llm.stream()` 跑当前模型，对 127.0.0.1 暴露 OpenAI 兼容接口并同源发 `app/` | 改端口 → 同步 `cordis.patch.yml` 与 `index.js`；改提示词读取 → 必须仍指向 `worker/src/prompt.js`，否则 `[L]` FAIL；改公网放行（`publicHosts` / `publicHostSuffixes` / `allowQuickTunnel`）→ `[L]` 会校验后缀是**锚定**写法（`^[a-z0-9-]+\.<转义后缀>$`，不是裸 `endsWith`）、命中时必须 `return true`、`publicAccess` 总开关排在它前面、`escapeRegExp` **函数体**真的在转义、单段后缀被拒、yml 里默认留空且键只能出现一次 |
| `bridge/test.mjs` | 桥的离线单测（mock `ctx.llm`，45 条：含公网 Host 白名单 / 后缀白名单 / 配对 / 会话令牌 / 限流） | 用 `node bridge/test.mjs` 直接跑（`node --test` 会 spawn EPERM） |

**铁律**：金额改一处，必须同步「分项 / 合计 / 图上大数字」三处；加总差 1 元也要找出来。
基准样例的「bug 记录区」和「合格输出区」共存——**基准只断言「正确值必须出现」，
错值缺席检查只放在干净交付物（HTML 卡、提示词）上**，否则必然假阳性。

## 2. 改完必须跑

```
cd C:/ai/agent && PYTHONIOENCODING=utf-8 "$PY" examples/regress.py            # 打印报告
cd C:/ai/agent && PYTHONIOENCODING=utf-8 "$PY" examples/regress.py --report   # 落盘 report.md
```

退出码 `0` = 全绿，`1` = 有 FAIL。当前基线 **PASS 253 / FAIL 0**（`[L]` 24 条）。
CI（`.github/workflows/regress.yml`）在每次 push / PR 上自动跑同一条命令，纯标准库、不联网。

## 3. 硬边界（别越线，也别假装做到了）

- **静态全绿 ≠ 行为没退化**：脚本不调 LLM、不渲染、不查实时数据。逐轮行为输出、
  图卡像素级目检、实时价/天气现查，仍要人工按 `examples/README.md` 对照。
- **查不到就如实标注**：`【需登录获取】` / `【未实时核实】` / `【气候常态·非实时】`。
  绝不编一个像样的数字，`起价 × 1.25` 只是兜底估算、要显式说明。
- **政策/汇率/city id 会过期**：新数据必须带 `verified_on` 与来源；台账到复核期
  只报 INFO 提醒，人工现查后更新，脚本绝不自动改写提示词。
- **SSR 是灰色手段**：`hotel_price.py` 抓的是服务端渲染的挂牌价，是「城市/商圈级快照」，
  不是可下单承诺价；别高频抓、别拿它当登录态可订价。
- **凭据不进仓库**：`.gitignore` 是白名单模式（`*` 忽略一切），新增文件必须显式放行；
  提交前用 `git grep -l --cached -E <精确形态>` 扫运行时代码/配置必须 0 命中。
  精确形态（带长度边界，避免 [K] 的假 key 活体样例假阳性）定义在
  `examples/regress.py` 的 `CREDENTIAL_PATTERNS`；`.md` 文档合法讨论键名前缀、
  不进全仓 grep（由 [K] 的 `APP_SCAN_FILES` 覆盖）。

## 4. 想加新检查时

1. 在 `regress.py` 里加函数，用 `check()` 记 PASS/FAIL、`info()` 记提醒，挂进 `main()`。
2. 凡是「错值必须缺席」型断言，同步在 `SELFTEST` 配一个能命中它的错值样例（`[D]` 会验）。
3. 用 `cardtest/_reverse*.py` 那种方式**注入故障验证它真会 FAIL**，再字节级还原——
   没做反向验证的断言不算数。
4. 把新的 PASS 总数、检查项说明同步进 `README.md` / `examples/README.md` / `AGENT-解析.md` / `AGENTS.md`。
5. 加载被检查的模块时**直接从源码 `compile()`，别用 `importlib`**：等长数字改回（650→780→650）会命中 `__pycache__` 旧 `.pyc`，让回归读出旧值产生假 FAIL。

## 5. 推送

`origin` 已设为 SSH：`git@github.com:luchengfj/travel-agent.git`（需已授权的
`~/.ssh/id_ed25519_github`）。`git push` 即可；HTTPS + PAT 那条路本机 GCM 里已无凭据，别再绕。

本机 Git 装在 `C:\ai\.tools\Git\cmd\git.exe`，用户级 PATH 已持久化——**新开的终端 /
重新登录后**直接敲 `git` 就生效。但当前 DSH 会话的宿主进程启动于改注册表之前，
环境块是旧的，裸 `git` 仍找不到；此时用 `git.cmd`（`& .\git.cmd status`）或绝对路径。
`git.cmd` 会优先用 `.tools\Git`，没有则回退系统 `git`，不写死盘符，克隆仓库的人也能用。
