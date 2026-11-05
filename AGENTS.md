# AGENTS.md — 给接手的 Agent / 协作者

本仓库是「行旅 · Travel Agent」：**一段提示词 + 一个渲染器 + 一个取数脚本 + 一套回归基准**，
不是一个会自己跑的服务。改任何东西之前，先把这四条记住。

## 1. 唯一真值源与文件分工

| 文件 | 角色 | 改它时要同步什么 |
|---|---|---|
| `travel-agent.md` | 主提示词（Agent 的全部行为规则） | 章节/硬规则/图卡规格变动 → `examples/regress.py` 的 `required_heads` / `rules` / `cards` |
| `examples/*-example.md` | 4 份基准样例（桂林 / 杭州 / 多角色 / 曼谷） | 数字 → `check_numbers()`；事实锚点 → `FACTS` / `examples/facts.json` |
| `examples/regress.py` | 一次性静态回归，`--report` 出 `report.md` | 改断言 → 必须同步 `SELFTEST` 里对应的错值样例 |
| `examples/facts.json` | 易过期事实台账（claim + verified_on + source_url） | 事实改了 → 台账先改，再改提示词/样例 |
| `cardtest/*.html` | 7+1 张图卡的 HTML 源 | 改数字/天数/色板 → 回归的 `[F]`/`[G]` 会校验 |
| `cardtest/*-prices-*.json` | 价格快照（含 `fetched_at`） | 提示词里的实测数字必须和快照统计一致（`[G]`） |
| `cardtest/hotel_price.py` | 免登录 SSR 取价，写 JSON 时带 `fetched_at` | 别删 `fetched_at` |
| `cardtest/shot.py` | Edge 无头渲染 HTML→PNG | 只在本机 Windows 用，CI 不跑 |

**铁律**：金额改一处，必须同步「分项 / 合计 / 图上大数字」三处；加总差 1 元也要找出来。
基准样例的「bug 记录区」和「合格输出区」共存——**基准只断言「正确值必须出现」，
错值缺席检查只放在干净交付物（HTML 卡、提示词）上**，否则必然假阳性。

## 2. 改完必须跑

```
cd C:/ai && PYTHONIOENCODING=utf-8 "$PY" examples/regress.py            # 打印报告
cd C:/ai && PYTHONIOENCODING=utf-8 "$PY" examples/regress.py --report   # 落盘 report.md
```

退出码 `0` = 全绿，`1` = 有 FAIL。当前基线 **PASS 157 / FAIL 0**。
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
  提交前 `git grep -l --cached -E 'ghp_|github_pat_|x-access-token:|PRIVATE KEY'` 必须 0 命中。

## 4. 想加新检查时

1. 在 `regress.py` 里加函数，用 `check()` 记 PASS/FAIL、`info()` 记提醒，挂进 `main()`。
2. 凡是「错值必须缺席」型断言，同步在 `SELFTEST` 配一个能命中它的错值样例（`[D]` 会验）。
3. 用 `cardtest/_reverse*.py` 那种方式**注入故障验证它真会 FAIL**，再字节级还原——
   没做反向验证的断言不算数。
4. 把新的 PASS 总数、检查项说明同步进 `README.md` / `examples/README.md` / `AGENT-解析.md`。

## 5. 推送

`origin` 已设为 SSH：`git@github.com:luchengfj/travel-agent.git`（需已授权的
`~/.ssh/id_ed25519_github`）。`git push` 即可；HTTPS + PAT 那条路本机 GCM 里已无凭据，别再绕。
