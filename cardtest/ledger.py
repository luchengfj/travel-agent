#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ledger.py — spend / review 模式的「消费记账」内核 + 图卡生成器

兑现 travel-agent.md:201 / :273 的承诺：
    用户说「记一笔 ¥XX 项目」就追加一行、自动更新上方对账；
    金额必须来自用户，不替用户编；没数据时只给空白模板 + 提醒，不填假数字。

设计要点（load-bearing）：
  · PLAN 是计划额的**唯一真值源**，数值与 examples/guilin-example.md:92-99
    的均衡档一致（1102/1008/650/400/240 = 3400，人均 1700）。
    曾经的 bug：这张卡写 780/510/300 合计 3700（人均 1850），与基准和卡头自相矛盾。
    现在 guilin-spend.html 由本文件 render 生成，金额只改这一处，三处自动同步。
  · add_entry 的 amount 是**必填关键字参数、无默认值**：不传即报错，
    从接口层杜绝「替用户编一个像样的金额」。
  · compute() 是纯函数：给一份账本，算出笔数/累计/占比/各类目已花与差额/合计。
  · render_spend() 用 compute() 的结果生成完整 spend 卡 HTML；空账本 = 空白模板态，
    所有「已花」为 0、流水表显示「暂无记录」——绝不填假数字。

命令（在 C:\\ai 下用运行时自带 Python，见 AGENTS.md）：
    "$PY" cardtest/ledger.py init                 # 建空账本 cardtest/ledger-data.json
    "$PY" cardtest/ledger.py add --amount 150 --item 啤酒鱼 --category 餐饮 --pay 微信 --time "12/1 19:20"
    "$PY" cardtest/ledger.py show                # 打印账本 JSON
    "$PY" cardtest/ledger.py summary             # 打印对账摘要（纯计算，不写文件）
    "$PY" cardtest/ledger.py render              # 重新生成 cardtest/guilin-spend.html
    "$PY" cardtest/ledger.py demo                # 用 3 笔**演示**账生成 _ledger-demo.html
                                                  #   （演示数据，非真实消费，仅验证自动对账）

