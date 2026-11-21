/**
 * 测试用模拟 LLM 服务器（OpenAI 兼容 /chat/completions）
 * 用途：在没有真实 Key 的情况下全链路测试 Agent 流水线。
 * 仅本地测试使用，不参与部署。
 */
import { createServer } from 'node:http';

const PORT = 9999;

const extraction = {
  origin_city: '上海', origin_iata: 'SHA', origin_en: 'Shanghai',
  origin_lat: 31.2304, origin_lng: 121.4737, origin_train_code: 'SHH',
  destination_city: '杭州', destination_iata: 'HGH', destination_en: 'Hangzhou',
  dest_lat: 30.2741, dest_lng: 120.1551, dest_train_code: 'HZH',
  is_domestic: true,
  depart_date: '2026-11-28', return_date: '2026-11-29',
  travelers: 2, budget_cny: 2000,
  interests: ['西湖', '美食'],
  need_flight: false, need_hotel: true, need_train: true, need_activities: true,
  enough_info: true, missing: '',
};

const plan = {
  title: '杭州2天1晚 · 西湖经典美食线',
  summary: '周末高铁往返杭州，环西湖串联断桥、苏堤与灵隐，报价来自实时数据与估算。',
  depart_date: '2026-11-28', return_date: '2026-11-29', nights: 1, travelers: 2, budget_cny: 2000,
  estimated_total: { min: 900, max: 1400, currency: 'CNY', note: '高铁估算+酒店未获取到实时报价不计入' },
  days: [
    { day: 1, date: '2026-11-28', theme: '抵达 · 断桥 · 湖滨夜色', segments: [
      { time: '09:00-10:30', title: '上海虹桥 → 杭州东', type: 'transport', place: '杭州东站', lat: 30.2919, lng: 120.2123, transport: '高铁G字头约1h', cost: '¥150 ~ ¥220（2人往返，估算）', price_ref: 'estimate', note: '提前3天放票' },
      { time: '11:00-12:00', title: '知味观午餐', type: 'food', place: '知味观(湖滨总店)', lat: 30.2535, lng: 120.1643, transport: '地铁1号线约30分钟', cost: '以预订页为准', price_ref: 'none', note: '猫耳朵、小笼' },
      { time: '13:00-16:00', title: '断桥残雪 · 白堤漫步', type: 'sight', place: '断桥残雪', lat: 30.2627, lng: 120.1553, transport: '步行10分钟', cost: '免费', price_ref: 'none' },
      { time: '16:30-18:00', title: '苏堤春晓', type: 'sight', place: '苏堤', lat: 30.2435, lng: 120.1438, transport: '步行或西湖游船', cost: '免费（游船¥55/人以预订页为准）', price_ref: 'none' },
      { time: '18:30-20:30', title: '湖滨银泰晚餐', type: 'food', place: '湖滨银泰in77', lat: 30.2489, lng: 120.1653, cost: '以预订页为准', price_ref: 'none' }
    ]},
    { day: 2, date: '2026-11-29', theme: '灵隐禅意 · 返程', segments: [
      { time: '09:00-11:30', title: '灵隐寺 · 飞来峰', type: 'sight', place: '灵隐寺', lat: 30.2412, lng: 120.0978, transport: '公交约40分钟', cost: '以预订页为准（香花券¥30/人）', price_ref: 'none' },
      { time: '12:00-13:00', title: '绿茶餐厅午餐', type: 'food', place: '绿茶(西湖春天店)', lat: 30.2506, lng: 120.1338, cost: '以预订页为准', price_ref: 'none' },
      { time: '14:00-15:30', title: '河坊街 · 南宋御街', type: 'shopping', place: '清河坊街', lat: 30.2441, lng: 120.1674, transport: '公交约25分钟', cost: '免费', price_ref: 'none' },
      { time: '16:30-18:00', title: '杭州东 → 上海虹桥', type: 'transport', place: '杭州东站', lat: 30.2919, lng: 120.2123, transport: '高铁约1h', cost: '含往返估算票价', price_ref: 'estimate' }
    ]}
  ],
  price_summary: [
    { category: '火车票', option: '高铁 上海虹桥-杭州东 往返', price: '¥150 ~ ¥220/人（估算）', source: '估算' },
    { category: '酒店', option: '西湖周边', price: '以预订页为准', source: '以预订页为准' }
  ],
  tips: ['高铁票提前3天在12306购买', '灵隐寺香花券现场扫码即可', '西湖边周末人流大，早上游览体验最好']
};

function extractJsonFromMessages(messages) {
  const sys = (messages.find((m) => m.role === 'system') || {}).content || '';
  if (sys.includes('旅行需求解析器')) return JSON.stringify(extraction);
  return JSON.stringify(plan);
}

createServer((req, res) => {
  if (!req.url || !req.url.includes('/chat/completions')) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    const content = extractJsonFromMessages(parsed.messages || []);
    const out = JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out);
  });
}).listen(PORT, () => console.log(`mock LLM ready on http://127.0.0.1:${PORT}`));
