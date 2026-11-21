/**
 * 旅行 Agent 三步流水线：
 *  1) LLM 结构化提取需求（目的地/日期/人数/预算/偏好/是否需要火车）
 *  2) 并行调用真实价格源（Amadeus 机票/酒店/活动 + 12306/估算火车），SSE 逐路推送
 *  3) LLM 结合实时报价生成完整行程
 */
import { chat, extractJson } from './llm.ts';
import * as amadeus from './amadeus.ts';
import { tpConfigured, searchFlights as tpSearchFlights } from './travelpayouts.ts';
import { fetchWvPrices } from './wikivoyage.ts';
import { fetchWeather } from './weather.ts';
import { getCurrency } from './currency.ts';
import { searchTrains } from './trains.ts';
import type { ChatMsg, Env, PriceItem, PriceSource, SSEEvent, TripPlan } from './types.ts';

type Emit = (e: SSEEvent) => void;

interface TripParams {
  origin_city?: string;
  origin_iata?: string;
  origin_en?: string;
  origin_lat?: number;
  origin_lng?: number;
  origin_train_code?: string;
  destination_city?: string;
  destination_iata?: string;
  destination_en?: string;
  dest_lat?: number;
  dest_lng?: number;
  dest_train_code?: string;
  is_domestic?: boolean;
  depart_date?: string;
  return_date?: string | null;
  travelers?: number;
  budget_cny?: number | null;
  interests?: string[];
  need_flight?: boolean;
  need_hotel?: boolean;
  need_train?: boolean;
  need_activities?: boolean;
  enough_info?: boolean;
  missing?: string;
}

const todayBeijing = (): string => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

function extractionPrompt(): string {
  return `你是旅行需求解析器。今天是 ${todayBeijing()}（北京时间）。
从对话历史中提取旅行参数，只输出一个 JSON 对象（不要解释、不要代码块标记），格式：
{
  "origin_city": "出发城市中文名", "origin_iata": "出发城市IATA城市码", "origin_en": "英文城市名",
  "origin_lat": 39.9, "origin_lng": 116.4, "origin_train_code": "12306电报码或空串",
  "destination_city": "目的地中文名", "destination_iata": "目的地IATA城市码", "destination_en": "英文城市名",
  "dest_lat": 35.68, "dest_lng": 139.69, "dest_train_code": "12306电报码或空串",
  "is_domestic": false,
  "depart_date": "YYYY-MM-DD", "return_date": "YYYY-MM-DD 或 null",
  "travelers": 2, "budget_cny": 6000,
  "interests": ["美食", "红叶"],
  "need_flight": true, "need_hotel": true, "need_train": false, "need_activities": true,
  "enough_info": true, "missing": ""
}
示例（假设今天是 2026-11-21 周六）：
输入："12月初成都-重庆 3天2晚，想吃火锅、看熊猫，预算3000"
输出：{"origin_city":"成都","origin_iata":"CTU","origin_en":"Chengdu","origin_lat":30.5728,"origin_lng":104.0668,"origin_train_code":"CDW","destination_city":"重庆","destination_iata":"CKG","destination_en":"Chongqing","dest_lat":29.5630,"dest_lng":106.5516,"dest_train_code":"CQW","is_domestic":true,"depart_date":"2026-12-04","return_date":"2026-12-06","travelers":1,"budget_cny":3000,"interests":["火锅","熊猫"],"need_flight":false,"need_hotel":true,"need_train":true,"need_activities":true,"enough_info":true,"missing":""}
输入："11月28-30日北京去东京2人"
输出：{"origin_city":"北京","origin_iata":"BJS","origin_en":"Beijing","origin_lat":39.9042,"origin_lng":116.4074,"origin_train_code":"BJP","destination_city":"东京","destination_iata":"TYO","destination_en":"Tokyo","dest_lat":35.6762,"dest_lng":139.6503,"dest_train_code":"","is_domestic":false,"depart_date":"2026-11-28","return_date":"2026-11-30","travelers":2,"budget_cny":null,"interests":[],"need_flight":true,"need_hotel":true,"need_train":false,"need_activities":true,"enough_info":true,"missing":""}
规则：
- 出发地和目的地只能来自用户消息中出现的城市名，严禁使用示例或其他城市充当默认值。
- "A-B"、"A去B"、"A到B"这类句式：默认从 A 出发去 B，不要为此追问。
- 所有日期一律 YYYY-MM-DD；相对说法（"下周五""本周末""12月初"）按今天换算，跨年要进位；模糊日期直接取当月第一个合理出行日（尽量周五或周六），不要追问。天数（"3天2晚"）决定 return_date = depart_date + 天数-1。
- return_date：单程或不确定返程时为 null。
- is_domestic：出发地和目的地都在中国大陆时为 true（此时 need_train=true、need_flight=false，除非用户明确要坐飞机且行程很远）。
- 常用 IATA 城市码：北京BJS 上海SHA 广州CAN 深圳SZX 成都CTU 重庆CKG 杭州HGH 西安SIA 武汉WUH 厦门XMN 昆明KMG 青岛TAO 南京NKG 香港HKG 东京TYO 大阪OSA 首尔ICN 新加坡SIN 曼谷BKK 台北TPE 巴黎PAR 伦敦LON。
- 12306 电报码举例：北京BJP 北京南VNP 上海SHH 上海虹桥AOH 广州GZQ 成都CDW 重庆CQW 杭州HZH 南京NKH 武汉WHN 西安XAY。不确定就填空串。
- budget_cny 为 null 表示用户没提预算；travelers 默认 1。
- need_activities 默认 true；用户明确说"不住酒店"之类才置对应 need_* 为 false。
- 只有当目的地完全无法推断（连"A-B"句式都没有）时才 enough_info=false，missing 写一句简短中文追问；否则一律 enough_info=true 并给出合理默认。`;
}

