# 旅行 Agent 回归报告

- 生成时间：2026-11-10 19:37:14
- 工作目录：`C:\ai\agent`
- 检查对象：`travel-agent.md` + `examples/` 四份基准 + `README.md` + 断言自检 + 事实台账 + 卡片静态健全 + 价格快照交叉 + 出境卡附加块 + 记账内核 + 行为回放用例 + 应用一致性(PWA/Worker) + 本机模型桥(bridge/)漂移

**结论：✅ 全绿，未发现退化**（PASS 253 / FAIL 0 / INFO 2）

| 状态 | 检查项 | 结果 |
|---|---|---|
| INFO | `提示词` | 当前 460 行；基准建立时 313 行，扩到 418 行（含境外四件事） |
| PASS | `提示词·章节` | 20 个必需一级章节齐全（实际 20/20） |
| PASS | `提示词·图卡` | 7 张图卡规格小节齐全（plan/deal/prep/ontrip/review/route/spend） |
| PASS | `提示词·硬规则` | 21 条硬规则关键词齐全（每条对应一个真实翻车点） |
| PASS | `提示词·出境附加块` | 出境卡 5 项固定附加块齐全 |
| PASS | `数字·桂林` | 1102+1008+650+400+240 = 3400，人均 1700 ✓ |
| PASS | `数字·桂林` | 人均分项由分项÷2 推导得 551+504+325+200+120 = 1700 ✓ |
| INFO | `数字·桂林` | 三档人均为 [1336, 1700, 2336]（三个不同取舍，不只是换酒店） |
| PASS | `数字·杭州` | deal 14 家 sum 1122 / mean 80.14 ✓（旧卡印 77.37 是 bug） |
| PASS | `数字·杭州` | review 预算 3144 / 实付 3286 / 差 142 / 分项差 [100,84,0,-42] / 人均 1643 vs 1572 ✓ |
| PASS | `数字·多角色` | 分项 3400 vs 比价员合计 3420，差 -20；人均 1700 ✓ |
| PASS | `数字·多角色` | 自费可选 490，两项都要人均 1945 ✓ |
| PASS | `数字·多角色` | 住宿若误读每人 → 2016 / 人均 1008（口径差一倍，必须被抓出）✓ |
| PASS | `数字·曼谷` | 均衡 6144 / 人均 3072 ✓ |
| PASS | `数字·曼谷` | 省钱 4519 / 人均 2259.5（图上整数显示 2260，须标取整）✓ |
| PASS | `数字·曼谷` | 深度 9204 / 人均 4602 ✓ |
| PASS | `数字·曼谷` | THB→CNY 取整换算 {'门票(均衡)': 394, '市内(均衡)': 315, '快线': 35, '门票(深度)': 866, '市内(深度)': 473, '现金门槛': 3939} 与样例分项一致 ✓ |
| PASS | `数字·曼谷` | 均衡超预算 72 元；换 D3 后人均 2952 ✓ |
| PASS | `数字·曼谷` | 均衡 − 省钱 人均差 812.5（差额主要来自机票住宿）✓ |
| PASS | `基准·guilin-example.md` | 173 行，检查点 17 条（与基准一致） |
| PASS | `基准·guilin-example.md·硬事实` | 11 条正确值锚点齐全 |
| PASS | `基准·guilin-example.md·记录区` | 2 个 bug 记录/自检节仍在 |
| PASS | `基准·hangzhou-example.md` | 215 行，检查点 18 条（与基准一致） |
| PASS | `基准·hangzhou-example.md·硬事实` | 8 条正确值锚点齐全 |
| PASS | `基准·hangzhou-example.md·记录区` | 3 个 bug 记录/自检节仍在 |
| PASS | `基准·team-example.md` | 201 行，检查点 9 条（与基准一致） |
| PASS | `基准·team-example.md·硬事实` | 8 条正确值锚点齐全 |
| PASS | `基准·team-example.md·记录区` | 3 个 bug 记录/自检节仍在 |
| PASS | `基准·bangkok-example.md` | 286 行，检查点 19 条（与基准一致） |
| PASS | `基准·bangkok-example.md·硬事实` | 17 条正确值锚点齐全 |
| PASS | `基准·bangkok-example.md·记录区` | 2 个 bug 记录/自检节仍在 |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·防复发` | 未复发：合计误写 ¥3,700（应为 ¥3,400） |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·防复发` | 未复发：餐饮计划误写 ¥780（应为 ¥650） |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·防复发` | 未复发：门票计划误写 ¥510（应为 ¥400） |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·防复发` | 未复发：市内交通/其他计划误写 ¥300（应为 ¥240） |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·修复项` | 已落地：合计 ¥3,400 与基准一致 |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·修复项` | 已落地：头部人均 ¥1,700 |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·修复项` | 已落地：第 5 类目改回「市内交通」口径 |
| PASS | `交付物·spend 消费记录卡（ledger.py 生成）·修复项` | 已落地：餐饮计划 ¥650 |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·防复发` | 未复发：卡顶英文写成 3 天（视觉自检 bug #1） |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·防复发` | 未复发：住宿误写 ¥168/人（翻车点 #2） |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·防复发` | 未复发：均衡档门票 255/260（应为 200）(bug #2) |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·防复发` | 未复发：D4 用「已计入」掩盖返程漏算（bug #3） |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·防复发` | 未复发：deal 均值 77.37（应为 80.14） |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：顶部 kicker 改回 4 DAYS 3 NIGHTS |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：图上大数字人均 1,700 |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：往返交通合计 ¥1,102 备注 |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：均衡档门票 200 |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：市内交通 120（口径与基线一致） |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：银子岩标为可选自费、不进均衡档 |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：住宿口径 ¥/间/晚 |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：冬季空调 / 供暖提示 |
| PASS | `交付物·桂林卡（真正渲染出来的交付物）·修复项` | 已落地：去程/返程各 ¥551 共 4 处（曾只算去程）（实测 4 处） |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·防复发` | 未复发：天数写成 3 天 3 晚（应为 3 DAYS 2 NIGHTS） |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·防复发` | 未复发：用「已计入」掩盖返程漏算（读图自检 bug #3 同源） |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·防复发` | 未复发：两栏被拉出大片空白（读图自检抓到的视觉瑕疵复发） |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：顶部 kicker 天数正确 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：图上大数字人均 1,381 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：2 人合计 2,762 / 均衡档 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：往返高铁合计 1,102 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：分项加总自检行 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：显式声明不写「已计入」 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：两栏空白的 CSS 修复 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：真实房价已回填 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：窗口外天气如实标注 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：冬季空调 / 制热提示 |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：去程 + 返程各计 ¥551（曾只算去程）（实测 5 处） |
| PASS | `交付物·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·修复项` | 已落地：三处同步：大数字 / 均衡档 / 加总自检（实测 4 处） |
| PASS | `交付物·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·防复发` | 未复发：卡顶英文 3 天 |
| PASS | `交付物·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·防复发` | 未复发：deal 均值 77.37 |
| PASS | `交付物·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·防复发` | 未复发：省钱档 4520（取整后应 4519） |
| PASS | `交付物·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·防复发` | 未复发：深度档 9205（取整后应 9204） |
| PASS | `交付物·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·防复发` | 未复发：处置后人均 2950（应 2952） |
| PASS | `交付物·境外（曼谷）卡 · 出境附加块样板·防复发` | 未复发：kicker 天数写成 3 天 3 晚（应为 4 DAYS 3 NIGHTS） |
| PASS | `交付物·境外（曼谷）卡 · 出境附加块样板·防复发` | 未复发：要求提前 72 小时以上填 TDAC（填早系统不认） |
| PASS | `交付物·境外（曼谷）卡 · 出境附加块样板·防复发` | 未复发：把 20 泰铢国民票价写成游客也能享受（谁有资格陷阱） |
| PASS | `交付物·境外（曼谷）卡 · 出境附加块样板·防复发` | 未复发：把现金抽查门槛 20,000 THB 混进预计消费额（门槛值≠消费值） |
| PASS | `基准·README` | 6 个关键节齐全 |
| PASS | `基准·README` | 数字自检命令与口径铁律仍在 |
| PASS | `自检·配置` | EXPECTED 4 份基准齐全 |
| PASS | `自检·配置` | FACTS 4 份齐全 |
| PASS | `自检·配置` | DOC_RECORD_SECTIONS 4 份齐全 |
| PASS | `自检·配置` | CLEAN_FILES 5 个交付物齐全 |
| PASS | `自检·spend 消费记录卡（ledger.py 生成）` | 文件存在，配了 8 条断言 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）` | 文件存在，配了 14 条断言 |
| PASS | `自检·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）` | 文件存在，配了 15 条断言 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）` | 文件存在，配了 5 条断言 |
| PASS | `自检·境外（曼谷）卡 · 出境附加块样板` | 文件存在，配了 4 条断言 |
| PASS | `自检·spend 消费记录卡（ledger.py 生成）·fixture` | 4 条防复发断言都有活体样例 |
| PASS | `自检·spend 消费记录卡（ledger.py 生成）·活体` | 断言活着：能认出「3,700」 |
| PASS | `自检·spend 消费记录卡（ledger.py 生成）·活体` | 断言活着：能认出「¥780」 |
| PASS | `自检·spend 消费记录卡（ledger.py 生成）·活体` | 断言活着：能认出「¥510」 |
| PASS | `自检·spend 消费记录卡（ledger.py 生成）·活体` | 断言活着：能认出「¥300」 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）·fixture` | 5 条防复发断言都有活体样例 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）·活体` | 断言活着：能认出「3 DAYS 3 NIGHTS」 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）·活体` | 断言活着：能认出「¥168/人|168/人」 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）·活体` | 断言活着：能认出「门票.*(260|255)」 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）·活体` | 断言活着：能认出「费用已计入交通」 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）·活体` | 断言活着：能认出「77[.]37」 |
| PASS | `自检·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·fixture` | 3 条防复发断言都有活体样例 |
| PASS | `自检·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·活体` | 断言活着：能认出「3 DAYS 3 NIGHTS」 |
| PASS | `自检·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·活体` | 断言活着：能认出「费用已计入交通」 |
| PASS | `自检·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）·活体` | 断言活着：能认出「align-items:stretch」 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·fixture` | 5 条防复发断言都有活体样例 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·活体` | 断言活着：能认出「3 DAYS 3 NIGHTS」 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·活体` | 断言活着：能认出「77[.]37」 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·活体` | 断言活着：能认出「4,520|4520」 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·活体` | 断言活着：能认出「9,205|9205」 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）·活体` | 断言活着：能认出「¥2,950|2950」 |
| PASS | `自检·境外（曼谷）卡 · 出境附加块样板·fixture` | 4 条防复发断言都有活体样例 |
| PASS | `自检·境外（曼谷）卡 · 出境附加块样板·活体` | 断言活着：能认出「3 DAYS 3 NIGHTS」 |
| PASS | `自检·境外（曼谷）卡 · 出境附加块样板·活体` | 断言活着：能认出「提前 72 小时以上填|72 小时以上.{0,8}填」 |
| PASS | `自检·境外（曼谷）卡 · 出境附加块样板·活体` | 断言活着：能认出「20 泰铢.{0,25}游客.{0,8}(也能|同样|均可|可享|都享|福利)|游客.{0,8}(也能|同样|可享).{0,25}20 泰铢」 |
| PASS | `自检·境外（曼谷）卡 · 出境附加块样板·活体` | 断言活着：能认出「20,000 THB.{0,15}(计入|算进).{0,10}(预算|消费)|把.{0,10}20,000 THB.{0,10}(计入|算进)」 |
| PASS | `台账·facts.json` | schema=1 可识别 |
| PASS | `台账·hotline-12345` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·hotline-12345` | verified_on=2026-11-02 格式正确且不晚于今天 |
| PASS | `台账·hotline-12345` | claim 在 1 个文件里都在 |
| PASS | `台账·thai-visa-free` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·thai-visa-free` | verified_on=2026-11-03 格式正确且不晚于今天 |
| PASS | `台账·thai-visa-free` | claim 在 1 个文件里都在 |
| PASS | `台账·thai-stay-cap` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·thai-stay-cap` | verified_on=2026-11-03 格式正确且不晚于今天 |
| PASS | `台账·thai-stay-cap` | claim 在 1 个文件里都在 |
| PASS | `台账·tdac-window` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·tdac-window` | verified_on=2026-11-03 格式正确且不晚于今天 |
| PASS | `台账·tdac-window` | claim 在 1 个文件里都在 |
| PASS | `台账·thai-cash-threshold` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·thai-cash-threshold` | verified_on=2026-11-03 格式正确且不晚于今天 |
| PASS | `台账·thai-cash-threshold` | claim 在 1 个文件里都在 |
| PASS | `台账·cny-thb-rate` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·cny-thb-rate` | verified_on=2026-11-03 格式正确且不晚于今天 |
| PASS | `台账·cny-thb-rate` | claim 在 1 个文件里都在 |
| PASS | `台账·bangkok-mrt-emv` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·bangkok-mrt-emv` | verified_on=2026-11-03 格式正确且不晚于今天 |
| PASS | `台账·bangkok-mrt-emv` | claim 在 1 个文件里都在 |
| PASS | `台账·tripcom-city-yangshuo` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·tripcom-city-yangshuo` | verified_on=2026-11-04 格式正确且不晚于今天 |
| PASS | `台账·tripcom-city-yangshuo` | claim 在 2 个文件里都在 |
| PASS | `台账·tripcom-zone-weststreet` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·tripcom-zone-weststreet` | verified_on=2026-11-04 格式正确且不晚于今天 |
| PASS | `台账·tripcom-zone-weststreet` | claim 在 2 个文件里都在 |
| PASS | `台账·yangshuo-weststreet-price` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·yangshuo-weststreet-price` | verified_on=2026-11-04 格式正确且不晚于今天 |
| PASS | `台账·yangshuo-weststreet-price` | claim 在 1 个文件里都在 |
| PASS | `台账·shenzhen-yangshuo-rail` | 字段齐全（claim / source_url / verified_on / in / review_every_days） |
| PASS | `台账·shenzhen-yangshuo-rail` | verified_on=2026-11-02 格式正确且不晚于今天 |
| PASS | `台账·shenzhen-yangshuo-rail` | claim 在 1 个文件里都在 |
| PASS | `台账·复核提醒` | 11 条事实都在复核期内 |
| PASS | `卡片·清单` | 入库卡片 10 张（≥8） |
| PASS | `卡片·bangkok.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·bangkok.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·bangkok.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·bangkok.html·kicker` | 2 处 kicker 都满足 DAYS = NIGHTS + 1 |
| PASS | `卡片·deal.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·deal.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·deal.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·guilin-spend.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·guilin-spend.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·guilin-spend.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·guilin.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·guilin.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·guilin.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·guilin.html·kicker` | 1 处 kicker 都满足 DAYS = NIGHTS + 1 |
| PASS | `卡片·guilin3d2n.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·guilin3d2n.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·guilin3d2n.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·guilin3d2n.html·kicker` | 2 处 kicker 都满足 DAYS = NIGHTS + 1 |
| PASS | `卡片·hangzhou.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·hangzhou.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·hangzhou.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·hangzhou.html·kicker` | 1 处 kicker 都满足 DAYS = NIGHTS + 1 |
| PASS | `卡片·ontrip.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·ontrip.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·ontrip.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·perfect-trip.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·perfect-trip.html·底座` | 强调色 3/3（≥2） |
| PASS | `卡片·perfect-trip.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·perfect-trip.html·kicker` | 1 处 kicker 都满足 DAYS = NIGHTS + 1 |
| PASS | `卡片·prep.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·prep.html·底座` | 强调色 2/3（≥2） |
| PASS | `卡片·prep.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `卡片·review.html·底座` | 基础色板齐全（2/2） |
| PASS | `卡片·review.html·底座` | 强调色 2/3（≥2） |
| PASS | `卡片·review.html·底座` | DOCTYPE 与 charset 声明齐备 |
| PASS | `快照·桂林 12/1–12/3` | 字段齐全（source/city/dates/fetched_at/rows） |
| PASS | `快照·桂林 12/1–12/3·采集时间` | 有采集时间：2026-11-04 |
| PASS | `快照·桂林 12/1–12/3·交叉一致` | 提示词与快照一致：每晚 ¥110–952，中位 ¥332 |
| PASS | `快照·阳朔西街 12/1–12/3` | 字段齐全（source/city/dates/fetched_at/rows） |
| PASS | `快照·阳朔西街 12/1–12/3·采集时间` | 有采集时间：2026-11-04 |
| PASS | `快照·阳朔西街 12/1–12/3·交叉一致` | 提示词与快照一致：每晚 ¥80–479、中位 ¥171，9 家 ≤¥300 |
| PASS | `出境卡·① kicker 天数与「X 天 Y 晚」一致` | 2 项必备文本齐备 |
| PASS | `出境卡·② 汇率行：比率 + 采集日期` | 3 项必备文本齐备 |
| PASS | `出境卡·③ 入境登记项 + 时间窗` | 3 项必备文本齐备 |
| PASS | `出境卡·④ 现金/证件门槛 + 只认现金` | 3 项必备文本齐备 |
| PASS | `出境卡·⑤ 不适用游客的政策陷阱 + 谁有资格` | 3 项必备文本齐备 |
| PASS | `出境卡·交叉一致·3,072` | 大数字「3,072」与基准样例一致 |
| PASS | `出境卡·交叉一致·6,144` | 大数字「6,144」与基准样例一致 |
| PASS | `记账·内核` | ledger.py 可作为模块加载（纯标准库） |
| PASS | `记账·计划额真值源` | PLAN 与基准一致（1102/1008/650/400/240 = 3400） |
| PASS | `记账·金额来自用户` | add_entry 的 amount 必填无默认值（不替用户编金额） |
| PASS | `记账·golden 对账` | 3 笔 / 累计 ¥515.5 / 各类目已花与夹具一致 |
| PASS | `记账·空白模板态` | 空账本 0 笔 / 累计 ¥0（不替用户编数字） |
| PASS | `记账·生成/入库同步` | guilin-spend.html 与 render_spend(空) 完全一致（改 PLAN 自动同步三处） |
| PASS | `回放·cases.json` | schema=1 可识别 |
| PASS | `回放·用例清单` | 5 个复现用例齐全 |
| PASS | `回放·用例 id` | id 无重复 |
| PASS | `回放·基准引用` | 5 个用例都指向存在的基准 |
| PASS | `回放·用例字段` | 每个用例都有 intent/turns/watch/hard_facts |
| PASS | `回放·不判分原则` | 台账明说「不判分只留痕」（不制造假 FAIL） |
| PASS | `回放·操作卡` | replay.py 提供 list/prompt/trace，且明说不判分 |
| PASS | `应用·提示词同步·逐字节` | worker/src/prompt.js 与 travel-agent.md 逐字节一致 |
| PASS | `应用·builder` | build-system-prompt.mjs 引用 travel-agent.md → prompt.js |
| PASS | `应用·wrangler·变量` | LLM_BASE_URL / LLM_MODEL / ALLOWED_ORIGIN 三个非敏感变量在场 |
| PASS | `应用·wrangler·密钥隔离` | LLM_API_KEY 未写进 wrangler.toml（只走 wrangler secret） |
| PASS | `应用·manifest·合法` | manifest.webmanifest 是可解析的合法 JSON |
| PASS | `应用·manifest·必需键` | name/short_name/start_url/display/icons 必需键齐全 |
| PASS | `应用·sw·缓存清单` | APP_SHELL 9 项离线外壳齐备 |
| PASS | `应用·sw·文件存在` | APP_SHELL 指向的文件在磁盘上都存在 |
| PASS | `应用·sw·API 不缓存` | sw.js 明确把 /api/chat 排除在缓存外（network-only） |
| PASS | `应用·worker·转发骨架` | 注入 system=PROMPT、拼 /chat/completions、读 env 密钥、清洗 role 的关键字在场 |
| PASS | `应用·凭据正则·sk` | 正则能命中活体样例（没被改松） |
| PASS | `应用·凭据正则·ghp` | 正则能命中活体样例（没被改松） |
| PASS | `应用·凭据正则·github_pat` | 正则能命中活体样例（没被改松） |
| PASS | `应用·凭据正则·x-access` | 正则能命中活体样例（没被改松） |
| PASS | `应用·凭据正则·envkey` | 正则能命中活体样例（没被改松） |
| PASS | `应用·凭据正则·pem` | 正则能命中活体样例（没被改松） |
| PASS | `应用·运行时文件` | 部署运行时代码/配置文件齐全 |
| PASS | `应用·凭据·零命中` | 部署运行时代码/配置里 0 个疑似真实密钥形态 |
| PASS | `应用·图标` | PWA 192/512 图标齐备 |
| PASS | `应用·样例成品` | Demo 模式的已核实样例 md + PNG 齐备 |
| PASS | `桥·package 清单` | bridge/package.json 合法且含 bundle/exports 硬要求 |
| PASS | `桥·patch 注册` | cordis.patch.yml 注册 @local/xinglv-llm-bridge 且带端口 |
| PASS | `桥·端口一致` | index.js 默认端口与 cordis.patch.yml 一致（8789） |
| PASS | `桥·关键件齐全` | ctx.llm.stream / Host 校验 / bearer / 随机 token / 提示词读取 / 系统提示词处理 全在 |
| PASS | `桥·提示词同源` | 桥从 worker/src/prompt.js 读系统提示词（与 [K] 同一真值源） |
| PASS | `桥·显示元数据` | README / 图标 / 中英 locale 齐备 |
| PASS | `桥·locale 真实` | 中英 locale 的 meta.title/description 都是真实描述，非模板占位 |
| PASS | `桥·凭据·零命中` | bridge/ 运行时代码 0 个疑似真实密钥形态（token 是运行时随机生成的） |
| PASS | `桥·前端三态` | app.js 具备桥探测 / OpenAI 兼容调用 / 统一后端分发 / loopback 判定 |
| PASS | `桥·优先级` | updateMode 里先判 bridge（桥 > Worker > Demo），模式芯片才会报「本机」 |
| PASS | `桥·SW 不缓存接口` | sw.js 用 endsWith() 实调用把 Worker 与桥的对话接口、以及带随机 token 的引导端点排除缓存 |
| PASS | `桥·公网模式关键件` | 公网 Host 白名单 / 配对端点 / 随机配对码 / 会话存储 / 双路鉴权 / 配对限流 全在 |
| PASS | `桥·配对限流生效` | 配对失败达到预算时真的返回 429（不是只定义常量） |
| PASS | `桥·配对预算合理` | 配对失败预算在 1–100 之间（窗口内），相对 10^6 的码空间才有意义 |
| PASS | `桥·公网不下发密钥` | 公网侧 /bridge-info.json 只回元信息 + auth:'pair'，绝不下发 token 或配对码 |
| PASS | `桥·配对码只在服务端` | 配对码由服务端 randomInt 生成，前端只负责显示/输入，不自行生成 |
| PASS | `桥·前端待配对态` | app.js 有 pairWithCode / pairNeeded / 真发出 POST pair，手机未配对时给出配对引导而不是退回 Demo |
| PASS | `桥·公网默认关闭` | publicAccess 必须显式 === true 才打开（默认关；关掉即退回只认 loopback） |
| PASS | `桥·后缀白名单锚定` | matchesHostSuffix 用 ^[a-z0-9-]+\.<转义后缀>$ 锚定匹配：xxxx.lhr.life 放行，evil-lhr.life / a.b.lhr.life / xxxx.lhr.life.attacker.com 全部拒绝 |
| PASS | `桥·后缀转义函数` | escapeRegExp 转义了全部正则元字符（. * + ? ^ $ { } ( ) | [ ] \）：lhr.life → lhr\.life，判定器把「只转义斜杠 / 只转义点」两个错值样例判死 |
| PASS | `桥·后缀接进 Host 判定` | isPublicHost 在 publicAccess 总开关之后、publicHosts 精确匹配之外真的调用 matchesHostSuffix(name, guard.publicHostSuffixes) |
| PASS | `桥·后缀配置归一化` | publicHostSuffixes 读入后 trim/小写/去首尾点，并被 /^[a-z0-9-]+(\.[a-z0-9-]+)+$/ 挡掉单段与非法后缀，结果进了 guard |
| PASS | `桥·后缀默认空` | cordis.patch.yml 里 publicHostSuffixes 恰好一处、默认留空 []（要放行必须显式填，用完清空） |
| PASS | `桥·后缀判定器活体` | 判定器自证活着：正确实现判过，8 个错值样例（裸 endsWith / includes / 缺 ^ / 缺 $ / 没转义 / 多层 label / 不拦单段 / 极性写反）全部判死 |

## 脚本没覆盖的部分（仍需人工/半自动）

本脚本只做**静态结构 + 算术重算 + 基准完整性 + 断言自检 + 事实台账 + 卡片静态健全 + 价格快照交叉 + 出境卡附加块 + 记账内核 + 行为回放用例 + 应用一致性(PWA/Worker 漂移)**检查。下面四项必须按 `examples/README.md`「怎么跑一次回归」实际喂给 Agent 对照：

1. 逐轮**行为输出**是否同构（首行模式标签、≤3 问带默认值、三档内容不同…）
2. 图卡是否真的渲染出来、尺寸是否正确、有视觉能力时是否逐字目检 kicker/页脚
3. 实时数据是否现查（登录态房价、天气窗口、12345 现役号码）
4. 措辞差异 ≠ 退化；但硬事实（票价/汇率/政策日）与口径一旦不同就必须判退化

复现输入清单：

- **guilin-example.md**（第 1 轮首轮提问）：「我需要一个广西3天游，12。1-12.4日回来的旅游，深圳出发」；随后依次：「A」→「山水暴走 + 美食混合」（人数预算不答，看是否用默认 2 人/¥1500）
- **hangzhou-example.md**（四个非规划模式）：「杭州这几家杭帮菜到底哪家值？」 / 「下周三出发去杭州，这几天要准备啥？」 / 「到杭州了，今天下雨，原定去灵隐寺还去吗？」 / 「回来了，帮我看看这次超支没有。」；四个模式各跑一次，看结构与口径
- **team-example.md**（多角色冲突场景）：把「三个角色的原始交付」整段照贴给支持多角色的 Agent；看汇总者是否抓出 4 个坑、不误判餐饮 650 干扰项、按裁决顺序处理
- **bangkok-example.md**（境外变体）：「12 月中去曼谷玩几天，从深圳走，两个人，预算你看着办」；随后：「12/17-12/20 行，护照没问题，人均 3000 含机票」

命令：`"$PY" examples/regress.py --emit-prompt` 可单独打印复现指令。