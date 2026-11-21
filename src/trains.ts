/**
 * 火车票查询：优先尝试直连 12306 公开查询接口（海外网络成功率低），
 * 失败则降级为按里程的参考估价，并在结果里明确标注来源。
 */
import type { PriceItem } from './types.ts';

export interface TrainResult {
  source: '12306' | 'estimate';
  items: PriceItem[];
  note?: string;
}

export interface TrainQuery {
  fromName: string;
  toName: string;
  fromCode?: string; // 12306 电报码，如 BJP(北京) VNP(北京南) AOH(上海虹桥)
  toCode?: string;
  date: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
}

// ---------- 12306 直连（best-effort） ----------

async function try12306(q: TrainQuery): Promise<PriceItem[]> {
  const url = new URL('https://query.12306.cn/ticketquery/leftTicket/query');
  url.searchParams.set('leftTicketDTO.train_date', q.date);
  url.searchParams.set('leftTicketDTO.from_station', q.fromCode ?? '');
  url.searchParams.set('leftTicketDTO.to_station', q.toCode ?? '');
  url.searchParams.set('purpose_codes', 'ADULT');

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://kyfw.12306.cn/otn/leftTicket/init',
    },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { data?: { result?: string[] } };
  const rows = j.data?.result ?? [];

  const items: PriceItem[] = [];
  for (const row of rows) {
    const f = row.split('|');
    const train = f.find((v, i) => i >= 2 && /^(G|D|C|Z|T|K|Y|S)\d{1,5}$/.test(v));
    const times = f.filter((v) => /^\d{2}:\d{2}$/.test(v));
    if (!train || times.length < 2) continue;
    // 行里混有余票数与票价数字，取合理区间内的最小值作为"最低座位价"
    const nums = f
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 20 && n <= 4000);
    items.push({
      title: `${train}  ${q.fromName} → ${q.toName}`,
      subtitle: `${times[0]} 出发 - ${times[1]} 到达`,
      price: nums.length ? `¥${Math.min(...nums)}起` : undefined,
      tags: nums.length ? ['最低价座位'] : ['价格以 12306 为准'],
    });
  }
  return items
    .sort((a, b) => (a.subtitle ?? '').localeCompare(b.subtitle ?? ''))
    .slice(0, 6);
}

// ---------- 里程估算回退 ----------

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateTrains(q: TrainQuery): TrainResult {
  if (q.fromLat !== undefined && q.fromLng !== undefined && q.toLat !== undefined && q.toLng !== undefined) {
    const km = haversineKm(q.fromLat, q.fromLng, q.toLat, q.toLng);
    if (km >= 50 && km <= 4000) {
      const mk = (kind: string, speedKmh: number, ratePerKm: number, lowAdj = 50, highAdj = 80): PriceItem => {
        const hours = Math.max(1, Math.round(km / speedKmh));
        const mid = Math.round((ratePerKm * km) / 10) * 10;
        return {
          title: `${kind}  ${q.fromName} → ${q.toName}`,
          subtitle: `约 ${hours} 小时（约 ${Math.round(km)} 公里）`,
          price: `¥${Math.max(40, mid - lowAdj)} ~ ¥${mid + highAdj}`,
          tags: ['估算价'],
        };
      };
      return {
        source: 'estimate',
        items: [
          mk('高铁 G 字头', 260, 0.45),
          mk('动车 D 字头', 200, 0.33),
          mk('普速 K/T 硬卧', 110, 0.25),
        ],
        note: '12306 直连受限（海外网络/反爬），以下为按里程估算的参考价（±20%），请以 12306 App 实际价格为准',
      };
    }
  }
  return { source: 'estimate', items: [], note: '暂无法获取火车票信息，请在 12306 App 查询' };
}

export async function searchTrains(q: TrainQuery): Promise<TrainResult> {
  if (q.fromCode && q.toCode) {
    try {
      const items = await try12306(q);
      if (items.length) {
        return { source: '12306', items, note: '实时解析自 12306，价格字段可能存在偏差，以 12306 为准' };
      }
    } catch {
      // 直连失败，走估算
    }
  }
  return estimateTrains(q);
}