function generationPrompt(params: TripParams, priceContext: string, poiContext: string): string {
  const nights = params.depart_date && params.return_date
    ? Math.max(1, Math.round((Date.parse(params.return_date) - Date.parse(params.depart_date)) / 86_400_000))
    : 0;
  const days = params.return_date ? nights + 1 : 1;
  return `你是一位资深中文旅行规划师。请基于【实时报价数据】为用户输出一份"攻略图"结构化行程。

【需求参数】
目的地：${params.destination_city}（坐标约 ${params.dest_lat ?? '?'},${params.dest_lng ?? '?'})
出发地：${params.origin_city}
日期：${params.depart_date}${params.return_date ? ` 至 ${params.return_date}` : '（单程）'}，共 ${days} 天${nights ? ` ${nights} 晚` : ''}
人数：${params.travelers ?? 1}
预算：${params.budget_cny ? `¥${params.budget_cny}` : '未指定'}
偏好：${(params.interests ?? []).join('、') || '无特别说明'}

【实时报价数据】（source=amadeus/12306 为实时，estimate 为估算）
${priceContext || '（本次未获取到任何报价数据）'}

【目的地 POI 坐标表】（可直接用于 segment 的 lat/lng）
${poiContext || '（无）'}

只输出一个 JSON 对象（禁止 markdown 代码块围栏、禁止任何解释文字），结构：
{
  "title": "如：东京2天1晚 · 红叶美食之旅",
  "summary": "一句话概述本次安排",
  "origin": { "city": "出发城市", "iata": "IATA码", "train_code": "12306电报码" },
  "destination": { "city": "目的城市", "iata": "IATA码", "train_code": "12306电报码" },
  "depart_date": "YYYY-MM-DD",
  "return_date": "YYYY-MM-DD 或 null",
  "nights": 1,
  "travelers": 2,
  "budget_cny": 6000,
  "estimated_total": { "min": 5200, "max": 6800, "currency": "CNY", "note": "合计口径：机票2人往返+酒店1晚+门票2人" },
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "theme": "当日主题",
      "segments": [
        {
          "time": "09:00-12:30",
          "title": "北京首都机场 ✈ 东京成田",
          "type": "transport",
          "place": "成田国际机场",
          "lat": 35.7720, "lng": 140.3929,
          "transport": "NH956 直飞约3.5h + 京成线约1h",
          "cost": "¥4,700（2人往返，实时报价）",
          "price_ref": "amadeus",
          "note": "提前2小时值机"
        }
      ]
    }
  ],
  "price_summary": [
    { "category": "机票", "option": "NH956 往返", "price": "¥4,700（2人）", "source": "实时·Amadeus" }
  ],
  "tips": ["…"],
  "packing": []
}

硬性规则：
1. days 天数必须是 ${days} 天；每个 segment 的 time 必须是 HH:MM-HH:MM，每天 4~6 段，节奏合理，含交通/用餐/景点/住宿。transport 为必填字段：每一段都要写清交通方式+大概耗时（如"地铁2号线约25分钟""打车约15分钟""步行10分钟""高铁约1h"），短途/免费也不例外。
2. type 只能取 transport|sight|food|hotel|shopping|rest；place 必须写真实存在的具体地点名（如"洪崖洞""磁器口古镇""重庆动物园""佩姐老火锅(解放碑店)"），严禁写"市中心""某某火锅店"这类泛称；lat/lng 必填且必须与 place 的真实位置一致（例：大足石刻在重庆大足区约 29.70,105.72，不在主城；跨城交通的出发和到达两段都要给各自坐标）。不同地点的坐标必须不同——坐标用于绘制路线图，缺一个点路线就断。
3. cost 只能引用【实时报价数据】中的数字，并注明口径（几人/几晚）；数据没有的写"以预订页为准"且 price_ref 用 "none"；估算价 price_ref 用 "estimate" 并在 cost 中带"估算"二字；Wikivoyage 社区参考价 price_ref 用 "wikivoyage" 并注明"参考价（可能滞后）"。price_ref 可选 amadeus|travelpayouts|wikivoyage|12306|estimate|none。严禁编造精确价格。
4. estimated_total 必填且必须给出 min/max 区间和 note 口径：把【实时报价数据】中的交通往返、住宿每晚×晚数、门票合计逐项相加，餐费按每人每天 80~150 元预留；某类数据缺失就在 note 里写明"未计入"，绝不臆造。总花费与用户预算比较，若明显不够，在 tips 里给务实的调整方案（改交通方式/换住宿档次/错峰）。
5. price_summary 必须覆盖已获取报价的全部类别（火车票/酒店/门票/机票哪些查到了就列哪些，不得遗漏），source 取：实时·Amadeus / 实时·Travelpayouts / 实时·12306 / 参考价·Wikivoyage / 估算 / 以预订页为准。
6. tips 3~6 条，务实；若提供了【目的地天气预报】，tips 必须包含一条穿衣/雨具建议。
7. packing 必填：12~18 条行前打包清单，按类别组织（证件/电子/衣物/洗护/药品/其他），衣物数量结合天数与天气预报写具体数字（如"薄外套×1（夜间15°C）""内裤/袜子×4"），目的地特色物品也要写（如去日本带"零钱包硬币×1"）。全部中文；JSON 字符串内不得包含换行符。`;
}

