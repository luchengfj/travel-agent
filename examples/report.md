# 旅行 Agent 回归报告

- 生成时间：2026-11-05 22:21:58
- 工作目录：`C:\ai`
- 检查对象：`travel-agent.md` + `examples/` 四份基准 + `README.md` + 断言自检 + 事实台账 + 卡片静态健全 + 价格快照交叉

**结论：✅ 全绿，未发现退化**（PASS 157 / FAIL 0 / INFO 2）

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
| PASS | `基准·README` | 6 个关键节齐全 |
| PASS | `基准·README` | 数字自检命令与口径铁律仍在 |
| PASS | `自检·配置` | EXPECTED 4 份基准齐全 |
| PASS | `自检·配置` | FACTS 4 份齐全 |
| PASS | `自检·配置` | DOC_RECORD_SECTIONS 4 份齐全 |
| PASS | `自检·配置` | CLEAN_FILES 3 个交付物齐全 |
| PASS | `自检·桂林卡（真正渲染出来的交付物）` | 文件存在，配了 14 条断言 |
| PASS | `自检·桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）` | 文件存在，配了 15 条断言 |
| PASS | `自检·提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）` | 文件存在，配了 5 条断言 |
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
| PASS | `卡片·清单` | 入库卡片 8 张（≥8） |
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

## 脚本没覆盖的部分（仍需人工/半自动）

本脚本只做**静态结构 + 算术重算 + 基准完整性 + 断言自检 + 事实台账 + 卡片静态健全 + 价格快照交叉**检查。下面四项必须按 `examples/README.md`「怎么跑一次回归」实际喂给 Agent 对照：

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