本脚本不联网、不调 LLM、不判分。回归断言在 examples/regress.py 的 [I] 块。
"""

import argparse
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
DEFAULT_LEDGER = HERE / "ledger-data.json"
DEFAULT_SPEND_HTML = HERE / "guilin-spend.html"

# ── 计划额唯一真值源 ──────────────────────────────────────────────────────
# 与 examples/guilin-example.md:92-99 均衡档逐项对应。改这里，卡上三处同步。
PLAN = [
    {"key": "交通",     "plan": 1102, "note": "深圳北⇄阳朔 高铁往返"},
    {"key": "住宿",     "plan": 1008, "note": "¥336/间/晚 × 3 晚 · 2 人 1 间"},
    {"key": "餐饮",     "plan": 650,  "note": "啤酒鱼 / 烧鹅 / 米粉等"},
    {"key": "门票",     "plan": 400,  "note": "遇龙河/漓江/银子岩等"},
    {"key": "市内交通", "plan": 240,  "note": "打车 / 包车 / 接驳"},
]
# 由 PLAN 推导，绝不另写一份数字（否则又会漂移）
PLAN_TOTAL = sum(p["plan"] for p in PLAN)          # 3400
PER_PERSON = PLAN_TOTAL // 2                        # 1700
CATEGORIES = [p["key"] for p in PLAN]


def fmt(v):
    """金额显示：整数不带小数、大额带千分位（3400 → 3,400；275.5 → 275.5）。"""
    return format(v, ",.10g")


def load(path):
    p = Path(path)
    if not p.exists():
        return {"entries": []}
    d = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(d, dict) or not isinstance(d.get("entries"), list):
        raise ValueError("账本格式不对：应为 {\"entries\": [...]}")
    return d


def save(path, ledger):
    Path(path).write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def add_entry(ledger, *, amount, item, category, pay="现金", time=""):
    """追加一笔。amount 必填且无默认值 —— 不替用户编金额（travel-agent.md:201）。"""
    if amount is None:
        raise ValueError("金额必须来自用户，不能为空")
    if category not in CATEGORIES:
        raise ValueError("未知类目：%s（应为 %s）" % (category, "/".join(CATEGORIES)))
    amt = float(amount)
    if amt <= 0:
        raise ValueError("金额必须为正数：%r" % amount)
    entries = list(ledger.get("entries", []))
    entries.append({
        "time": time or "—",
        "item": str(item),
        "amount": amt,
        "category": category,
        "pay": pay,
    })
    return {"entries": entries}


def compute(ledger):
    """纯函数：账本 → 对账结果。所有加总在这里做，模板只负责显示。"""
    entries = ledger.get("entries", [])
    spent = {p["key"]: 0.0 for p in PLAN}
    for e in entries:
        c = e.get("category")
        if c not in spent:
            raise ValueError("账本里有未知类目：%r" % c)
        spent[c] += float(e["amount"])
    cats = {
        p["key"]: {
            "plan": p["plan"],
            "spent": spent[p["key"]],
            "diff": p["plan"] - spent[p["key"]],
        }
        for p in PLAN
    }
    total = sum(spent.values())
    return {
        "count": len(entries),
        "total": total,
        "ratio": (total / PLAN_TOTAL * 100.0) if PLAN_TOTAL else 0.0,
        "cats": cats,
        "sum_spent": sum(c["spent"] for c in cats.values()),
        "sum_diff": sum(c["diff"] for c in cats.values()),
        "plan_total": PLAN_TOTAL,
    }


# ── CSS：普通字符串常量（不进 f-string，避免花括号被当表达式）──────────────
CSS = """
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#FBF8F2; font-family:"Microsoft YaHei","PingFang SC",sans-serif;
         font-feature-settings:"tnum"; color:#1E3A34; }
  .page { width:1080px; padding:54px 60px 60px; }
  .hero { background:#1E3A34; color:#FBF8F2; border-radius:22px;
          padding:46px 50px 40px; }
  .kicker { letter-spacing:3px; font-size:15px; color:#C89B3C; font-weight:700; }
  .h1 { font-size:54px; font-weight:800; margin-top:10px; letter-spacing:2px; }
  .sub { font-size:18px; color:#C9D3CE; margin-top:12px; }
  .kpis { display:flex; gap:16px; margin-top:34px; }
  .kpi { flex:1; background:rgba(251,248,242,.08); border:1px solid rgba(251,248,242,.14);
         border-radius:14px; padding:20px 24px; }
  .kpi.acc { border-color:#C8553D; }
  .kpi .k { font-size:15px; color:#C9D3CE; }
  .kpi .v { font-size:40px; font-weight:800; margin-top:6px; }
  .kpi .v small { font-size:20px; font-weight:600; }
  .sec { margin-top:38px; }
  .sectitle { display:flex; align-items:center; gap:14px; margin-bottom:18px; }
  .sectitle .bar { width:6px; height:26px; background:#C8553D; border-radius:3px; }
  .sectitle h2 { font-size:27px; font-weight:800; }
  .sectitle .note { margin-left:auto; font-size:15px; color:#8D8577; }
  .cat { display:flex; align-items:center; background:#FFFFFF; border:1px solid #E8E2D6;
         border-radius:12px; padding:16px 22px; margin-bottom:10px; }
  .cat .name { width:340px; font-size:20px; font-weight:700; }
  .cat .name small { display:block; font-size:13px; font-weight:400; color:#8D8577; margin-top:4px; }
  .cat .col { flex:1; text-align:right; }
  .cat .lab { font-size:13px; color:#8D8577; }
  .cat .val { font-size:22px; font-weight:800; margin-top:2px; }
  .cat .val.plan { color:#1E3A34; }
  .cat .val.diff { color:#5B7C99; }
  .sumrow { display:flex; justify-content:space-between; background:#1E3A34; color:#FBF8F2;
            border-radius:12px; padding:20px 24px; margin-top:14px; font-size:20px; font-weight:800; }
  .sumrow .r small { color:#C89B3C; }
  table.ltab { width:100%; border-collapse:collapse; background:#FFFFFF;
               border:1px solid #E8E2D6; border-radius:12px; overflow:hidden; }
  .ltab th { background:#EAF0F5; color:#1E3A34; font-size:15px; text-align:left;
             padding:14px 20px; font-weight:700; }
  .ltab td { padding:14px 20px; font-size:17px; border-top:1px solid #EFEAE0; }
  .ltab td.amt, .ltab th.amt { text-align:right; font-weight:800; }
  .ltab tr.empty td { text-align:center; color:#8D8577; font-size:16px; padding:30px; }
  .alert { margin-top:34px; background:#FBF3E2; border-left:6px solid #C89B3C;
           border-radius:10px; padding:22px 26px; }
  .alert .t { font-size:19px; font-weight:800; color:#8A6A1F; margin-bottom:10px; }
  .alert ul { padding-left:22px; }
  .alert li { font-size:16px; line-height:1.9; color:#5C533F; }
  .foot { margin-top:34px; border-top:1px dashed #E8E2D6; padding-top:18px; }
  .foot .src { font-size:14px; color:#A29A8C; line-height:1.85; }
  .foot .src b { color:#8D8577; }
  .foot .meta { display:flex; justify-content:space-between; margin-top:14px;
                font-size:14px; color:#B5AD9E; letter-spacing:.04em; }
</style>
"""


def _diff_text(diff):
    """差额显示：未花完 → −¥X；超支 → +¥X。"""
    if diff >= 0:
        return "−¥" + fmt(diff)
    return "+¥" + fmt(-diff)


def render_spend(ledger):
    """用 compute() 结果生成完整 spend 卡 HTML。空账本 = 空白模板态。"""
    c = compute(ledger)
    entries = ledger.get("entries", [])

    ratio = ("%g" % round(c["ratio"], 1))
    hero = (
        '<div class="hero">\n'
        '  <div class="kicker">GUILIN · YANGSHUO · SPEND LOG</div>\n'
        '  <div class="h1">实时消费记录卡</div>\n'
        f'  <div class="sub">桂林阳朔 12/1–12/4 &nbsp;·&nbsp; 2 人 &nbsp;·&nbsp; '
        f'均衡档基准 ¥{fmt(PER_PERSON)} / 人</div>\n'
        '  <div class="kpis">\n'
        f'    <div class="kpi"><div class="k">已记录笔数</div>'
        f'<div class="v">{c["count"]} <small>笔</small></div></div>\n'
        f'    <div class="kpi acc"><div class="k">累计花费</div>'
        f'<div class="v">¥{fmt(c["total"])}</div></div>\n'
        f'    <div class="kpi"><div class="k">占预算比例</div>'
        f'<div class="v">{ratio}<small>%</small></div></div>\n'
        '  </div>\n</div>'
    )

    cat_rows = []
    for p in PLAN:
        cc = c["cats"][p["key"]]
        cat_rows.append(
            '    <div class="cat">\n'
            f'      <div class="name">{p["key"]}<small>{p["note"]}</small></div>\n'
            f'      <div class="col"><div class="lab">计划</div>'
            f'<div class="val plan">¥{fmt(cc["plan"])}</div></div>\n'
            f'      <div class="col"><div class="lab">已花</div>'
            f'<div class="val">¥{fmt(cc["spent"])}</div></div>\n'
            f'      <div class="col"><div class="lab">差额</div>'
            f'<div class="val diff">{_diff_text(cc["diff"])}</div></div>\n'
            '    </div>'
        )
    cats_html = (
        '  <div class="sec">\n'
        '    <div class="sectitle"><div class="bar"></div><h2>类目对账</h2>'
        '<div class="note">计划额来自均衡档骨架（由 ledger.py 生成）</div></div>\n'
        + "\n".join(cat_rows) + "\n"
        '    <div class="sumrow">\n'
        '      <div class="l">合计（2 人）</div>\n'
        f'      <div class="r">计划 ¥{fmt(c["plan_total"])} &nbsp;·&nbsp; '
        f'已花 ¥{fmt(c["sum_spent"])} &nbsp;·&nbsp; '
        f'差额 <small>{_diff_text(c["sum_diff"])}</small></div>\n'
        '    </div>\n  </div>'
    )

    if entries:
        body_rows = "\n".join(
            f'        <tr><td>{e["time"]}</td><td>{e["item"]}</td>'
            f'<td class="amt">¥{fmt(float(e["amount"]))}</td>'
            f'<td>{e["pay"]}</td></tr>'
            for e in entries
        )
    else:
        body_rows = (
            '        <tr class="empty"><td colspan="4">暂无记录 —— 出行后告诉本 Agent '
            '「记一笔 ¥XX 项目」，会自动追加到此处并更新上方对账</td></tr>'
        )
    ledger_html = (
        '  <div class="sec ledger">\n'
        '    <div class="sectitle"><div class="bar"></div><h2>逐笔流水</h2>'
        '<div class="note">说「记一笔 ¥XX 项目」即追加</div></div>\n'
        '    <table class="ltab">\n'
        '      <thead><tr><th style="width:160px;">时间</th><th>项目</th>'
        '<th class="amt" style="width:200px;">金额</th>'
        '<th style="width:180px;">支付方式</th></tr></thead>\n'
        '      <tbody>\n' + body_rows + '\n      </tbody>\n'
        '    </table>\n  </div>'
    )

    alert_html = (
        '  <div class="alert">\n'
        '    <div class="t">记账提醒</div>\n'
        '    <ul>\n'
        '      <li>当天没记账的<b>第二天补</b>；拖到最后凭记忆凑，误差比预算本身还大。</li>\n'
        '      <li><b>金额必须来自你</b>：本卡不替你编支出。说「记一笔 ¥150 啤酒鱼 微信」即可，现金填「现金」。</li>\n'
        '      <li>本卡为<b>演示模板</b>：所有「计划」数字来自均衡档骨架，非真实消费；'
        '出行后逐笔填充，「已花/差额」才会变。</li>\n'
        '    </ul>\n  </div>'
    )

    foot_html = (
        '  <div class="foot">\n'
        '    <div class="src">\n'
        f'      <b>数据来源</b>　类目计划额 = 均衡档预算骨架拆项（'
        + " / ".join(f'{p["key"]} ¥{fmt(p["plan"])}' for p in PLAN)
        + f'，合计 ¥{fmt(PLAN_TOTAL)}），与 examples/guilin-example.md:92-99 一致。<br>\n'
        '      <b>说明</b>　实际支出以你逐笔记录为准；'
        '本工具不替用户编金额，空账本时所有「已花」为 0，属模板初始态，非真实账单。\n'
        '    </div>\n'
        '    <div class="meta"><div>由 cardtest/ledger.py 生成</div><div>SPEND MODE</div></div>\n'
        '  </div>'
    )

    return (
        "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n"
        "<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "<title>桂林阳朔 · 实时消费记录卡</title>\n"
        + CSS + "\n</head>\n<body>\n<div class=\"page\">\n"
        + hero + "\n" + cats_html + "\n" + ledger_html + "\n"
        + alert_html + "\n" + foot_html + "\n"
        "</div>\n</body>\n</html>\n"
    )


# ── CLI ────────────────────────────────────────────────────────────────────
def main(argv=None):
    ap = argparse.ArgumentParser(description="spend/review 消费记账内核")
    sub = ap.add_subparsers(dest="cmd")

    p_init = sub.add_parser("init", help="建空账本")
    p_init.add_argument("--ledger", default=str(DEFAULT_LEDGER))

    p_add = sub.add_parser("add", help="追加一笔（金额必须来自用户）")
    p_add.add_argument("--amount", required=True, help="金额，必填；本工具不替你编")
    p_add.add_argument("--item", required=True)
    p_add.add_argument("--category", required=True, choices=CATEGORIES)
    p_add.add_argument("--pay", default="现金")
    p_add.add_argument("--time", default="")
    p_add.add_argument("--ledger", default=str(DEFAULT_LEDGER))

    p_show = sub.add_parser("show", help="打印账本 JSON")
    p_show.add_argument("--ledger", default=str(DEFAULT_LEDGER))

    p_sum = sub.add_parser("summary", help="打印对账摘要（纯计算）")
    p_sum.add_argument("--ledger", default=str(DEFAULT_LEDGER))

    p_ren = sub.add_parser("render", help="生成 spend 卡 HTML")
    p_ren.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    p_ren.add_argument("--out", default=str(DEFAULT_SPEND_HTML))

    sub.add_parser("demo", help="用 3 笔演示账生成 _ledger-demo.html（非真实消费）")

    args = ap.parse_args(argv)
    cmd = args.cmd

    if cmd == "init":
        save(args.ledger, {"entries": []})
        print("INIT_OK 空账本已写入 %s" % args.ledger)
        return 0
    if cmd == "add":
        led = add_entry(load(args.ledger), amount=args.amount, item=args.item,
                        category=args.category, pay=args.pay, time=args.time)
        save(args.ledger, led)
        print("ADD_OK 已追加：¥%s %s（%s）" % (args.amount, args.item, args.category))
        return 0
    if cmd == "show":
        print(json.dumps(load(args.ledger), ensure_ascii=False, indent=2))
        return 0
    if cmd == "summary":
        print(json.dumps(compute(load(args.ledger)), ensure_ascii=False, indent=2))
        return 0
    if cmd == "render":
        html = render_spend(load(args.ledger))
        Path(args.out).write_text(html, encoding="utf-8")
        c = compute(load(args.ledger))
        print("RENDER_OK 已生成 %s（%d 笔 / 累计 ¥%s）"
              % (args.out, c["count"], fmt(c["total"])))
        return 0
    if cmd == "demo":
        # 演示夹具：仅用于验证「记一笔 → 自动更新对账」，非真实消费、不写进仓库账本。
        led = {"entries": []}
        for e in [
            dict(amount=150, item="啤酒鱼", category="餐饮", pay="微信", time="12/1 19:20"),
            dict(amount=275.5, item="高铁票", category="交通", pay="支付宝", time="12/1 08:00"),
            dict(amount=90, item="遇龙河竹筏", category="门票", pay="现金", time="12/2 10:30"),
        ]:
            led = add_entry(led, **e)
        out = HERE / "_ledger-demo.html"
        out.write_text(render_spend(led), encoding="utf-8")
        c = compute(led)
        print("DEMO_OK 演示数据（非真实消费）→ %s" % out)
        print("  %d 笔 / 累计 ¥%s / 占预算 %s%% / 各类目已花 %s"
              % (c["count"], fmt(c["total"]), round(c["ratio"], 2),
                 {k: v["spent"] for k, v in c["cats"].items()}))
        return 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