/** 常用城市库：模型解析失败时的正则兜底 */
const CITY_DB: Record<string, { iata: string; en: string; lat: number; lng: number; train?: string; domestic: boolean }> = {
  北京: { iata: 'BJS', en: 'Beijing', lat: 39.9042, lng: 116.4074, train: 'BJP', domestic: true },
  上海: { iata: 'SHA', en: 'Shanghai', lat: 31.2304, lng: 121.4737, train: 'SHH', domestic: true },
  广州: { iata: 'CAN', en: 'Guangzhou', lat: 23.1291, lng: 113.2644, train: 'GZQ', domestic: true },
  深圳: { iata: 'SZX', en: 'Shenzhen', lat: 22.5431, lng: 114.0579, train: 'SZQ', domestic: true },
  成都: { iata: 'CTU', en: 'Chengdu', lat: 30.5728, lng: 104.0668, train: 'CDW', domestic: true },
  重庆: { iata: 'CKG', en: 'Chongqing', lat: 29.563, lng: 106.5516, train: 'CQW', domestic: true },
  杭州: { iata: 'HGH', en: 'Hangzhou', lat: 30.2741, lng: 120.1551, train: 'HZH', domestic: true },
  西安: { iata: 'SIA', en: "Xi'an", lat: 34.3416, lng: 108.9398, train: 'XAY', domestic: true },
  武汉: { iata: 'WUH', en: 'Wuhan', lat: 30.5928, lng: 114.3055, train: 'WHN', domestic: true },
  南京: { iata: 'NKG', en: 'Nanjing', lat: 32.0603, lng: 118.7969, train: 'NKH', domestic: true },
  厦门: { iata: 'XMN', en: 'Xiamen', lat: 24.4798, lng: 118.0894, train: 'XMN', domestic: true },
  昆明: { iata: 'KMG', en: 'Kunming', lat: 25.0389, lng: 102.7183, train: 'KMG', domestic: true },
  青岛: { iata: 'TAO', en: 'Qingdao', lat: 36.0671, lng: 120.3826, train: 'QAK', domestic: true },
  三亚: { iata: 'SYX', en: 'Sanya', lat: 18.2528, lng: 109.5119, domestic: true },
  哈尔滨: { iata: 'HRB', en: 'Harbin', lat: 45.8038, lng: 126.535, train: 'HBB', domestic: true },
  香港: { iata: 'HKG', en: 'Hong Kong', lat: 22.3193, lng: 114.1694, domestic: false },
  东京: { iata: 'TYO', en: 'Tokyo', lat: 35.6762, lng: 139.6503, domestic: false },
  大阪: { iata: 'OSA', en: 'Osaka', lat: 34.6937, lng: 135.5023, domestic: false },
  首尔: { iata: 'ICN', en: 'Seoul', lat: 37.5665, lng: 126.978, domestic: false },
  新加坡: { iata: 'SIN', en: 'Singapore', lat: 1.3521, lng: 103.8198, domestic: false },
  曼谷: { iata: 'BKK', en: 'Bangkok', lat: 13.7563, lng: 100.5018, domestic: false },
  台北: { iata: 'TPE', en: 'Taipei', lat: 25.033, lng: 121.5654, domestic: false },
  巴黎: { iata: 'PAR', en: 'Paris', lat: 48.8566, lng: 2.3522, domestic: false },
  伦敦: { iata: 'LON', en: 'London', lat: 51.5074, lng: -0.1278, domestic: false },
};

