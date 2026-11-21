/**
 * Travelpayouts（Aviasales/Hotellook 联盟网络）机票真实报价。
 * API: https://api.travelpayouts.com/aviasales/v3/prices_for_dates
 * 数据来自真实搜索缓存（Trip.com 等 OTA gate），价格为人民币最低价。
 */
import type { Env, PriceItem } from './types.ts';

const API = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

export class TPError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function tpConfigured(env: Env): boolean {
  return Boolean(env.TRAVELPAYOUTS_TOKEN);
}

interface TPResp {
  success?: boolean;
  currency?: string;
  data?: {
    origin?: string;
    destination?: string;
    origin_airport?: string;
    destination_airport?: string;
    departure_at?: string;
    return_at?: string;
    airline?: string;
    flight_number?: string;
    price?: number;
    transfers?: number;
    duration_to?: number;
    duration?: number;
    link?: string;
    gate?: string;
  }[];
}

/** 缓存包装（KV / 内存） */
async function cached<T>(env: Env, key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  try {
    if (env.CACHE) {
      const raw = await env.CACHE.get(key);
      if (raw) return JSON.parse(raw) as T;
    }
  } catch {
    // KV 不可用
  }
  const val = await fn();
  try {
    if (env.CACHE) await env.CACHE.put(key, JSON.stringify(val), { expirationTtl: Math.max(60, ttlSec) });
  } catch {
    // 忽略
  }
  return val;
}

async function tpGet(env: Env, params: Record<string, string>): Promise<NonNullable<TPResp['data']>> {
  const token = env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new TPError('NOT_CONFIGURED', '未配置 Travelpayouts Token');
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  u.searchParams.set('currency', 'cny');
  u.searchParams.set('token', token);
  const res = await fetch(u.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new TPError(`HTTP_${res.status}`, `Travelpayouts 接口错误（HTTP ${res.status}）`);
  const j = (await res.json()) as TPResp;
  if (j.success === false) throw new TPError('API_FALSE', 'Travelpayouts 返回 success=false');
  return j.data ?? [];
}

function minsToHm(mins?: number): string {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h}h` : ''}${m ? `${m}m` : ''}`;
}

function toItem(d: NonNullable<TPResp['data']>[number], p: { origin: string; dest: string }): PriceItem {
  const direct = (d.transfers ?? 0) === 0;
  const dep = (d.departure_at ?? '').slice(11, 16);
  const date = (d.departure_at ?? '').slice(5, 10).replace('-', '/');
  const title = `${d.airline ?? ''}${d.flight_number ?? ''} ${direct ? '直飞' : `中转${d.transfers}次`}`;
  const subtitle = [
    `${d.origin_airport ?? d.origin} ${dep || '?'} → ${d.destination_airport ?? d.destination ?? p.dest}`,
    `飞行${minsToHm(d.duration_to ?? d.duration)}`,
    d.gate ? `报价源: ${d.gate}` : '',
  ].filter(Boolean).join(' · ');
  const bookUrl = d.link ? `https://www.aviasales.com${d.link}` : undefined;
  return {
    title,
    subtitle,
    price: d.price !== undefined ? `¥${Math.round(d.price).toLocaleString('zh-CN')}` : undefined,
    tags: [`${date} 出发`, direct ? '直飞' : `${d.transfers}次中转`],
    url: bookUrl,
  };
}

/**
 * 查询出发航班真实报价。
 * 策略：精确日期 → 目的月内最近日期 → 返回空则抛 NO_RESULTS。
 */
export async function searchFlights(
  env: Env,
  p: { originIata: string; destIata: string; departDate: string; returnDate?: string; adults: number },
): Promise<PriceItem[]> {
  const key = `tp:flights:${p.originIata}-${p.destIata}-${p.departDate}-${p.returnDate ?? 'OW'}`;
  return cached(env, key, 600, async () => {
    // 1) 精确日期（单程缓存命中率最高）
    let data = await tpGet(env, {
      origin: p.originIata,
      destination: p.destIata,
      departure_at: p.departDate,
      one_way: 'true',
      sorting: 'price',
      limit: '10',
    });

    // 2) 回退：整月查询，挑最接近出发日的
    if (!data.length) {
      data = await tpGet(env, {
        origin: p.originIata,
        destination: p.destIata,
        departure_at: p.departDate.slice(0, 7),
        one_way: 'true',
        sorting: 'price',
        limit: '30',
      });
      const target = Date.parse(p.departDate);
      data = data
        .filter((d) => d.departure_at)
        .sort(
          (a, b) =>
            Math.abs(Date.parse(a.departure_at!) - target) - Math.abs(Date.parse(b.departure_at!) - target),
        )
        .slice(0, 6);
    }

    if (!data.length) {
      throw new TPError('NO_RESULTS', '该航线暂无缓存报价（Travelpayouts 覆盖有限），可点下方深链去携程实时查询');
    }

    const items = data.slice(0, 5).map((d) => toItem(d, { origin: p.originIata, dest: p.destIata }));

    // 3) 往返：再查返程最低价，作为附加提示
    if (p.returnDate) {
      try {
        const back = await tpGet(env, {
          origin: p.destIata,
          destination: p.originIata,
          departure_at: p.returnDate,
          one_way: 'true',
          sorting: 'price',
          limit: '1',
        });
        if (back.length && back[0].price !== undefined) {
          items.push({
            title: `↩️ 返程最低参考（${p.destIata} → ${p.originIata}）`,
            subtitle: `${back[0].airline ?? ''}${back[0].flight_number ?? ''} · ${(back[0].departure_at ?? '').slice(5, 10).replace('-', '/')} 出发`,
            price: `¥${Math.round(back[0].price).toLocaleString('zh-CN')}`,
            tags: ['返程单程价', '往返=去+返合计'],
          });
        }
      } catch {
        // 返程查不到不影响主结果
      }
    }
    return items;
  });
}
