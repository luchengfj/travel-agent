# -*- coding: utf-8 -*-
"""
实时房价抓取（免登录，trip.com 服务端渲染 SSR）。

用法：
  python hotel_price.py --city 33 --checkin 2026-12-01 --checkout 2026-12-03 --curr CNY
  python hotel_price.py --city 33 --checkin 2026-12-01 --checkout 2026-12-03 --curr CNY --json out.json

原理：
  hotels.ctrip.com（国内站）是纯 JS 壳，HTML 里只有价格筛选档位，不含真实房价；
  真实价走 m.ctrip.com/restapi/soa2/... 客户端接口，未登录返回 4030 拒绝。
  但 www.trip.com（国际站）把酒店列表+房价直接服务端渲染进 HTML，
  所以 curl 一次就能拿到「日期相关、含税费」的真实挂牌价，不需要账号、不需要 2FA。

已知 city id（实测，来自 hotels.ctrip.com 的 <title> / trip.com 的 cityName）：
  14=苏州  28=成都  32=广州  33=桂林  95=峨眉山市  104=平遥县  206=长沙
  871=阳朔  872=新昌
  注意：city=14 不是杭州；city 参数在 trip.com 与 ctrip.com 大部分通用。
  阳朔不是「桂林下的县所以取不到」——它自己就是独立 city=871，SSR 直接可用。

商圈过滤（实测生效）：
  --zone 4532 = 阳朔「西街/阳朔公园商业区」（来自 m.ctrip.com/webapp/hotel/yangshuo871/zone4532）。
  加 zone 后 SSR 返回的酒店列表会变（首位从 LS Hotel 变成西街里9号美宿/西塘河景），
  说明服务端确实按商圈过滤了，不是被忽略的参数。其他 zone 值需自行从携程商圈页 URL 取。

局限（务必如实标注）：
  - 只到「城市 / 商圈」粒度，不能定位到具体某一家店；要精确某店仍需登录态或点详情页。
  - 每页约 12 条，是 SSR 快照，不是可下单的承诺价；下单前必须重新读。
  - 部分酒店 SSR 里没有 enName；评分/地址不在 SSR 里。
  - priceExplanation 的「N 晚合计」含税费，故 每晚单价×N 通常不等于合计（正常，别当成算错）。
"""
import argparse
import datetime
import json
import re
import statistics
import sys
import urllib.request
import pathlib

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
BASE = "https://www.trip.com/hotels/list"


def fetch(city, checkin, checkout, adults, curr, zone=""):
    url = (f"{BASE}?city={city}&checkin={checkin}&checkout={checkout}"
           f"&adult={adults}&curr={curr}&currency={curr}")
    if zone:
        url += f"&zone={zone}"
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept-Language": "zh-CN,zh;q=0.9"})
    with urllib.request.urlopen(req, timeout=25) as r:
        html = r.read().decode("utf-8", "replace")
    # SSR 把 JSON 双层转义了，先还原成普通引号
    return url, html.replace('\\"', '"').replace('\\u0026', '&')


def parse(u):
    city = re.search(r'"cityName":"([^"]+)"', u)
    dates = sorted(set(re.findall(r'"check(?:In|Out)":"([0-9]{8})"', u)))
    chunks = re.split(r'(?="hotelId":")', u)[1:]
    rows = []
    for c in chunks:
        def g(pat, default="?"):
            m = re.search(pat, c)
            return m.group(1) if m else default
        num = g(r'"price":([0-9.]+)', "")
        rows.append(dict(
            hotel_id=g(r'"hotelId":"([0-9]+)"'),
            name=g(r'"enName":"([^"]{2,60})"', "(SSR 未给店名)"),
            room=g(r'"physicsName":"([^"]{2,60})"'),
            per_night=g(r'"displayPrice":"([^"]+)"'),
            per_night_num=float(num) if num else None,
            total=g(r'Total price: ([A-Z]{0,4}\$? ?[0-9,]+)'),
        ))
    return (city.group(1) if city else "?"), dates, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="33", help="trip.com city id，33=桂林")
    ap.add_argument("--checkin", default="2026-12-01")
    ap.add_argument("--checkout", default="2026-12-03")
    ap.add_argument("--adults", type=int, default=2)
    ap.add_argument("--curr", default="CNY", help="CNY / USD")
    ap.add_argument("--zone", default="", help="可选商圈 id，如 4532=阳朔西街/阳朔公园商业区")
    ap.add_argument("--json", default="", help="可选：把结构化结果写到该路径")
    a = ap.parse_args()

    url, u = fetch(a.city, a.checkin, a.checkout, a.adults, a.curr, a.zone)
    city, dates, rows = parse(u)

    print(f"来源      : {url}")
    print(f"SSR 城市  : {city}   |   SSR 回显日期: {', '.join(dates)}"
          + (f"   |   商圈 zone={a.zone}" if a.zone else ""))
    print(f"记录数    : {len(rows)}   （1 间房 · {a.adults} 人 · 含税费）")
    print("-" * 104)
    for r in rows:
        print(f'{r["hotel_id"]:>11} | {r["per_night"]:>9}/晚 | 合计 {r["total"]:>10} '
              f'| {r["room"][:20]:20} | {r["name"][:34]}')
    vals = [r["per_night_num"] for r in rows if r["per_night_num"]]
    if vals:
        print("-" * 104)
        print(f'每晚单价  : 最低 {min(vals):.0f} / 中位 {statistics.median(vals):.0f} '
              f'/ 最高 {max(vals):.0f}   （样本 {len(vals)}，币种 {a.curr}）')
        print("提醒      : 合计含税费，故 单价×晚数 ≠ 合计 属正常，不要当成加总错误。")

    if a.json:
        # 采集时间是「下单前重新读一次」的前提：没有日期的快照会变成错误信息。
        # 用 UTC ISO-8601，带时区，避免「本地几点」的歧义。
        fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        pathlib.Path(a.json).write_text(
            json.dumps(dict(source=url, city=city, dates=dates,
                            fetched_at=fetched_at, rows=rows),
                       ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"已写出    : {a.json}  （采集时间 UTC {fetched_at}）")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()