function fillCity(params: TripParams, name: string, side: 'origin' | 'destination'): void {
  const c = CITY_DB[name];
  if (!c) return;
  if (side === 'origin') {
    if (params.origin_city) return;
    params.origin_city = name;
    params.origin_iata = c.iata;
    params.origin_en = c.en;
    params.origin_lat = c.lat;
    params.origin_lng = c.lng;
    params.origin_train_code = c.train ?? '';
  } else {
    if (params.destination_city) return;
    params.destination_city = name;
    params.destination_iata = c.iata;
    params.destination_en = c.en;
    params.dest_lat = c.lat;
    params.dest_lng = c.lng;
    params.dest_train_code = c.train ?? '';
    params.is_domestic = c.domestic;
  }
}

/** 模型解析不全时：从用户文本里找已知城市名 + 数值日期，直接填充 */
function regexFillParams(params: TripParams, text: string): void {
  const found: { name: string; idx: number }[] = [];
  for (const name of Object.keys(CITY_DB)) {
    const i = text.indexOf(name);
    if (i >= 0) found.push({ name, idx: i });
  }
  found.sort((a, b) => a.idx - b.idx);
  if (found.length >= 2) {
    fillCity(params, found[0].name, 'origin');
    fillCity(params, found[1].name, 'destination');
  } else if (found.length === 1) {
    fillCity(params, found[0].name, 'destination');
  }
  if (!params.depart_date) {
    const m = /(\d{1,2})月(\d{1,2})/.exec(text);
    if (m) {
      const today = todayBeijing();
      let year = Number(today.slice(0, 4));
      const month = Math.min(12, Math.max(1, Number(m[1])));
      if (month < Number(today.slice(5, 7))) year += 1; // 跨年
      const day = Math.min(31, Math.max(1, Number(m[2])));
      params.depart_date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  if (!params.travelers) {
    const m = /(\d{1,2})\s*(?:人|位)/.exec(text);
    if (m) params.travelers = Math.min(9, Math.max(1, Number(m[1])));
  }
}

async function extractParams(env: Env, history: ChatMsg[]): Promise<TripParams> {
  const hist = history
    .filter((m) => m.role !== 'system')
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2500) }));
  let out: string;
  try {
    out = await chat(
      env,
      [{ role: 'system', content: extractionPrompt() }, ...hist],
      { maxTokens: 900, temperature: 0 },
    );
  } catch (e) {
    throw new Error(friendlyLlmError(e));
  }
  try {
    return extractJson<TripParams>(out);
  } catch {
    throw new Error(`参数提取失败（模型输出前200字）：${out.slice(0, 200)}`);
  }
}

