#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
regress.py — 旅行 Agent 提示词 / 回归基准 的一次性自检脚本

用法（在 C:\\ai\\agent 下，bash 里 python 不在 PATH，用运行时自带 Python）：
    PY="C:/Users/cheng/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/python/python.exe"
    "$PY" examples/regress.py              # 打印报告
    "$PY" examples/regress.py --report     # 同时落盘 report.md
    "$PY" examples/regress.py --emit-prompt # 打印「喂给 Agent 的复现指令」后退出

它验十一件事，缺一不可：
  [A] 结构 : travel-agent.md 的必需章节、硬规则关键词、7 张图卡规格都在
  [B] 数字 : 四份样例里的分项/合计/人均/换算，用 Python 重算一遍（基准自己也会算错）
  [C] 基准 : 四份样例的检查点、历史翻车点、已知 bug 记录仍在；并检测已修 bug 复发
  [D] 自检 : 断言配置没被删空、干净交付物确实存在、每条防复发正则都认得自己的错值
  [E] 事实 : 易过期事实台账 facts.json 每条 claim 仍在声明的文件里，且 verified_on / source_url 齐全、未过期
  [F] 卡片 : 全部入库 HTML 卡的基础色板、DOCTYPE、编码、品牌名、kicker 天数关系（DAYS = NIGHTS + 1）
  [G] 快照 : 价格 JSON 有采集时间、rows 可解析，且统计值与提示词里的声明一致
  [H] 出境卡 : travel-agent.md:396-401 规定的 5 个固定附加块真的出现在渲染卡 bangkok.html 上
  [I] 记账内核 : ledger.py 的 compute/add_entry 兑现 spend 承诺，PLAN 与基准一致，golden 夹具对账，入库卡与生成器同步
  [J] 行为回放 : cases.json 复现用例结构完整、指向存在的基准；replay.py 只留痕不判分
  [K] 应用一致性 : PWA/Worker 的 prompt.js 与 travel-agent.md 逐字节同步，应用骨架完整、无密钥泄漏

脚本只做「静态 + 算术」检查，不调用 LLM、不渲染图卡。
逐轮喂给 Agent 的**行为对照**仍按 README.md「怎么跑一次回归」人工/半自动完成，
脚本末尾会把每份样例的「复现输入 + 检查点条数」列成清单。

