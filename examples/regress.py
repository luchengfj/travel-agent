#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
regress.py — 旅行 Agent 提示词 / 回归基准 的一次性自检脚本

用法（在 C:\\ai 下，bash 里 python 不在 PATH，用运行时自带 Python）：
    PY="C:/Users/cheng/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/python/python.exe"
    "$PY" examples/regress.py              # 打印报告
    "$PY" examples/regress.py --report     # 同时落盘 report.md
    "$PY" examples/regress.py --emit-prompt # 打印「喂给 Agent 的复现指令」后退出

它验四件事，缺一不可：
  [A] 结构 : travel-agent.md 的必需章节、硬规则关键词、7 张图卡规格都在
  [B] 数字 : 四份样例里的分项/合计/人均/换算，用 Python 重算一遍（基准自己也会算错）
  [C] 基准 : 四份样例的检查点、历史翻车点、已知 bug 记录仍在；并检测已修 bug 复发
  [D] 自检 : 断言配置没被删空、干净交付物确实存在、每条防复发正则都认得自己的错值

脚本只做「静态 + 算术」检查，不调用 LLM、不渲染图卡。
逐轮喂给 Agent 的**行为对照**仍按 README.md「怎么跑一次回归」人工/半自动完成，
脚本末尾会把每份样例的「复现输入 + 检查点条数」列成清单。

退出码：0 = 全绿；1 = 有 FAIL（任一硬事实/口径/结构不符即视为退化）。
"""

import re
import sys
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # C:\ai
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
    check(len(CLEAN_FILES) == 3, "自检·配置", "CLEAN_FILES 3 个交付物齐全",
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
# 复现输入（脚本不跑 LLM，只把「该喂什么」列清楚）
# ==========================================================================
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
    out.append(f"- 检查对象：`travel-agent.md` + `examples/` 四份基准 + `README.md` + 断言自检")
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
    out.append("本脚本只做**静态结构 + 算术重算 + 基准完整性**检查。下面四项必须按 "
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