/** 把 LLM 相关错误翻译成可操作的提示 */
function friendlyLlmError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Workers AI|wrangler login|AI\.run|fetch failed/i.test(msg)) {
    return 'AI 服务不可用：本地开发需先运行 `npx wrangler login`（Workers AI 需要账号授权），或在 .dev.vars / secrets 配置 LLM_API_KEY 使用 OpenAI 兼容接口（如 GLM）。';
  }
  return msg;
}

export async function runAgent(env: Env, history: ChatMsg[], emit: Emit): Promise<void> {
  // ---- 第 1 步：理解需求 ----
  emit({ type: 'step', id: 'extract', label: '🧠 理解你的需求', status: 'running' });
  let params: TripParams;
  try {
    params = await extractParams(env, history);
  } catch (e) {
    emit({ type: 'step', id: 'extract', label: '🧠 理解你的需求', status: 'error' });
    throw new Error(friendlyLlmError(e));
  }

  // 兜底：模型保守或解析不全时，用正则+城市库补齐
  const lastUserText = history[history.length - 1]?.content ?? '';
  if (!params.enough_info || !params.destination_city || !params.depart_date) {
    regexFillParams(params, lastUserText);
  }
  // 核心字段齐全就直接进行（模型 may over-conservative）
  if (params.destination_city && params.depart_date) {
    params.enough_info = true;
  }
  if (!params.enough_info || !params.destination_city || !params.depart_date) {
    emit({ type: 'step', id: 'extract', label: '🧠 理解你的需求', status: 'done', detail: '需要补充信息' });
    emit({ type: 'question', text: params.missing || '请问想去哪儿、大概哪几天出发？' });
    return;
  }
  const travelers = Math.max(1, Math.min(9, params.travelers ?? 1));
  const dateRange = params.return_date ? `${params.depart_date} 至 ${params.return_date}` : params.depart_date;
  emit({
    type: 'step',
    id: 'extract',
    label: '🧠 理解你的需求',
    status: 'done',
    detail: `${params.origin_city ?? ''} → ${params.destination_city} · ${dateRange} · ${travelers}人`,
  });

  // ---- 第 2 步：并行查价 ----
  const priceCtx: string[] = [];
  let poiContext = '';
  const tasks: Promise<void>[] = [];

  // 当地货币（出境游时前端显示双币）
  try {
    const cur = await getCurrency(env, params.destination_city);
    if (cur) emit({ type: 'currency', currency: cur.currency, symbol: cur.symbol, ratePerCny: cur.ratePerCny });
  } catch {
    // 汇率获取失败不阻塞
  }
  // 机票：优先 Amadeus（历史账号），其次 Travelpayouts（当前可注册）
  if (params.need_flight !== false && params.origin_iata && params.destination_iata) {
    const id = 'flights';
    const label = `✈️ 查询机票实时报价（${params.origin_iata} → ${params.destination_iata}）`;
    tasks.push(
      (async () => {
        emit({ type: 'step', id, label, status: 'running' });
        try {
          let items: PriceItem[] = [];
          let source: PriceSource;
          if (amadeus.isConfigured(env)) {
            items = await amadeus.searchFlights(env, {
              originIata: params.origin_iata!,
              destIata: params.destination_iata!,
              departDate: params.depart_date!,
              returnDate: params.return_date ?? undefined,
              adults: travelers,
            });
            source = 'amadeus';
          } else if (tpConfigured(env)) {
            items = await tpSearchFlights(env, {
              originIata: params.origin_iata!,
              destIata: params.destination_iata!,
              departDate: params.depart_date!,
              returnDate: params.return_date ?? undefined,
              adults: travelers,
            });
            source = 'travelpayouts';
          } else {
            throw new Error('未配置机票数据源（Travelpayouts Token / Amadeus Key 均未设置）');
          }
          emit({ type: 'prices', category: 'flights', title: '✈️ 机票', source, items });
          emit({ type: 'step', id, label, status: 'done', detail: `${items.length} 个实时报价` });
          priceCtx.push(
            `【机票】source=${source}(实时)\n${items.map((i) => `- ${i.title} | ${i.subtitle} | ${i.price}`).join('\n')}`,
          );
        } catch (e) {
          const detail = e instanceof Error ? e.message : '机票查询失败';
          emit({ type: 'step', id, label, status: 'error', detail });
        }
      })(),
    );
  }

  // 酒店
  if (params.need_hotel !== false && params.depart_date) {
    const id = 'hotels';
    const label = `🏨 查询酒店实时房价（${params.destination_city}）`;
    tasks.push(
      (async () => {
        emit({ type: 'step', id, label, status: 'running' });
        try {
          let cityIata = params.destination_iata;
          if (!cityIata && params.destination_en) {
            cityIata = await amadeus.lookupCityIata(env, params.destination_en);
          }
          if (!cityIata) throw new amadeus.AmadeusError('NO_RESULTS', '无法确定目的地的 IATA 城市码');
          const checkOut =
            params.return_date ?? nextDay(params.depart_date!);
          const items = await amadeus.searchHotels(env, {
            cityIata,
            checkIn: params.depart_date!,
            checkOut,
            adults: travelers,
          });
          emit({ type: 'prices', category: 'hotels', title: '🏨 酒店', source: 'amadeus', items });
          emit({ type: 'step', id, label, status: 'done', detail: `${items.length} 家实时报价` });
          priceCtx.push(
            `【酒店】source=amadeus(实时) 入住${params.depart_date} 退房${checkOut}\n${items
              .map((i) => `- ${i.title} | ${i.price}`)
              .join('\n')}`,
          );
        } catch (e) {
          // 回退：Wikivoyage 社区参考价（房价）
          try {
            const wv = await fetchWvPrices(env, params.destination_city ?? '', params.destination_en);
            if (wv && wv.hotels.length) {
              emit({
                type: 'prices',
                category: 'hotels',
                title: '🏨 酒店（参考价）',
                source: 'wikivoyage',
                note: `来自 ${wv.source} 社区数据，可能滞后；实时房价请用下方 Booking 深链`,
                items: wv.hotels,
              });
              emit({ type: 'step', id, label, status: 'done', detail: `${wv.hotels.length} 家参考价（Wikivoyage）` });
              priceCtx.push(
                `【酒店参考价】source=wikivoyage(社区参考价,可能滞后)\n${wv.hotels.map((i) => `- ${i.title} | ${i.price}`).join('\n')}`,
              );
              return;
            }
          } catch {
            // 忽略回退失败
          }
          const detail = '暂无酒店参考价，请用下方 Booking 深链查询实时房价';
          emit({ type: 'step', id, label, status: 'error', detail });
        }
      })(),
    );
  }

  // 火车（仅国内行程）
  if (params.need_train !== false && params.is_domestic && params.depart_date) {
    const id = 'trains';
    const label = `🚄 查询火车票（${params.origin_city} → ${params.destination_city}）`;
    tasks.push(
      (async () => {
        emit({ type: 'step', id, label, status: 'running' });
        try {
          const r = await searchTrains({
            fromName: params.origin_city ?? '',
            toName: params.destination_city ?? '',
            fromCode: params.origin_train_code || undefined,
            toCode: params.dest_train_code || undefined,
            date: params.depart_date!,
            fromLat: params.origin_lat,
            fromLng: params.origin_lng,
            toLat: params.dest_lat,
            toLng: params.dest_lng,
          });
          if (!r.items.length) {
            emit({ type: 'step', id, label, status: 'error', detail: r.note });
            return;
          }
          emit({ type: 'prices', category: 'trains', title: '🚄 火车票', source: r.source, note: r.note, items: r.items });
          emit({ type: 'step', id, label, status: 'done', detail: `${r.items.length} 个班次` });
          priceCtx.push(
            `【火车票】source=${r.source}${r.note ? `（${r.note}）` : ''}\n${r.items
              .map((i) => `- ${i.title} | ${i.subtitle} | ${i.price}`)
              .join('\n')}`,
          );
        } catch (e) {
          emit({
            type: 'step',
            id,
            label,
            status: 'error',
            detail: e instanceof Error ? e.message : '火车票查询失败',
          });
        }
      })(),
    );
  }

  // 景点活动 + POI
  if (params.need_activities !== false && params.dest_lat !== undefined && params.dest_lng !== undefined) {
    const id = 'activities';
    const label = `🎟️ 查询${params.destination_city}的景点与门票`;
    tasks.push(
      (async () => {
        emit({ type: 'step', id, label, status: 'running' });
        const coords = { lat: params.dest_lat!, lng: params.dest_lng! };
        const [actErr, pois] = await Promise.all([
          (async () => {
            try {
              const items = await amadeus.searchActivities(env, coords);
              emit({ type: 'prices', category: 'activities', title: '🎟️ 景点/活动门票', source: 'amadeus', items });
              priceCtx.push(
                `【景点活动】source=amadeus(实时)\n${items.map((i) => `- ${i.title} | ${i.price}`).join('\n')}`,
              );
            } catch (e) {
              // 回退：Wikivoyage 社区参考价（门票）
              try {
                const wv = await fetchWvPrices(env, params.destination_city ?? '', params.destination_en);
                if (wv && wv.tickets.length) {
                  emit({
                    type: 'prices',
                    category: 'activities',
                    title: '🎟️ 景点门票（参考价）',
                    source: 'wikivoyage',
                    note: `来自 ${wv.source} 社区数据，可能滞后；购票请用下方携程深链`,
                    items: wv.tickets,
                  });
                  priceCtx.push(
                    `【门票参考价】source=wikivoyage(社区参考价,可能滞后)\n${wv.tickets.map((i) => `- ${i.title} | ${i.price}`).join('\n')}`,
                  );
                  return undefined;
                }
              } catch {
                // 忽略回退失败
              }
              return '暂无门票参考价，请用下方携程深链购票';
            }
            return undefined;
          })(),
          amadeus.searchPois(env, coords),
        ]);
        if (pois.length) {
          poiContext = pois.map((p) => `${p.name}(${p.lat.toFixed(4)},${p.lng.toFixed(4)})`).join('；');
          priceCtx.push(`【目的地知名景点（Amadeus POI，无价格）】${poiContext}`);
        }
        emit({
          type: 'step',
          id,
          label,
          status: actErr ? 'error' : 'done',
          detail: actErr ?? (pois.length ? `拿到 ${pois.length} 个推荐景点` : undefined),
        });
      })(),
    );
  }

  // 天气预报（出发日期在预报窗口内时）
  if (params.dest_lat !== undefined && params.dest_lng !== undefined && params.depart_date) {
    const id = 'weather';
    const label = '🌤 查询目的地天气';
    tasks.push(
      (async () => {
        emit({ type: 'step', id, label, status: 'running' });
        const days = params.return_date
          ? Math.round((Date.parse(params.return_date) - Date.parse(params.depart_date!)) / 86_400_000) + 1
          : 1;
        const wx = await fetchWeather(env, params.dest_lat!, params.dest_lng!, params.depart_date!, days);
        if (wx && wx.length) {
          emit({ type: 'weather', items: wx });
          emit({ type: 'step', id, label, status: 'done', detail: `${wx.length} 天预报` });
          priceCtx.push(
            `【目的地天气预报】\n${wx
              .map((d) => `${d.date}: ${d.desc}，${d.min}~${d.max}°C，降水概率 ${d.precip}%`)
              .join('\n')}`,
          );
        } else {
          emit({ type: 'step', id, label, status: 'done', detail: '超出预报窗口，未获取' });
        }
      })(),
    );
  }

  await Promise.all(tasks);

  // ---- 第 3 步：生成攻略图数据 ----
  emit({ type: 'step', id: 'gen', label: '📝 生成攻略图（行程+路线+预算）', status: 'running' });
  const hist = history
    .filter((m) => m.role !== 'system')
    .slice(-4)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  let raw: string;
  try {
    raw = await chat(
      env,
      [
        { role: 'system', content: generationPrompt(params, priceCtx.join('\n\n'), poiContext) },
        ...hist,
        { role: 'user', content: '请根据以上实时报价数据，输出攻略图 JSON。' },
      ],
      { maxTokens: 4096, temperature: 0.2 },
    );
  } catch (e) {
    emit({ type: 'step', id: 'gen', label: '📝 生成攻略图（行程+路线+预算）', status: 'error' });
    throw new Error(friendlyLlmError(e));
  }

  // 优先结构化 JSON；解析失败降级为 Markdown 文本
  let jsonOk = false;
  try {
    const plan = extractJson<TripPlan>(raw);
    if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) throw new Error('行程数据为空');
    emit({ type: 'itinerary_json', plan });
    jsonOk = true;
  } catch {
    if (!raw.trim()) {
      emit({ type: 'step', id: 'gen', label: '📝 生成攻略图（行程+路线+预算）', status: 'error', detail: 'AI 返回为空' });
      emit({ type: 'error', message: '行程生成失败（AI 返回为空），请重试' });
      emit({ type: 'done' });
      return;
    }
    emit({ type: 'itinerary', markdown: raw });
  }
  emit({ type: 'step', id: 'gen', label: '📝 生成攻略图（行程+路线+预算）', status: 'done', detail: jsonOk ? '含路线图/图片/价格表' : '文本模式（结构化解析失败）' });
  emit({ type: 'done' });
}

function nextDay(dateStr: string): string {
  const d = new Date(Date.parse(dateStr) + 86_400_000);
  return d.toISOString().slice(0, 10);
}
