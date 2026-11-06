#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
replay.py — 行为回放「不判分只留痕」操作骨架

配套 examples/cases.json。它**不调 LLM、不判分、不给绿灯**，只做三件确定性的事：

    list     列出 cases.json 里每个用例的复现输入（等价于 regress.py --emit-prompt，
             但按用例分组、带 watch / hard_facts 对照表）
    prompt   打印某个用例该喂给 Agent 的逐轮输入（可直接复制粘贴）
    trace    把 Agent 的实际逐轮输出存成带时间戳的 Markdown 留痕，
             并把 watch / hard_facts 并排附上供人工 diff

为什么「不判分」：措辞差异、LLM 非确定性、模型/推理强度变化都会让输出不同，
自动判分只会制造假 FAIL。行为对照的判定权在人眼，标准见 examples/README.md
「判定标准」四类（硬事实 / 口径 / 结构 / 文风）。

命令（在 C:\\ai 下用运行时自带 Python，见 AGENTS.md）：
    "$PY" examples/replay.py list
    "$PY" examples/replay.py prompt guilin-plan
    "$PY" examples/replay.py trace guilin-plan --out _replay-guilin.md --answer r1.txt --answer r2.txt --answer r3.txt
    "$PY" examples/replay.py cases --check       # 只校验 cases.json 结构完整性（供 [J] 调用）

本脚本不联网。留痕文件 _replay-*.md 是临时产物，.gitignore 的 _*.md 未排除，
但文件名以 _ 开头——请放到 cardtest/ 或随手删，别提交；仓库不收录逐轮输出。
"""

import argparse
import json
import sys
import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

EX = Path(__file__).resolve().parent               # C:\ai\examples
ROOT = EX.parent                                    # C:\ai（cases.json 的 source 从仓库根算）
CASES = EX / "cases.json"


def load():
    return json.loads(CASES.read_text(encoding="utf-8"))


def validate():
    """结构完整性校验。返回 (ok, problems)。给 [J] 与 cases --check 共用。"""
    try:
        d = load()
    except Exception as e:
        return False, ["cases.json 读取/解析失败：%s" % e]
    problems = []
    if d.get("schema") != 1:
        problems.append("schema 不是 1：%r" % d.get("schema"))
    items = d.get("cases")
    if not isinstance(items, list) or not items:
        return False, ["cases 列表为空"] + problems
    seen = set()
    for c in items:
        cid = c.get("id", "<无 id>")
        if cid in seen:
            problems.append("用例 id 重复：%s" % cid)
        seen.add(cid)
        for key in ("source", "intent", "turns", "watch", "hard_facts"):
            v = c.get(key)
            if not v or (isinstance(v, list) and not v):
                problems.append("%s 缺 %s" % (cid, key))
        src = c.get("source", "")
        if src and not (ROOT / src).exists():
            problems.append("%s 指向的基准文件不存在：%s" % (cid, src))
        turns = c.get("turns")
        if turns is not None and not isinstance(turns, list):
            problems.append("%s 的 turns 不是列表" % cid)
    return (not problems), problems


def cmd_list(d):
    print("# 行为回放用例（不判分只留痕）\n")
    print(d.get("principle", ""))
    print("\n共 %d 个用例：\n" % len(d["cases"]))
    for c in d["cases"]:
        print("## %s — %s" % (c["id"], c["intent"]))
        print("- 基准：`%s`" % c["source"])
        print("- 复现输入（逐轮）：")
        for i, t in enumerate(c["turns"], 1):
            print("  %d. %s" % (i, t))
        if c.get("follow"):
            print("- 后续/说明：%s" % c["follow"])
        print("- 人工对照 watch：%s" % "；".join(c["watch"]))
        print("- 硬事实 hard_facts：%s" % "；".join(c["hard_facts"]))
        print("")


def cmd_prompt(d, cid):
    c = next((x for x in d["cases"] if x["id"] == cid), None)
    if c is None:
        print("找不到用例：%s（用 list 看全部 id）" % cid)
        return 1
    print("== 用例 %s ==\n%s\n" % (cid, c["intent"]))
    for i, t in enumerate(c["turns"], 1):
        print("[第 %d 轮] %s" % (i, t))
    print("\n对照（人工）：")
    for w in c["watch"]:
        print("  · %s" % w)
    for h in c["hard_facts"]:
        print("  ✓ %s" % h)
    return 0


def cmd_trace(d, cid, answers, out):
    c = next((x for x in d["cases"] if x["id"] == cid), None)
    if c is None:
        print("找不到用例：%s" % cid)
        return 1
    lines = ["# 行为回放留痕 · %s" % cid, ""]
    lines.append("- 时间：%s" % datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    lines.append("- 基准：`%s`" % c["source"])
    lines.append("- 意图：%s" % c["intent"])
    lines.append("- **本报告不判分**：与 `examples/README.md` 判定标准人工对照。")
    lines.append("")
    lines.append("## 逐轮输出（原样留痕）\n")
    for i, t in enumerate(c["turns"], 1):
        lines.append("### 第 %d 轮 · 输入\n" % i)
        lines.append("```text")
        lines.append(t)
        lines.append("```\n")
        ans = answers[i - 1] if i - 1 < len(answers) else None
        if ans is None:
            lines.append("_（本轮未提供输出文件）_\n")
        else:
            p = Path(ans)
            body = p.read_text(encoding="utf-8") if p.exists() else "（文件不存在：%s）" % ans
            lines.append("````\n" + body.rstrip() + "\n````\n")
    lines.append("## 人工对照清单\n")
    lines.append("| 类型 | 项 | 结论（人工填） |")
    lines.append("|---|---|---|")
    for w in c["watch"]:
        lines.append("| watch | %s |  |" % w.replace("|", "\\|"))
    for h in c["hard_facts"]:
        lines.append("| hard_fact | %s |  |" % h.replace("|", "\\|"))
    lines.append("")
    text = "\n".join(lines) + "\n"
    Path(out).write_text(text, encoding="utf-8")
    print("TRACE_OK 留痕已写入 %s（%d 行，不判分）" % (out, len(lines)))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="行为回放：不判分只留痕")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("list", help="列出所有用例")
    p_prompt = sub.add_parser("prompt", help="打印某用例该喂什么")
    p_prompt.add_argument("id")
    p_trace = sub.add_parser("trace", help="把逐轮输出存成留痕")
    p_trace.add_argument("id")
    p_trace.add_argument("--answer", action="append", default=[], help="逐轮输出文件，可重复")
    p_trace.add_argument("--out", required=True)
    p_check = sub.add_parser("cases", help="校验 cases.json 结构")
    p_check.add_argument("--check", action="store_true")

    args = ap.parse_args(argv)
    if args.cmd == "cases" and args.check:
        ok, probs = validate()
        print("CASES_OK" if ok else "CASES_BAD")
        for p in probs:
            print(" -", p)
        return 0 if ok else 1
    d = load()
    if args.cmd == "list":
        cmd_list(d)
        return 0
    if args.cmd == "prompt":
        return cmd_prompt(d, args.id)
    if args.cmd == "trace":
        return cmd_trace(d, args.id, args.answer, args.out)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