退出码：0 = 全绿；1 = 有 FAIL（任一硬事实/口径/结构不符即视为退化）。
"""

import re
import json
import sys
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # C:\ai\agent
EX = ROOT / "examples"
PROMPT = ROOT / "travel-agent.md"

# --------------------------------------------------------------------------
# 颜色（Windows 终端不支持时自动降级为纯文本）
# --------------------------------------------------------------------------
try:
    import colorama  # noqa
    colorama.just_fix_windows_console()
    _GREEN, _RED, _YELLOW, _DIM, _BOLD, _RST = (
        "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[1m", "\033[0m")
except Exception:
    _GREEN = _RED = _YELLOW = _DIM = _BOLD = _RST = ""

PASS = _GREEN + "PASS" + _RST
FAIL = _RED + "FAIL" + _RST
INFO = _DIM + "INFO" + _RST

RESULTS = []   # (level, section, message)


def check(cond, section, ok_msg, bad_msg):
    RESULTS.append(("PASS" if cond else "FAIL", section, ok_msg if cond else bad_msg))
    return cond


def info(section, msg):
    RESULTS.append(("INFO", section, msg))


def read(path):
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def line_count(text):
    return len(text.splitlines()) if text else 0


def has(text, pattern):
    return bool(re.search(pattern, text, re.M)) if text else False


# ==========================================================================
# [A] 提示词结构检查
# ==========================================================================
def check_prompt():
    t = read(PROMPT)
    if t is None:
        check(False, "提示词", "", "travel-agent.md 不存在")
        return
    n = line_count(t)
    info("提示词", f"当前 {n} 行；基准建立时 313 行，扩到 418 行（含境外四件事）")

    # A1 必需的一级章节（按内容匹配，不按行号——行号会因编辑漂移）
    required_heads = [
        "角色", "服务对象与默认偏好", "需求锁定", "价格口径铁律",
        "时效信息与过期数据", "可行性校验", "出境游多出来的四件事",
        "三档骨架怎么排", "决策与推荐纪律", "沟通与结构纪律",
        "五种模式", "五种图卡的结构规格", "模式切换规则",
        "回答外壳", "硬性纪律", "输出格式", "首轮行为", "工具使用",
        "图文输出", "多角色协作",
    ]
    missing = [h for h in required_heads if not has(t, r"^# " + re.escape(h))]
    check(not missing, "提示词·章节",
          f"20 个必需一级章节齐全（实际 {len(required_heads) - len(missing)}/{len(required_heads)}）",
          f"缺失一级章节：{missing}")

    # A2 七张图卡规格小节
    cards = ["plan", "deal", "prep", "ontrip", "review", "route", "spend"]
    miss_cards = [c for c in cards if not has(t, r"^## " + c + r" ·")]
    check(not miss_cards, "提示词·图卡",
          "7 张图卡规格小节齐全（plan/deal/prep/ontrip/review/route/spend）",
          f"缺失图卡规格：{miss_cards}")

    # A3 硬规则关键词 —— 每一条都对应一个真实踩过的坑
    rules = {
        r"¥X/间/晚|¥/间/晚": "住宿「¥X/间/晚」口径（翻车点 #2 差一倍）",
        r"起价\s*[×x]\s*1\.25": "起价 ×1.25 估算",
        r"差 1 元也要找|加总自检": "分项加总自检（差 1 元也要找）",
        r"12301.*12318.*2021.*12345|2021 年底并入 12345": "12301/12318 已并入 12345（现查）",
        r"气候常态.*非实时|窗口外.*气候常态": "窗口外天气给气候常态并标非实时",
        r"72\s*小时": "TDAC 入境前 72 小时时间窗",
        r"谁有资格": "政策优惠先问「谁有资格」（20 泰铢陷阱）",
        r"门槛值\s*[≠=]+\s*消费值|门槛.*消费": "门槛值 ≠ 消费值",
        r"当地时间": "跨境排程一律标当地时间",
        r"四元组": "价格交接四元组（金额+单位+来源+采集日期）",
        r"可执行性\s*>\s*省钱\s*>\s*体验": "冲突裁决顺序 可执行性>省钱>体验",
        r"三处同步": "分项/合计/图上大数字三处同步",
        r"未做像素级目检|未目检": "无视觉能力时声明未做像素级目检",
        r"2FA|二次验证": "浏览器登录唯一硬停点 = 2FA",
        r"HTML \+ CSS": "图卡走 HTML+CSS 无头浏览器截图（不用 AI 生图画数据）",
        r"非精确地图": "route 卡尾注「非精确地图」",
        r"是否出境": "需求锁定第 7 项「是否出境」",
        r"出境卡的固定附加块": "出境卡固定附加块（签证/汇率/时间窗/现金门槛/不适用政策）",
        r"【已核实】": "可信度标注【已核实】",
        r"【需登录获取】": "可信度标注【需登录获取】",
        r"登录获取路径|登录路径": "实时房价给登录获取路径",
    }
    miss_rules = [label for pat, label in rules.items() if not has(t, pat)]
    check(not miss_rules, "提示词·硬规则",
          f"{len(rules)} 条硬规则关键词齐全（每条对应一个真实翻车点）",
          f"缺失硬规则：{miss_rules}")

    # A4 出境固定附加块的 5 个子项（曼谷样例要求）
    extra = {
        r"天数|kicker": "①天数 kicker",
        r"汇率行|1 CNY": "②汇率行",
        r"时间窗|72": "③入境登记时间窗",
        r"只认现金|现金门槛": "④现金门槛",
        r"不适用游客|不适用": "⑤不适用游客的政策",
    }
    miss_extra = [label for pat, label in extra.items() if not has(t, pat)]
    check(not miss_extra, "提示词·出境附加块",
          "出境卡 5 项固定附加块齐全",
          f"出境附加块缺项：{miss_extra}")


# ==========================================================================
# [B] 数字重算（基准自己算错 = 假基准，必须先算对）
# ==========================================================================
def check_numbers():
    # ---- 桂林：4 天 3 晚 · 2 人 ----
    g = [275.5 * 2 * 2, 336 * 3, 650, 200 * 2, 240]   # 交通/住宿/餐饮/门票/市内
    check(sum(g) == 3400 and sum(g) / 2 == 1700,
          "数字·桂林",
          "1102+1008+650+400+240 = 3400，人均 1700 ✓",
          f"桂林分项 {g} 合计 {sum(g)}（预期 3400）")
    per = [x / 2 for x in g]
    check(per == [551, 504, 325, 200, 120] and sum(per) == 1700,
          "数字·桂林", "人均分项由分项÷2 推导得 551+504+325+200+120 = 1700 ✓",
          f"桂林人均分项 {per} 加总 {sum(per)}（预期 1700）")
    tiers_g = [1336, 1700, 2336]
    info("数字·桂林", f"三档人均为 {tiers_g}（三个不同取舍，不只是换酒店）")

    # ---- 杭州：deal 14 家 + review 对账 ----
    deal = [147, 141, 117, 88, 86, 85, 82, 78, 71, 64, 60, 54, 31, 18]
    check(len(deal) == 14 and sum(deal) == 1122 and round(sum(deal) / len(deal), 2) == 80.14,
          "数字·杭州",
          "deal 14 家 sum 1122 / mean 80.14 ✓（旧卡印 77.37 是 bug）",
          f"deal 实际 n={len(deal)} sum={sum(deal)} mean={round(sum(deal)/len(deal),2)}")
    budget = [1320, 1428, 190, 206]
    actual = [1420, 1512, 190, 164]
    diffs = [actual[i] - budget[i] for i in range(4)]
    check(sum(budget) == 3144 and sum(actual) == 3286
          and sum(actual) - sum(budget) == 142
          and diffs == [100, 84, 0, -42]
          and sum(actual) / 2 == 1643 and sum(budget) / 2 == 1572,
          "数字·杭州",
          "review 预算 3144 / 实付 3286 / 差 142 / 分项差 [100,84,0,-42] / 人均 1643 vs 1572 ✓",
          f"review 实际 budget={sum(budget)} actual={sum(actual)} diff={sum(actual)-sum(budget)} "
          f"items={diffs} per={sum(actual)/2}/{sum(budget)/2}")

    # ---- 多角色：冲突裁决的数字 ----
    t = {"交通": 1102, "住宿": 1008, "餐饮": 650, "门票": 400, "其他": 240}
    s = sum(t.values())
    check(s == 3400 and s - 3420 == -20 and s / 2 == 1700,
          "数字·多角色",
          "分项 3400 vs 比价员合计 3420，差 -20；人均 1700 ✓",
          f"多角色分项 {s}，差 {s-3420}")
    check(110 * 2 + 135 * 2 == 490 and (s + 490) / 2 == 1945,
          "数字·多角色",
          "自费可选 490，两项都要人均 1945 ✓",
          "自费可选/两项都要的数字不符")
    check(336 * 3 * 2 == 2016 and 336 * 3 == 1008,
          "数字·多角色",
          "住宿若误读每人 → 2016 / 人均 1008（口径差一倍，必须被抓出）✓",
          "住宿误读数字不符")

    # ---- 曼谷：境外 + 汇率取整口径 ----
    RATE = 5.078   # ECB 2026-11-02，1 CNY = 5.078 THB
    bk = [3000, 1200, 1200, 394, 315, 35]            # 均衡
    sv = [2400, 780, 800, 315, 189, 35]              # 省钱
    dp = [3800, 1950, 2080, 866, 473, 35]            # 深度
    check(sum(bk) == 6144 and sum(bk) / 2 == 3072,
          "数字·曼谷", "均衡 6144 / 人均 3072 ✓",
          f"均衡 {sum(bk)} / {sum(bk)/2}")
    check(sum(sv) == 4519 and sum(sv) / 2 == 2259.5,
          "数字·曼谷", "省钱 4519 / 人均 2259.5（图上整数显示 2260，须标取整）✓",
          f"省钱 {sum(sv)} / {sum(sv)/2}  ← 若得 4520/2260 说明用了未取整精确值求和")
    check(sum(dp) == 9204 and sum(dp) / 2 == 4602,
          "数字·曼谷", "深度 9204 / 人均 4602 ✓",
          f"深度 {sum(dp)} / {sum(dp)/2}  ← 若得 9205 说明同上")
    # 取整口径：分项先四舍五入到元，合计 = 取整后分项相加
    thb = {"门票(均衡)": 2000, "市内(均衡)": 1600, "快线": 180,
           "门票(深度)": 4400, "市内(深度)": 2400, "现金门槛": 20000}
    conv = {k: round(v / RATE) for k, v in thb.items()}
    check(conv == {"门票(均衡)": 394, "市内(均衡)": 315, "快线": 35,
                   "门票(深度)": 866, "市内(深度)": 473, "现金门槛": 3939},
          "数字·曼谷", f"THB→CNY 取整换算 {conv} 与样例分项一致 ✓",
          f"THB 换算不符：{conv}")
    check(sum(bk) / 2 - 3000 == 72 and sum(bk) / 2 - 120 == 2952,
          "数字·曼谷", "均衡超预算 72 元；换 D3 后人均 2952 ✓",
          "超预算/处置后人均不符（曾误写 2950）")
    check(round((sum(bk) - sum(sv)) / 2, 1) == 812.5,
          "数字·曼谷", "均衡 − 省钱 人均差 812.5（差额主要来自机票住宿）✓",
          "两档差额不符")


# ==========================================================================
# [C] 基准文件自身完整性 + 已修 bug 复发检测
# ==========================================================================
EXPECTED = {
    "guilin-example.md":   {"total_cp": 17, "min_lines": 170},
    "hangzhou-example.md": {"total_cp": 18, "min_lines": 210},
    "team-example.md":     {"total_cp": 9,  "min_lines": 195},
    "bangkok-example.md":  {"total_cp": 19, "min_lines": 280},
}

# ── 防复发检测的设计（load-bearing，别改回 whole-file 检查）──────────────
# 基准样例文件的职责就是「记录这些 bug」：历史翻车点、回归检查点、场景设定、
# 三个角色的原始交付里本来就写着错误值（¥168/人、¥77.37、竹筏 ¥75、
# 提前 72 小时以上填 TDAC、20 泰铢当游客福利……）。
# 对基准文件做「错值必须缺席」在原理上不成立，首跑 7 个 FAIL 里 5 个就这么来的。
#
# 因此拆成两类文件：
#   · 基准样例 → 只断言「正确值必须出现」(FACTS) +「bug 记录区必须还在」(DOC_RECORD_SECTIONS)
#   · 干净交付物（真实渲染卡 HTML、提示词本身）→ 才做「错值缺席 / 对值出现」(CLEAN_FILES)
# 注意 travel-agent.md:30 含「¥168/人」是**故意的反例说明**，所以提示词的缺席
# 清单里绝不能放这条，否则又是一个假阳性。
CLEAN_FILES = {
    # 2026-11-07 纳入：spend 卡。此前计划额写 780/510/300 合计 3700，与基准
    # 3400 及卡头人均 1700 自相矛盾（真 bug），且「记一笔自动对账」只是纸面承诺。
    # 现在这张卡由 cardtest/ledger.py 生成；这里锁住旧错值不得复发、口径值必须在场。
    "cardtest/guilin-spend.html": {
        "label": "spend 消费记录卡（ledger.py 生成）",
        "absent": [
            (r"3,700", "合计误写 ¥3,700（应为 ¥3,400）"),
            (r"¥780", "餐饮计划误写 ¥780（应为 ¥650）"),
            (r"¥510", "门票计划误写 ¥510（应为 ¥400）"),
            (r"¥300", "市内交通/其他计划误写 ¥300（应为 ¥240）"),
        ],
        "present": [
            (r"3,400", "合计 ¥3,400 与基准一致"),
            (r"1,700", "头部人均 ¥1,700"),
            (r"市内交通", "第 5 类目改回「市内交通」口径"),
            (r"¥650", "餐饮计划 ¥650"),
        ],
        "min_count": [],
    },
    "cardtest/guilin.html": {
        "label": "桂林卡（真正渲染出来的交付物）",
        "absent": [
            (r"3 DAYS 3 NIGHTS", "卡顶英文写成 3 天（视觉自检 bug #1）"),
            (r"¥168/人|168/人", "住宿误写 ¥168/人（翻车点 #2）"),
            (r"门票.*(260|255)", "均衡档门票 255/260（应为 200）(bug #2)"),
            (r"费用已计入交通", "D4 用「已计入」掩盖返程漏算（bug #3）"),
            (r"77[.]37", "deal 均值 77.37（应为 80.14）"),
        ],
        "present": [
            (r"4 DAYS 3 NIGHTS", "顶部 kicker 改回 4 DAYS 3 NIGHTS"),
            (r"1,700", "图上大数字人均 1,700"),
            (r"1,102", "往返交通合计 ¥1,102 备注"),
            (r"门票.{0,10}200", "均衡档门票 200"),
            (r"市内交通.{0,10}120", "市内交通 120（口径与基线一致）"),
            (r"可选自费 ¥55/人", "银子岩标为可选自费、不进均衡档"),
            (r"¥336/间/晚", "住宿口径 ¥/间/晚"),
            (r"空调", "冬季空调 / 供暖提示"),
        ],
        # (正则, 最少出现次数, 说明)：去程 + 返程各 ¥551，补回后才会有 4 处
        "min_count": [(r"¥551", 4, "去程/返程各 ¥551 共 4 处（曾只算去程）")],
    },
    "cardtest/guilin3d2n.html": {
        "label": "桂林 3 天 2 夜卡（最新、回填了真实房价；2026-11-04 纳入）",
        # 这张卡是后来重做的：回填了免登录 SSR 真实价、修了 flex 空白、
        # 并显式写「不写已计入」防返程漏算。此前一直没进 CLEAN_FILES，
        # 改坏了脚本查不出来 —— 属于真实的回归覆盖缺口。
        "absent": [
            (r"3 DAYS 3 NIGHTS", "天数写成 3 天 3 晚（应为 3 DAYS 2 NIGHTS）"),
            (r"费用已计入交通", "用「已计入」掩盖返程漏算（读图自检 bug #3 同源）"),
            (r"align-items:stretch", "两栏被拉出大片空白（读图自检抓到的视觉瑕疵复发）"),
        ],
        "present": [
            (r"3 DAYS 2 NIGHTS", "顶部 kicker 天数正确"),
            (r"1,381", "图上大数字人均 1,381"),
            (r"2,762", "2 人合计 2,762 / 均衡档"),
            (r"1,102", "往返高铁合计 1,102"),
            (r"加总自检", "分项加总自检行"),
            (r"不写「已计入」", "显式声明不写「已计入」"),
            (r"align-items:flex-start", "两栏空白的 CSS 修复"),
            (r"免登录 SSR", "真实房价已回填"),
            (r"气候常态", "窗口外天气如实标注"),
            (r"空调", "冬季空调 / 制热提示"),
        ],
        "min_count": [
            (r"¥551", 4, "去程 + 返程各计 ¥551（曾只算去程）"),
            (r"1,381", 3, "三处同步：大数字 / 均衡档 / 加总自检"),
        ],
    },
    "travel-agent.md": {
        "label": "提示词本身（不含基准记录区；¥168/人 是反例说明，不列入缺席检查）",
        "absent": [
            (r"3 DAYS 3 NIGHTS", "卡顶英文 3 天"),
            (r"77[.]37", "deal 均值 77.37"),
            (r"4,520|4520", "省钱档 4520（取整后应 4519）"),
            (r"9,205|9205", "深度档 9205（取整后应 9204）"),
            (r"¥2,950|2950", "处置后人均 2950（应 2952）"),
        ],
        "present": [],
        "min_count": [],
    },
    # 2026-11-06 纳入：境外（曼谷）卡。此前出境卡 5 固定附加块只写在提示词里、
    # 没有任何渲染卡、也没有断言验附加块真的在卡上 —— 规格写了产物没跟上。
    # 这里只放「错值必须缺席」（由 [D] 的 SELFTEST 做活体测试）；
    # 5 个「必须出现的附加块」由 [H] 单独按语义分组校验，避免两边重复计数。
    "cardtest/bangkok.html": {
        "label": "境外（曼谷）卡 · 出境附加块样板",
        "absent": [
            (r"3 DAYS 3 NIGHTS", "kicker 天数写成 3 天 3 晚（应为 4 DAYS 3 NIGHTS）"),
            (r"提前 72 小时以上填|72 小时以上.{0,8}填", "要求提前 72 小时以上填 TDAC（填早系统不认）"),
            (r"20 泰铢.{0,25}游客.{0,8}(也能|同样|均可|可享|都享|福利)|游客.{0,8}(也能|同样|可享).{0,25}20 泰铢",
             "把 20 泰铢国民票价写成游客也能享受（谁有资格陷阱）"),
            (r"20,000 THB.{0,15}(计入|算进).{0,10}(预算|消费)|把.{0,10}20,000 THB.{0,10}(计入|算进)",
             "把现金抽查门槛 20,000 THB 混进预计消费额（门槛值≠消费值）"),
        ],
        "present": [],
        "min_count": [],
    },
}

# 基准文件必须保留的「bug 记录区」——删掉这些节 = 基准失去教学价值，判退化
DOC_RECORD_SECTIONS = {
    "guilin-example.md":   [r"^## 回归检查点", r"^## 已知的历史翻车点"],
    "hangzhou-example.md": [r"^### 检查点", r"^## 数字自检", r"^## 历史翻车点"],
    "team-example.md":     [r"^## 回归检查点", r"^## 本样例专门针对的历史翻车点", r"^## 数字自检"],
    "bangkok-example.md":  [r"^## 回归检查点", r"^## 本样例埋的历史翻车点"],
}

# 每份样例必须保留的「正确值」锚点（错值检测只在 CLEAN_FILES 上做）
FACTS = {
    "guilin-example.md":   [r"275[.]5", r"336", r"1102", r"1008", r"650", r"400",
                            r"240", r"3400", r"1700", r"4 天 3 晚", r"12345"],
    "hangzhou-example.md": [r"1122", r"80[.]14", r"3144", r"3286", r"142",
                            r"1572", r"1643", r"12345"],
    "team-example.md":     [r"3400", r"3420", r"1945", r"1700", r"490",
                            r"2016", r"¥90", r"可执行性"],
    "bangkok-example.md":  [r"2024-03-01", r"TDAC", r"72", r"小时", r"5[.]078",
                            r"20,000 THB", r"3,939", r"13 位泰国身份证",
                            r"4 DAYS 3 NIGHTS", r"6144", r"3072", r"4519",
                            r"9204", r"2,952", r"2259[.]5", r"4602", r"2,400 THB"],
}


# ── 防复发断言的「活体测试」(2026-11-05 补) ─────────────────────────────
# CLEAN_FILES 的 absent 正则是「错值不得出现」的防线，但正则本身也可能写死：
# 转义写错、字符类收得太窄、或者被人误删一条 —— 那样 bug 真复发时脚本照样全绿。
# 这里给每条 absent 配一个「真实错值样例」，check_self() 用 has() 验证正则能命中它，
# 即：断言确实认得自己要防的那个错。纯内存构造，不碰真实文件。
# 格式：rel -> [(absent 正则, 能命中该正则的错值样例), ...]
SELFTEST = {
    "cardtest/guilin-spend.html": [
        (r"3,700", "合计（2 人）计划 ¥3,700 · 差额 −¥3,700"),
        (r"¥780", "餐饮 计划 ¥780 已花 ¥0"),
        (r"¥510", "门票 计划 ¥510 已花 ¥0"),
        (r"¥300", "其他 计划 ¥300 已花 ¥0"),
    ],
    "cardtest/guilin.html": [
        (r"3 DAYS 3 NIGHTS", "GUILIN · 3 DAYS 3 NIGHTS"),
        (r"¥168/人|168/人", "住宿按 ¥168/人 计"),
        (r"门票.*(260|255)", "均衡档门票 260 元"),
        (r"费用已计入交通", "D4 返程费用已计入交通"),
        (r"77[.]37", "14 家均值 ¥77.37"),
    ],
    "cardtest/guilin3d2n.html": [
        (r"3 DAYS 3 NIGHTS", "YANGSHUO · 3 DAYS 3 NIGHTS"),
        (r"费用已计入交通", "返程费用已计入交通"),
        (r"align-items:stretch", ".two{display:flex;align-items:stretch}"),
    ],
    "travel-agent.md": [
        (r"3 DAYS 3 NIGHTS", "kicker 写 3 DAYS 3 NIGHTS"),
        (r"77[.]37", "deal 均值 77.37"),
        (r"4,520|4520", "省钱档 4520"),
        (r"9,205|9205", "深度档 9205"),
        (r"¥2,950|2950", "处置后人均 ¥2,950"),
    ],
    "cardtest/bangkok.html": [
        (r"3 DAYS 3 NIGHTS", "BANGKOK · 3 DAYS 3 NIGHTS"),
        (r"提前 72 小时以上填|72 小时以上.{0,8}填", "请提前 72 小时以上填 TDAC"),
        (r"20 泰铢.{0,25}游客.{0,8}(也能|同样|均可|可享|都享|福利)|游客.{0,8}(也能|同样|可享).{0,25}20 泰铢",
         "20 泰铢全线统一票价，游客也能享受"),
        (r"20,000 THB.{0,15}(计入|算进).{0,10}(预算|消费)|把.{0,10}20,000 THB.{0,10}(计入|算进)",
         "把 20,000 THB 计入消费预算"),
    ],
}


def checkpoint_counts(text):
    # 返回 (checkbox 条数, 「## 回归检查点」小节内编号条数)。
    # 不用正则里的反斜杠，纯按行判断，避免 Windows/转义歧义。
    lines = text.splitlines()
    cb = sum(1 for l in lines if l.startswith("- [ ]"))
    start = next((i for i, l in enumerate(lines) if l.startswith("## 回归检查点")), None)
    num = 0
    if start is not None:
        import re as _re
        for l in lines[start + 1:]:
            if l.startswith("## "):
                break
            if _re.match(r"^[0-9]+[.] ", l):
                num += 1
    return cb, num


def check_self():
    # [D] 配置规模：四个基准字典被删空 / 删条目 = 覆盖静默缩水，判退化
    check(len(EXPECTED) == 4, "自检·配置", "EXPECTED 4 份基准齐全",
          "EXPECTED 只剩 %d 份" % len(EXPECTED))
    check(len(FACTS) == 4, "自检·配置", "FACTS 4 份齐全",
          "FACTS 只剩 %d 份" % len(FACTS))
    check(len(DOC_RECORD_SECTIONS) == 4, "自检·配置",
          "DOC_RECORD_SECTIONS 4 份齐全",
          "DOC_RECORD_SECTIONS 只剩 %d 份" % len(DOC_RECORD_SECTIONS))
    check(len(CLEAN_FILES) == 5, "自检·配置", "CLEAN_FILES 5 个交付物齐全",
          "CLEAN_FILES 只剩 %d 个" % len(CLEAN_FILES))

    # 每个干净交付物：文件真实存在，且确实配了断言（别出现「加了文件忘了配」）
    for rel, spec in CLEAN_FILES.items():
        t = read(ROOT / rel)
        n_assert = len(spec["absent"]) + len(spec["present"]) + len(spec["min_count"])
        check(t is not None and n_assert > 0,
              "自检·" + spec["label"],
              "文件存在，配了 %d 条断言" % n_assert,
              "文件缺失或断言被清空（%d 条）" % n_assert)

    # 每条 absent 断言都必须有活体样例，且样例能被 has() 命中
    for rel, spec in CLEAN_FILES.items():
        fixtures = dict(SELFTEST.get(rel, []))
        absent_pats = [p for p, _ in spec["absent"]]
        uncovered = [p for p in absent_pats if p not in fixtures]
        check(not uncovered, "自检·" + spec["label"] + "·fixture",
              "%d 条防复发断言都有活体样例" % len(absent_pats),
              "这些断言没有活体样例：%s" % uncovered)
        for pat, sample in SELFTEST.get(rel, []):
            check(has(sample, pat), "自检·" + spec["label"] + "·活体",
                  "断言活着：能认出「%s」" % pat,
                  "断言失效：正则 `%s` 认不出自己的错值样例" % pat)


def check_baselines():
    for name, spec in EXPECTED.items():
        t = read(EX / name)
        if t is None:
            check(False, f"基准·{name}", "", "文件不存在")
            continue
        n = line_count(t)
        cb, num = checkpoint_counts(t)
        got = cb + num
        check(n >= spec["min_lines"] and got == spec["total_cp"],
              f"基准·{name}",
              f"{n} 行，检查点 {got} 条（与基准一致）",
              f"{n} 行（应 ≥{spec['min_lines']}），检查点 {got} 条（应 {spec['total_cp']} 条）")

        miss_facts = [p for p in FACTS[name] if not has(t, p)]
        check(not miss_facts, f"基准·{name}·硬事实",
              f"{len(FACTS[name])} 条正确值锚点齐全",
              f"正确值缺失：{miss_facts}")

        miss_sec = [p for p in DOC_RECORD_SECTIONS[name] if not has(t, p)]
        check(not miss_sec, f"基准·{name}·记录区",
              f"{len(DOC_RECORD_SECTIONS[name])} 个 bug 记录/自检节仍在",
              f"记录区缺节：{miss_sec}")

    # 只有「干净交付物」才做错值缺席 / 修复项出现 / 出现次数下限
    for rel, spec in CLEAN_FILES.items():
        t = read(ROOT / rel)
        label = spec["label"]
        if t is None:
            check(False, f"交付物·{label}", "", f"{rel} 不存在")
            continue
        for pat, desc in spec["absent"]:
            check(not has(t, pat), f"交付物·{label}·防复发",
                  f"未复发：{desc}",
                  f"⚠️ 已修 bug 复发：{desc}（命中 `{pat}`）")
        for pat, desc in spec["present"]:
            check(has(t, pat), f"交付物·{label}·修复项",
                  f"已落地：{desc}",
                  f"修复项丢失：{desc}（缺 `{pat}`）")
        for pat, lo, desc in spec["min_count"]:
            cnt = len(re.findall(pat, t))
            check(cnt >= lo, f"交付物·{label}·修复项",
                  f"已落地：{desc}（实测 {cnt} 处）",
                  f"出现次数不足：{desc}（{cnt} < {lo}）")

    # README 必须保留的关键节
    r = read(EX / "README.md")
    if r:
        heads = ["怎么跑一次回归", "判定标准", "数字自检", "只有「读图自检」才抓得到的 bug",
                 "境外游多出来的四件事", "回归记录"]
        miss = [h for h in heads if not has(r, re.escape(h))]
        check(not miss, "基准·README", "6 个关键节齐全", f"README 缺节：{miss}")
        check(has(r, r"3400") and has(r, r"口径"),
              "基准·README", "数字自检命令与口径铁律仍在",
              "README 数字自检/口径铁律丢失")
    else:
        check(False, "基准·README", "", "README.md 不存在")


# ==========================================================================
# [E] 易过期事实台账
# ==========================================================================
# 设计理由：提示词反复强调「不带日期的汇率是定时炸弹」「政策要写生效日」，
# 但这些易过期事实本身散在提示词和样例里，没有一处登记「上次核实于哪天 / 出处在哪」。
# facts.json 就是那处登记。[E] 不判断事实真伪（那要联网），只保证：
#   ① 台账自身字段齐全、claim 能在声明的文件里找到（事实被删却没更新台账 = 真退化）
#   ② 过了复核期就列 INFO 提醒，但不因此把 CI 变红（时间流逝 ≠ 代码退化）
FACTS_FILE = EX / "facts.json"

# [F] 卡片静态健全。只断言「所有卡共有的底座」，不按卡型硬套内容：
# 品牌名「行旅」并非每张卡都有，de­al/prep/ontrip/review 也没有 DAYS kicker。
CARD_MIN = 8
CARD_BASE_COLORS = ["#FBF8F2", "#1E3A34"]
CARD_ACCENT_COLORS = ["#C8553D", "#C89B3C", "#5B7C99"]

# [G] 价格快照。提示词里写了「每晚 ¥110–952，中位 ¥332」这类实测数字，
# 快照 JSON 是这些数字的唯一真值源。这里用快照统计值**生成**该出现的句子，
# 再去提示词里找：两边任一被改而另一边没跟上，就会 FAIL。
SNAPSHOT_CLAIMS = [
    {
        "file": "cardtest/guilin-prices-20261201.json",
        "label": "桂林 12/1–12/3",
        "tpl": "每晚 ¥{min:.0f}–{max:.0f}，中位 ¥{med:.0f}",
    },
    {
        "file": "cardtest/yangshuo-weststreet-prices-20261201.json",
        "label": "阳朔西街 12/1–12/3",
        "tpl": "每晚 ¥{min:.0f}–{max:.0f}、中位 ¥{med:.0f}，{le300} 家 ≤¥300",
    },
]


def _snapshot_stats(path):
    d = json.loads(path.read_text(encoding="utf-8"))
    rows = d.get("rows")
    if not isinstance(rows, list) or not rows:
        return None, "rows 不是非空列表"
    vals = [r["per_night_num"] for r in rows
            if isinstance(r, dict) and isinstance(r.get("per_night_num"), (int, float))]
    if not vals:
        return None, "rows 里没有可用的 per_night_num"
    import statistics
    return {
        "raw": d,
        "min": min(vals), "max": max(vals),
        "med": round(statistics.median(vals)),
        "le300": sum(1 for v in vals if v <= 300),
        "n": len(vals),
    }, None


def check_facts():
    if not FACTS_FILE.exists():
        check(False, "台账·facts.json", "", "facts.json 不存在")
        return
    try:
        d = json.loads(FACTS_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        check(False, "台账·facts.json", "", "JSON 解析失败：%s" % e)
        return
    check(d.get("schema") == 1, "台账·facts.json",
          "schema=1 可识别", "schema 缺失或版本不认得：%r" % d.get("schema"))
    items = d.get("facts")
    if not isinstance(items, list) or not items:
        check(False, "台账·facts.json", "", "facts 列表为空")
        return

    cache = {}
    def txt(rel):
        if rel not in cache:
            cache[rel] = read(ROOT / rel)
        return cache[rel]

    today = datetime.date.today()
    stale = []
    for f in items:
        fid = f.get("id", "<无 id>")
        claim, src, day = f.get("claim"), f.get("source_url"), f.get("verified_on")
        places, every = f.get("in"), f.get("review_every_days")
        fields_ok = all([claim, src, day, isinstance(places, list) and places,
                         isinstance(every, int) and every > 0])
        check(fields_ok, "台账·" + fid,
              "字段齐全（claim / source_url / verified_on / in / review_every_days）",
              "字段缺失：claim=%r source_url=%r verified_on=%r in=%r every=%r"
              % (claim, src, day, places, every))
        if not fields_ok:
            continue
        try:
            vdate = datetime.date.fromisoformat(day)
            date_ok = vdate <= today
        except Exception:
            date_ok = False
            vdate = None
        check(date_ok, "台账·" + fid,
              "verified_on=%s 格式正确且不晚于今天" % day,
              "verified_on 非法或来自未来：%r" % day)
        missing = [p for p in places if txt(p) is None or claim not in txt(p)]
        check(not missing, "台账·" + fid,
              "claim 在 %d 个文件里都在" % len(places),
              "claim 在这些文件里找不到（事实被删/改却没更新台账）：%s" % missing)
        if vdate and (today - vdate).days > every:
            stale.append("%s（核实于 %s，%d 天未复核）" % (fid, day, (today - vdate).days))
    if stale:
        info("台账·复核提醒", "以下事实已过复核期，请人工现查后更新 verified_on：" + "；".join(stale))
    else:
        check(True, "台账·复核提醒", "%d 条事实都在复核期内" % len(items), "")


def check_cards():
    card_dir = ROOT / "cardtest"
    files = sorted(p for p in card_dir.glob("*.html")
                   if not p.name.startswith("_") and p.name not in ("t.html", "spend-out.html"))
    check(len(files) >= CARD_MIN, "卡片·清单",
          "入库卡片 %d 张（≥%d）" % (len(files), CARD_MIN),
          "卡片只剩 %d 张（应 ≥%d）" % (len(files), CARD_MIN))
    for p in files:
        t = read(p)
        label = "卡片·" + p.name
        if t is None:
            check(False, label, "", "文件读不到")
            continue
        miss_base = [c for c in CARD_BASE_COLORS if c not in t]
        check(not miss_base, label + "·底座",
              "基础色板齐全（%d/%d）" % (len(CARD_BASE_COLORS), len(CARD_BASE_COLORS)),
              "基础色缺失：%s" % miss_base)
        n_acc = sum(1 for c in CARD_ACCENT_COLORS if c in t)
        check(n_acc >= 2, label + "·底座",
              "强调色 %d/3（≥2）" % n_acc,
              "强调色只剩 %d/3（<2）" % n_acc)
        check(bool(re.search(r"<!DOCTYPE|<html", t, re.I)) and "charset" in t.lower(),
              label + "·底座", "DOCTYPE 与 charset 声明齐备",
              "缺 DOCTYPE 或 charset 声明")
        # kicker 天数关系：N 晚必然是 N+1 天。三张 plan 卡都带这个 kicker。
        pairs = re.findall(r"([0-9]+) DAYS ([0-9]+) NIGHTS", t)
        if pairs:
            bad = [(d, n) for d, n in pairs if int(d) != int(n) + 1]
            check(not bad, label + "·kicker",
                  "%d 处 kicker 都满足 DAYS = NIGHTS + 1" % len(pairs),
                  "天数/晚数对不上：%s" % bad)


def check_snapshots():
    prompt = read(PROMPT)
    for c in SNAPSHOT_CLAIMS:
        p = ROOT / c["file"]
        label = "快照·" + c["label"]
        if not p.exists():
            check(False, label, "", "%s 不存在" % c["file"])
            continue
        st, err = _snapshot_stats(p)
        if st is None:
            check(False, label, "", err)
            continue
        d = st["raw"]
        fields_ok = all(k in d for k in ("source", "city", "dates", "fetched_at", "rows"))
        check(fields_ok, label,
              "字段齐全（source/city/dates/fetched_at/rows）",
              "缺字段：%s" % [k for k in ("source", "city", "dates", "fetched_at", "rows") if k not in d])
        fa = d.get("fetched_at", "")
        check(bool(fa) and re.match(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}", str(fa)) is not None,
              label + "·采集时间",
              "有采集时间：%s" % fa,
              "缺 fetched_at 或格式不是 YYYY-MM-DD 开头：%r" % fa)
        sentence = c["tpl"].format(**st)
        check(prompt is not None and sentence in prompt, label + "·交叉一致",
              "提示词与快照一致：%s" % sentence,
              "提示词里找不到按快照生成的句子「%s」——两边数字对不上了" % sentence)


# ==========================================================================
# [H] 出境卡：5 个固定附加块真的出现在渲染卡上
# ==========================================================================
# 设计理由：travel-agent.md:396-401 规定「出境卡固定附加块」5 项，但此前
# cardtest/ 里没有任何境外卡，回归只在提示词文本里 grep 这几个关键词
# （check_prompt 的 A4），从没验过「附加块真的落在一张渲染卡上」——
# 规格写了、产物没跟上，是 m03520 盘点出的第二处真缺口。
# 分工：这里逐块验「必须出现的语义」(present)；「错值必须缺席」放在
# CLEAN_FILES 的 cardtest/bangkok.html 里，由 [D] 的 SELFTEST 做活体测试。
# 所有文本都是纯字面量、不含正则反斜杠，避开早先 edit 改写 \\s 的坑。
EXIT_CARD = {
    "file": "cardtest/bangkok.html",
    "baseline": "examples/bangkok-example.md",
    "blocks": [
        ("① kicker 天数与「X 天 Y 晚」一致", ["4 DAYS 3 NIGHTS", "4天3晚"]),
        ("② 汇率行：比率 + 采集日期", ["1 CNY ≈ 5.078 THB", "采集日期", "2026-11-02"]),
        ("③ 入境登记项 + 时间窗", ["tdac.immigration.go.th", "入境前 72 小时内", "12/14 之后才能填"]),
        ("④ 现金/证件门槛 + 只认现金", ["20,000 THB", "只认现金", "¥3,939"]),
        ("⑤ 不适用游客的政策陷阱 + 谁有资格", ["不适用游客", "13 位泰国身份证", "谁有资格"]),
    ],
    # 交叉一致：card_needle 用紧贴 DOM 的写法（>数字<），只认「大数字」那一处，
    # 防止卡里某个备注残留一个 6,144 就让大数字改错也照样全绿（反向验证抓到过）。
    # base_needle 用松散写法，在基准 md 里找同一个数即可。
    "cross": [
        ("3,072", ">3,072<", "3,072"),
        ("6,144", ">¥6,144<", "6,144"),
    ],
}


def check_exit_card():
    t = read(ROOT / EXIT_CARD["file"])
    if t is None:
        check(False, "出境卡·文件", "", "%s 不存在" % EXIT_CARD["file"])
        return
    for label, needles in EXIT_CARD["blocks"]:
        miss = [s for s in needles if s not in t]
        check(not miss, "出境卡·" + label,
              "%d 项必备文本齐备" % len(needles),
              "缺：%s" % miss)
    base = read(ROOT / EXIT_CARD["baseline"])
    for label, card_needle, base_needle in EXIT_CARD["cross"]:
        check(base is not None and card_needle in t and base_needle in base,
              "出境卡·交叉一致·" + label,
              "大数字「%s」与基准样例一致" % label,
              "卡里大数字或基准样例缺「%s」（两边数字对不上）" % label)


# ==========================================================================
# [I] 记账内核：兑现 spend/review 的「记一笔 → 自动更新对账」承诺
# ==========================================================================
# 设计理由：travel-agent.md:201 / :273 写着「用户说记一笔 ¥XX 项目就追加一行、
# 自动更新上方对账」，但仓库此前只有 3 个脚本、没有记账逻辑、没有实测、没有断言；
# guilin-spend.html 还是一张 ¥0 空白模板。这是 m03520 盘点出的唯一「承诺了没实现」。
# [I] 直接 importlib 加载 cardtest/ledger.py 调用 compute()/add_entry()/render_spend()，
# 做确定性的功能验证（纯标准库、不联网、不渲图），不是只读文本。
LEDGER = {
    "module": "cardtest/ledger.py",
    "golden": "cardtest/ledger-golden.json",
    "card": "cardtest/guilin-spend.html",
    "canonical": {"交通": 1102, "住宿": 1008, "餐饮": 650, "门票": 400, "市内交通": 240},
    "plan_total": 3400,
}


def check_ledger():
    import inspect
    import types
    modpath = ROOT / LEDGER["module"]
    if not modpath.exists():
        check(False, "记账·内核", "", "%s 不存在" % LEDGER["module"])
        return
    try:
        # 直接从源码 compile，绕过 __pycache__：否则「等长数字改回」（650→780→650
        # 字节数不变）会命中注入态残留的旧 .pyc，让回归读出旧值产生假 FAIL。
        # 回归断言必须只信当前源码字节，不能信任何缓存。
        src = modpath.read_text(encoding="utf-8")
        m = types.ModuleType("ledger_kernel")
        m.__file__ = str(modpath)
        exec(compile(src, str(modpath), "exec"), m.__dict__)
    except Exception as e:
        check(False, "记账·内核", "", "ledger.py 加载失败：%s" % e)
        return
    check(True, "记账·内核", "ledger.py 可作为模块加载（纯标准库）", "")

    # PLAN 是计划额唯一真值源，必须与 guilin-example.md 均衡档逐项一致
    plan = {p["key"]: p["plan"] for p in m.PLAN}
    check(plan == LEDGER["canonical"] and sum(plan.values()) == LEDGER["plan_total"],
          "记账·计划额真值源",
          "PLAN 与基准一致（%s = %d）" % ("/".join(str(v) for v in plan.values()),
                                        LEDGER["plan_total"]),
          "PLAN 漂移：%r" % plan)

    # 金额必须来自用户：add_entry 的 amount 必填且无默认值（不替用户编金额）
    amt = inspect.signature(m.add_entry).parameters.get("amount")
    guard = amt is not None and amt.default is inspect.Parameter.empty
    check(guard, "记账·金额来自用户",
          "add_entry 的 amount 必填无默认值（不替用户编金额）",
          "amount 有默认值或缺失 —— 可能替用户编金额，违反 travel-agent.md:201")

    # golden 夹具：compute() 的逐项对账结果
    gpath = ROOT / LEDGER["golden"]
    if not gpath.exists():
        check(False, "记账·golden 对账", "", "%s 不存在" % LEDGER["golden"])
        return
    g = json.loads(gpath.read_text(encoding="utf-8"))
    c = m.compute(g)
    e = g["expected"]
    ok = (c["count"] == e["count"]
          and abs(c["total"] - e["total"]) < 1e-6
          and abs(c["sum_spent"] - e["sum_spent"]) < 1e-6
          and abs(c["sum_diff"] - e["sum_diff"]) < 1e-6
          and c["plan_total"] == e["plan_total"]
          and all(abs(c["cats"][k]["spent"] - v) < 1e-6
                  for k, v in e["spent_by_cat"].items()))
    check(ok, "记账·golden 对账",
          "%d 笔 / 累计 ¥%s / 各类目已花与夹具一致" % (c["count"], c["total"]),
          "compute() 与 golden 夹具不符：%r" % c)

    # 空账本 = 空白模板态，不填假数字（travel-agent.md:201）
    empty = m.compute({"entries": []})
    check(empty["count"] == 0 and empty["total"] == 0,
          "记账·空白模板态",
          "空账本 0 笔 / 累计 ¥0（不替用户编数字）",
          "空账本就带支出，违反「没数据只给空白模板」")

    # 单一真值源：入库卡必须与 render_spend(空账本) 完全一致
    # （有人手改 HTML 却没改 ledger.py → 这里 FAIL）
    card = read(ROOT / LEDGER["card"])
    rendered = m.render_spend({"entries": []})
    check(card is not None and card.strip() == rendered.strip(),
          "记账·生成/入库同步",
          "guilin-spend.html 与 render_spend(空) 完全一致（改 PLAN 自动同步三处）",
          "入库卡与生成器不同步 —— 有人手改了 HTML 却没改 ledger.py")


# ==========================================================================
# [J] 行为回放用例：结构完整性（不判分只留痕）
# ==========================================================================
# 设计理由：静态回归查不了「逐轮行为输出是否同构」。这里不试图自动判分
# （措辞差异 / LLM 非确定性会让判分制造假 FAIL），只保证 cases.json 的
# 复现输入清单没被删空、每个用例都指向真实存在的基准、replay.py 提供留痕能力。
REPLAY = {
    "cases": "examples/cases.json",
    "tool": "examples/replay.py",
    "expected_cases": 5,
}


def check_replay():
    p = ROOT / REPLAY["cases"]
    if not p.exists():
        check(False, "回放·cases.json", "", "%s 不存在" % REPLAY["cases"])
        return
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as ex:
        check(False, "回放·cases.json", "", "JSON 解析失败：%s" % ex)
        return
    check(d.get("schema") == 1, "回放·cases.json", "schema=1 可识别",
          "schema 缺失：%r" % d.get("schema"))
    cases = d.get("cases")
    check(isinstance(cases, list) and len(cases) == REPLAY["expected_cases"],
          "回放·用例清单",
          "%d 个复现用例齐全" % REPLAY["expected_cases"],
          "用例数 %r（应 %d）" % (len(cases) if isinstance(cases, list) else None,
                                 REPLAY["expected_cases"]))
    if not isinstance(cases, list):
        return
    ids = [c.get("id") for c in cases]
    check(len(ids) == len(set(ids)), "回放·用例 id", "id 无重复", "id 重复：%s" % ids)
    miss_src = [c.get("source") for c in cases
                if c.get("source") and not (ROOT / c["source"]).exists()]
    check(not miss_src, "回放·基准引用",
          "%d 个用例都指向存在的基准" % len(cases),
          "指向不存在的基准：%s" % miss_src)
    incomplete = [c.get("id") for c in cases
                  if not all(c.get(k) for k in ("intent", "turns", "watch", "hard_facts"))]
    check(not incomplete, "回放·用例字段",
          "每个用例都有 intent/turns/watch/hard_facts",
          "字段不全：%s" % incomplete)
    # 「不判分」是这套骨架的立身之本，台账必须明说
    check("不判分" in d.get("note", "") and "不判分" in d.get("principle", ""),
          "回放·不判分原则",
          "台账明说「不判分只留痕」（不制造假 FAIL）",
          "丢了不判分声明 —— 有人想给行为回放加自动判分")
    tool = read(ROOT / REPLAY["tool"])
    check(tool is not None and "不判分" in tool and "def cmd_trace" in tool,
          "回放·操作卡",
          "replay.py 提供 list/prompt/trace，且明说不判分",
          "replay.py 缺失或丢了 trace 留痕能力")

# ==========================================================================
# [K] 应用一致性：PWA/Worker 与唯一真值源 travel-agent.md 的漂移检测
# ==========================================================================
# 设计理由：把提示词做成可随时调用的手机 PWA 后，worker/src/prompt.js 是
# travel-agent.md 的「生成副本」。一旦改了提示词却忘了重跑 builder，线上
# Agent 的行为就与仓库基准脱节 —— 这正是静态回归必须能挡住的退化。
# 分工：① 皇冠门禁 = prompt.js 内嵌字符串与 travel-agent.md 逐字节一致；
# ② 应用骨架完整性 = worker/ 与 app/ 关键件齐全、密钥不泄漏、SW 缓存清单
# 没漏文件、manifest 合法；③ 凭据扫描正则本身用活体样例验证「真的会命中」，
# 否则「0 命中」可能只是正则被改松后的假绿。
APP = {
    "prompt_js": "worker/src/prompt.js",
    "builder": "tools/build-system-prompt.mjs",
    "wrangler": "worker/wrangler.toml",
    "worker_index": "worker/src/index.js",
    "manifest": "app/manifest.webmanifest",
    "sw": "app/sw.js",
    "icons": ["app/icons/icon-192.png", "app/icons/icon-512.png"],
    "samples": ["app/sample-plan.md", "app/sample-plan-card.png"],
    "sw_shell": [
        "./", "./index.html", "./styles.css", "./app.js",
        "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
        "./sample-plan.md", "./sample-plan-card.png",
    ],
    "wrangler_vars": ["LLM_BASE_URL", "LLM_MODEL", "ALLOWED_ORIGIN"],
    "manifest_keys": ["name", "short_name", "start_url", "display", "icons"],
}

# 只扫「部署运行时代码/配置」，排除 README / .dev.vars.example / test.mjs
# 这类合法讨论键名的文档与测试文件。每条 pattern 都配一个活体样例。
#
# 活体样例用 _fixture() 运行时拼接，而不是写成一个连续字符串：
# 否则 "sk-ABCDEF..." 这种字面量会被整仓凭据扫描 / GitHub secret scanning
# 误报成真泄漏，把「提交前 0 命中」这条硬不变量拖下水。
# 拼接后仍必须能被各自的正则命中，check_app() 会逐条验活。
def _fixture(*parts):
    return "".join(parts)


CREDENTIAL_PATTERNS = [
    ("sk", r"sk-[A-Za-z0-9]{20,}",
     _fixture("sk-", "ABCDEF09" * 4)),
    ("ghp", r"ghp_[A-Za-z0-9]{20,}",
     _fixture("ghp_", "ABCDEF09" * 4)),
    ("github_pat", r"github_pat_[A-Za-z0-9_]{20,}",
     _fixture("github_pat_", "ABCDEF_09" * 3)),
    ("x-access", r"x-access-token:[A-Za-z0-9_]{10,}",
     _fixture("x-access-token:", "ABCDEF0123456789")),
    ("envkey", r"LLM_API_KEY[=]\S+",
     _fixture("LLM_API_KEY", "=", "deadbeef", "secret", "123456")),
    ("pem", r"BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY",
     _fixture("BEGIN OPENSSH ", "PRIVATE", " KEY")),
]
APP_SCAN_FILES = [
    "app/index.html", "app/styles.css", "app/app.js",
    "app/manifest.webmanifest", "app/sw.js",
    "worker/src/index.js", "worker/src/prompt.js",
    "worker/wrangler.toml", "tools/build-system-prompt.mjs",
]


def check_app():
    # ---- ① 皇冠门禁：prompt.js 的内嵌字符串与 travel-agent.md 逐字节一致 ----
    pj = ROOT / APP["prompt_js"]
    t = read(pj)
    if t is None:
        check(False, "应用·提示词同步", "",
              "%s 不存在（改了提示词要重跑 node tools/build-system-prompt.mjs）" % APP["prompt_js"])
    else:
        m = re.search(r'^export const PROMPT = (".*");$', t, re.M)
        ok, detail = False, ""
        if m:
            try:
                embedded = json.loads(m.group(1))
                ok = embedded.encode("utf-8") == PROMPT.read_bytes()
                if not ok:
                    detail = "内嵌字符串与 travel-agent.md 不一致（提示词改了没重跑 builder）"
            except Exception as ex:
                detail = "内嵌字符串不是合法 JSON 串：%s" % ex
        else:
            detail = "找不到单行 `export const PROMPT = \"...\";` 字面量"
        check(ok, "应用·提示词同步·逐字节",
              "worker/src/prompt.js 与 travel-agent.md 逐字节一致",
              detail or "提示词副本与唯一真值源漂移")

    # ---- ② builder 存在且指向「唯一真值源 → 产物」两文件 ----
    b = read(ROOT / APP["builder"])
    check(b is not None and "travel-agent.md" in b and "prompt.js" in b,
          "应用·builder",
          "build-system-prompt.mjs 引用 travel-agent.md → prompt.js",
          "builder 缺失或没指向唯一真值源/产物")

    # ---- ③ wrangler：三变量在场、密钥不得写进 [vars] ----
    w = read(ROOT / APP["wrangler"])
    vars_ok = w is not None and all(v in w for v in APP["wrangler_vars"])
    check(vars_ok, "应用·wrangler·变量",
          "LLM_BASE_URL / LLM_MODEL / ALLOWED_ORIGIN 三个非敏感变量在场",
          "wrangler.toml 缺变量或整个文件不在")
    key_in_vars = w is not None and bool(re.search(r"LLM_API_KEY\s*=\s*\S+", w))
    check(not key_in_vars, "应用·wrangler·密钥隔离",
          "LLM_API_KEY 未写进 wrangler.toml（只走 wrangler secret）",
          "wrangler.toml 里出现 LLM_API_KEY= 的字面量赋值 —— 密钥泄漏")

    # ---- ④ manifest 合法 JSON + 必需键 ----
    mf = read(ROOT / APP["manifest"])
    manifest_ok, keys_missing = False, list(APP["manifest_keys"])
    try:
        d = json.loads(mf)
        manifest_ok = True
        keys_missing = [k for k in APP["manifest_keys"] if k not in d]
    except Exception:
        pass
    check(manifest_ok, "应用·manifest·合法",
          "manifest.webmanifest 是可解析的合法 JSON",
          "manifest.webmanifest 缺失或不是合法 JSON")
    check(manifest_ok and not keys_missing, "应用·manifest·必需键",
          "name/short_name/start_url/display/icons 必需键齐全",
          "缺必需键：%s" % keys_missing)

    # ---- ⑤ sw.js：缓存清单 9 项齐 + 对应文件真实存在 + /api/chat 不缓存 ----
    sw = read(ROOT / APP["sw"])
    shell_miss = [s for s in APP["sw_shell"] if sw is None or ('"' + s + '"') not in sw]
    check(not shell_miss, "应用·sw·缓存清单",
          "APP_SHELL 9 项离线外壳齐备",
          "sw.js 缓存清单缺：%s" % shell_miss)
    shell_files = [s for s in APP["sw_shell"] if s != "./"]
    file_miss = [s for s in shell_files if not (ROOT / "app" / s.lstrip("./")).exists()]
    check(not file_miss, "应用·sw·文件存在",
          "APP_SHELL 指向的文件在磁盘上都存在",
          "缓存清单指向不存在的文件：%s" % file_miss)
    check(sw is not None and "/api/chat" in sw,
          "应用·sw·API 不缓存",
          "sw.js 明确把 /api/chat 排除在缓存外（network-only）",
          "sw.js 没处理 /api/chat，可能伪造聊天响应")

    # ---- ⑥ worker/src/index.js：system 注入 + 转发 + 角色清洗骨架 ----
    idx = read(ROOT / APP["worker_index"])
    idx_needles = ["PROMPT", "chat/completions", "LLM_API_KEY", "system", "role"]
    idx_miss = [s for s in idx_needles if idx is None or s not in idx]
    check(not idx_miss, "应用·worker·转发骨架",
          "注入 system=PROMPT、拼 /chat/completions、读 env 密钥、清洗 role 的关键字在场",
          "worker 转发骨架缺关键字：%s" % idx_miss)

    # ---- ⑦ 凭据正则活体验证 + 部署运行时文件 0 命中 ----
    for name, pat, sample in CREDENTIAL_PATTERNS:
        check(has(sample, pat), "应用·凭据正则·" + name,
              "正则能命中活体样例（没被改松）",
              "正则永不命中会让「0 命中」变成假绿：" + pat)
    missing_scan = [rel for rel in APP_SCAN_FILES if not (ROOT / rel).exists()]
    check(not missing_scan, "应用·运行时文件",
          "部署运行时代码/配置文件齐全",
          "缺运行时文件：%s" % missing_scan)
    hits = []
    for rel in APP_SCAN_FILES:
        txt = read(ROOT / rel)
        if txt is None:
            continue
        for name, pat, _ in CREDENTIAL_PATTERNS:
            if re.search(pat, txt, re.M):
                hits.append(rel + " :: " + name)
    check(not hits, "应用·凭据·零命中",
          "部署运行时代码/配置里 0 个疑似真实密钥形态",
          "疑似密钥泄漏：" + "; ".join(hits))

    # ---- ⑧ 图标 / ⑨ 已核实样例成品存在 ----
    icon_miss = [rel for rel in APP["icons"] if not (ROOT / rel).exists()]
    check(not icon_miss, "应用·图标",
          "PWA 192/512 图标齐备",
          "缺图标：%s" % icon_miss)
    sample_miss = [rel for rel in APP["samples"] if not (ROOT / rel).exists()]
    check(not sample_miss, "应用·样例成品",
          "Demo 模式的已核实样例 md + PNG 齐备",
          "缺样例成品：%s" % sample_miss)




# ==========================================================================
# [L] 桥一致性：本机 DSH 模型桥（bridge/）与前端三态接入的漂移检测
# ==========================================================================
# 为什么需要这一块：v1 的 PWA 要么自带 Worker+Key，要么只能看静态 Demo。
# 桥把「DSH 当前模型」直接接到页面上，于是多出一条**新的真值来源**，
# 而桥最容易坏的方式不是崩，而是「悄悄说错话」：
#   ① 提示词副本换了个读法 → 又与 travel-agent.md 漂移（[K] 只管 worker 那份）
#   ② 端口在 patch 里改了、index.js 默认值没跟上 → 装上去监听在意外的端口
#   ③ 安全件被删（Host 校验 / bearer / 丢弃客户端 system）→ 变成开放代理或提示词可篡改
#   ④ sw.js 忘了把新接口排除缓存 → 重启后拿旧 token 一直 401
#   ⑤ 前端三态判据退化 → 桥连着却仍报 Demo（实测截图抓到过这条）
# 因此 [L] 只断言「这些结构必须一直在」，并配反向验证。
BRIDGE = {
    "dir": "bridge",
    "package": "bridge/package.json",
    "patch": "bridge/cordis.patch.yml",
    "index": "bridge/index.js",
    "readme": "bridge/README.md",
    "icon": "bridge/icon.svg",
    "locale": ["bridge/locale/en.json", "bridge/locale/zh.json"],
    "prompt_target": "worker/src/prompt.js",
}

# 桥的安全/功能关键件。每一条都对应一个真实的失效方式，不是凑数。
BRIDGE_NEEDLES = [
    ("llm-stream", "ctx.llm.stream",
     "用宿主进程内 ctx.llm.stream 跑当前模型（不是伪造 shim token）"),
    ("host-guard", "isLoopbackHost",
     "校验 Host 头，挡 DNS rebinding"),
    ("bearer", "bearerOk",
     "除引导端点外一律要 bearer"),
    ("token-random", "randomBytes",
     "token 每进程随机，不落盘"),
    ("prompt-load", "prompt.js",
     "系统提示词从 worker/src/prompt.js 读（与 [K] 同一真值源）"),
    ("drop-system", "system",
     "丢弃客户端伪造的 system，防提示词篡改"),
]


def check_bridge():
    # ---- ① package.json：合法 JSON + 清单硬要求 ----
    pj = read(ROOT / BRIDGE["package"])
    pj_ok, pj_detail = False, "bridge/package.json 缺失"
    if pj is not None:
        try:
            d = json.loads(pj)
            pj_ok = True
            bundle = (d.get("dsh") or {}).get("bundle") or {}
            if not bundle.get("patch"):
                pj_ok, pj_detail = False, "package.json 缺 dsh.bundle.patch"
            exports = d.get("exports") or {}
            # 官方硬要求：必须导出 ./locale/*.json 与 ./icon，否则安装后 title/图标读不到
            if "./locale/*.json" not in exports:
                pj_ok, pj_detail = False, "exports 缺 ./locale/*.json（官方硬要求）"
            if "./icon" not in exports:
                pj_ok, pj_detail = False, "exports 缺 ./icon（官方硬要求）"
        except Exception as ex:
            pj_detail = "不是合法 JSON：%s" % ex
    check(pj_ok, "桥·package 清单", "bridge/package.json 合法且含 bundle/exports 硬要求", pj_detail)

    # ---- ② cordis.patch.yml 与 index.js 的端口不能各说各话 ----
    patch = read(ROOT / BRIDGE["patch"])
    idx = read(ROOT / BRIDGE["index"])
    m_port = re.search(r"^\s*port:\s*(\d+)", patch or "", re.M)
    patch_port = m_port.group(1) if m_port else None
    check(patch is not None and patch_port and "'@local/xinglv-llm-bridge'" in patch,
          "桥·patch 注册",
          "cordis.patch.yml 注册 @local/xinglv-llm-bridge 且带端口",
          "bridge/cordis.patch.yml 缺失或没注册 entry/端口")
    # index.js 里的默认端口必须就是 patch 里写的那个，否则「改一处忘另一处」会静默漂移
    idx_port_ok = bool(idx and patch_port and re.search(r"\b" + patch_port + r"\b", idx))
    check(idx_port_ok, "桥·端口一致",
          "index.js 默认端口与 cordis.patch.yml 一致（%s）" % patch_port,
          "patch 里是 %s，但 index.js 找不到该端口 —— 两处漂移" % patch_port)

    # ---- ③ 安全/功能关键件必须全在 ----
    miss = [label for label, needle, _ in BRIDGE_NEEDLES if idx is None or needle not in idx]
    check(not miss, "桥·关键件齐全",
          "ctx.llm.stream / Host 校验 / bearer / 随机 token / 提示词读取 / 系统提示词处理 全在",
          "桥丢了关键件：%s" % miss)

    # ---- ④ 桥读的提示词文件，必须就是 [K] 皇冠门禁管的那份 ----
    same_src = bool(idx and "prompt.js" in idx and "worker" in idx)
    check(same_src, "桥·提示词同源",
          "桥从 worker/src/prompt.js 读系统提示词（与 [K] 同一真值源）",
          "桥读提示词的路径不是 worker/src/prompt.js —— 会出现第二份真值源")

    # ---- ⑤ 显示元数据：清单、图标、双语 locale 都得在，且不是模板文案 ----
    meta_miss = [rel for rel in [BRIDGE["readme"], BRIDGE["icon"]] + BRIDGE["locale"]
                 if not (ROOT / rel).exists()]
    check(not meta_miss, "桥·显示元数据",
          "README / 图标 / 中英 locale 齐备",
          "缺显示元数据文件：%s" % meta_miss)
    tmpl = []
    for rel in BRIDGE["locale"]:
        t = read(ROOT / rel)
        if t is None:
            continue
        try:
            d = json.loads(t)
        except Exception:
            tmpl.append(rel + "(非法 JSON)")
            continue
        meta = d.get("meta") or {}
        title = (meta.get("title") or "").strip()
        desc = (meta.get("description") or "").strip()
        # 官方要求：必须真实描述能力，不许留模板文案
        if not title or not desc or "TODO" in title + desc or "示例" in title + desc:
            tmpl.append(rel)
    check(not tmpl, "桥·locale 真实",
          "中英 locale 的 meta.title/description 都是真实描述，非模板占位",
          "locale 元数据像模板或缺失：%s" % tmpl)

    # ---- ⑥ 桥源码凭据 0 命中（复用 [K] 的正则，同样先验活）----
    bridge_scan = [BRIDGE["index"], BRIDGE["patch"], BRIDGE["package"]]
    hits = []
    for rel in bridge_scan:
        txt = read(ROOT / rel)
        if txt is None:
            continue
        for name, pat, _ in CREDENTIAL_PATTERNS:
            if re.search(pat, txt, re.M):
                hits.append(rel + " :: " + name)
    check(not hits, "桥·凭据·零命中",
          "bridge/ 运行时代码 0 个疑似真实密钥形态（token 是运行时随机生成的）",
          "桥里疑似写死了密钥：" + "; ".join(hits))

    # ---- ⑦ 前端三态：桥 > Worker > Demo 的判据必须在 ----
    ajs = read(ROOT / "app/app.js")
    fe_miss = [s for s in ["probeBridge", "bridge-info.json", "/v1/chat/completions",
                           "sendToBackend", "isLoopbackOrigin"]
               if ajs is None or s not in ajs]
    check(not fe_miss, "桥·前端三态",
          "app.js 具备桥探测 / OpenAI 兼容调用 / 统一后端分发 / loopback 判定",
          "前端三态接入缺：%s" % fe_miss)
    # 桥优先：必须是在 updateMode() 里先判 bridge。
    # 不能拿整文件里的任意 "if (bridge)" 充数 —— sendToBackend 里也有一个，
    # 那样 updateMode 完全不看桥也能混过去（反向验证抓到过）。
    um = re.search(r"function updateMode\s*\([^)]*\)\s*\{(.*?)\n  \}", ajs or "", re.S)
    bridge_first = bool(um and re.search(r"if\s*\(\s*bridge\s*\)", um.group(1)))
    check(bridge_first, "桥·优先级",
          "updateMode 里先判 bridge（桥 > Worker > Demo），模式芯片才会报「本机」",
          "updateMode 没有先判 bridge —— 桥连着也可能落到 Demo/Worker 分支")

    # ---- ⑧ sw.js 必须把桥的两个接口排除在缓存外 ----
    # 注意：不能只查「文件里出现过这个路径」—— sw.js 的注释里也写了一遍路径，
    # 删掉真正的守卫仍然能查得到（反向验证抓到过）。必须查 endsWith(...) 实调用。
    sw = read(ROOT / "app/sw.js")
    guard_miss = [p for p in ["/api/chat", "/v1/chat/completions", "/bridge-info.json"]
                  if sw is None or not re.search(r"endsWith\(\s*['\"]" + re.escape(p) + r"['\"]", sw)]
    check(not guard_miss, "桥·SW 不缓存接口",
          "sw.js 用 endsWith() 实调用把 Worker 与桥的对话接口、以及带随机 token 的引导端点排除缓存",
          "sw.js 缓存守卫缺实调用（注释里提到不算）：%s（重启后可能拿旧 token 一直 401）" % guard_miss)


REPRO = [
    ("guilin-example.md", "第 1 轮首轮提问",
     "「我需要一个广西3天游，12。1-12.4日回来的旅游，深圳出发」",
     "随后依次：「A」→「山水暴走 + 美食混合」（人数预算不答，看是否用默认 2 人/¥1500）"),
    ("hangzhou-example.md", "四个非规划模式",
     "「杭州这几家杭帮菜到底哪家值？」 / 「下周三出发去杭州，这几天要准备啥？」 / "
     "「到杭州了，今天下雨，原定去灵隐寺还去吗？」 / 「回来了，帮我看看这次超支没有。」",
     "四个模式各跑一次，看结构与口径"),
    ("team-example.md", "多角色冲突场景",
     "把「三个角色的原始交付」整段照贴给支持多角色的 Agent",
     "看汇总者是否抓出 4 个坑、不误判餐饮 650 干扰项、按裁决顺序处理"),
    ("bangkok-example.md", "境外变体",
     "「12 月中去曼谷玩几天，从深圳走，两个人，预算你看着办」",
     "随后：「12/17-12/20 行，护照没问题，人均 3000 含机票」"),
]


def emit_prompt():
    print(_BOLD + "== 复现指令（把这些喂给待测 Agent，再按 README 判定标准对照）==" + _RST)
    for name, scene, user_input, follow in REPRO:
        print(f"\n[{name}] · {scene}")
        print("  用户输入：" + user_input)
        print("  后续/说明：" + follow)
    print("\n判定四类：硬事实=完全一致 / 口径=同口径且显式声明 / 结构=章节齐全 / 文风=允许不同。")
    print("任一项硬事实或口径不符 → 判退化。")


# ==========================================================================
# 报告
# ==========================================================================
def render():
    out = []
    out.append("# 旅行 Agent 回归报告")
    out.append("")
    out.append(f"- 生成时间：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    out.append(f"- 工作目录：`{ROOT}`")
    out.append(f"- 检查对象：`travel-agent.md` + `examples/` 四份基准 + `README.md` + 断言自检"
               f" + 事实台账 + 卡片静态健全 + 价格快照交叉 + 出境卡附加块"
               f" + 记账内核 + 行为回放用例 + 应用一致性(PWA/Worker)"
               f" + 本机模型桥(bridge/)漂移")
    out.append("")
    n_fail = sum(1 for l, _, _ in RESULTS if l == "FAIL")
    n_pass = sum(1 for l, _, _ in RESULTS if l == "PASS")
    out.append(f"**结论：{'✅ 全绿，未发现退化' if n_fail == 0 else '❌ 发现退化，见下方 FAIL'}**"
               f"（PASS {n_pass} / FAIL {n_fail} / INFO {len(RESULTS)-n_pass-n_fail}）")
    out.append("")

    # 按 section 分组
    groups = {}
    for lvl, sec, msg in RESULTS:
        groups.setdefault(sec, []).append((lvl, msg))
    out.append("| 状态 | 检查项 | 结果 |")
    out.append("|---|---|---|")
    for sec, rows in groups.items():
        for lvl, msg in rows:
            tag = {"PASS": PASS, "FAIL": FAIL, "INFO": INFO}[lvl]
            out.append(f"| {tag} | `{sec}` | {msg} |")
    out.append("")

    if n_fail:
        out.append("## 需要处理")
        out.append("")
        for lvl, sec, msg in RESULTS:
            if lvl == "FAIL":
                out.append(f"- ❌ `{sec}` — {msg}")
        out.append("")

    out.append("## 脚本没覆盖的部分（仍需人工/半自动）")
    out.append("")
    out.append("本脚本只做**静态结构 + 算术重算 + 基准完整性 + 断言自检 + 事实台账 + "
               "卡片静态健全 + 价格快照交叉 + 出境卡附加块 + 记账内核 + "
               "行为回放用例 + 应用一致性(PWA/Worker 漂移)**检查。下面四项必须按 "
               "`examples/README.md`「怎么跑一次回归」实际喂给 Agent 对照：")
    out.append("")
    out.append("1. 逐轮**行为输出**是否同构（首行模式标签、≤3 问带默认值、三档内容不同…）")
    out.append("2. 图卡是否真的渲染出来、尺寸是否正确、有视觉能力时是否逐字目检 kicker/页脚")
    out.append("3. 实时数据是否现查（登录态房价、天气窗口、12345 现役号码）")
    out.append("4. 措辞差异 ≠ 退化；但硬事实（票价/汇率/政策日）与口径一旦不同就必须判退化")
    out.append("")
    out.append("复现输入清单：")
    out.append("")
    for name, scene, user_input, follow in REPRO:
        out.append(f"- **{name}**（{scene}）：{user_input}；{follow}")
    out.append("")
    out.append("命令：`\"$PY\" examples/regress.py --emit-prompt` 可单独打印复现指令。")
    return "\n".join(out)


def main():
    args = sys.argv[1:]
    # Windows 控制台默认 GBK，报告里的 emoji（✅/❌）会触发 UnicodeEncodeError。
    # 强制 stdout/stderr 用 UTF-8；老版本 Python 没有 reconfigure 时静默跳过。
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if "--emit-prompt" in args:
        emit_prompt()
        return 0

    check_prompt()
    check_numbers()
    check_baselines()
    check_self()
    check_facts()
    check_cards()
    check_snapshots()
    check_exit_card()
    check_ledger()
    check_replay()
    check_app()
    check_bridge()

    report = render()
    print(report)

    if "--report" in args:
        p = EX / "report.md"
        p.write_text(report, encoding="utf-8")
        print(f"\n{INFO} 报告已写入 {p}")

    n_fail = sum(1 for l, _, _ in RESULTS if l == "FAIL")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
