/** Amadeus for Developers（免费测试环境）客户端：机票 / 酒店 / 活动门票 / POI */
import type { Env, PriceItem } from './types.ts';

const API = 'https://test.api.amadeus.com';

export class AmadeusError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function isConfigured(env: Env): boolean {
  return Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET);
}

// ---------- KV / 内存缓存 ----------

interface TokenCache {
  token: string;
  expiresAt: number;
}

let memToken: TokenCache | null = null;

async function kvGet(env: Env, key: string): Promise<string | null> {
  try {
    return (await env.CACHE?.get(key)) ?? null;
  } catch {
    return null;
  }
}

async function kvPut(env: Env, key: string, value: string, ttlSec: number): Promise<void> {
  try {
    if (env.CACHE) await env.CACHE.put(key, value, { expirationTtl: Math.max(60, ttlSec) });
  } catch {
    // KV 不可用时静默降级（本地未绑定 KV 的场景）
  }
}

async function cached<T>(env: Env, key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const raw = await kvGet(env, key);
  if (raw) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // 缓存损坏则重新请求
    }
  }
  const val = await fn();
  await kvPut(env, key, JSON.stringify(val), ttlSec);
  return val;
}

// ---------- 基础请求 ----------

async function getToken(env: Env): Promise<string> {
  if (!isConfigured(env)) throw new AmadeusError('NOT_CONFIGURED', '未配置 Amadeus API Key（配置方法见 README）');

  let tok = memToken && memToken.expiresAt > Date.now() + 60_000 ? memToken : null;
  if (!tok) {
    const raw = await kvGet(env, 'amadeus:token');
    if (raw) {
      try {
        const p = JSON.parse(raw) as TokenCache;
        if (p.expiresAt > Date.now() + 60_000) tok = p;
      } catch {
        // ignore
      }
    }
  }
  if (tok) return tok.token;

  const res = await fetch(`${API}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.AMADEUS_CLIENT_ID!,
      client_secret: env.AMADEUS_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AmadeusError('AUTH', `Amadeus 认证失败（HTTP ${res.status}）${text.slice(0, 120)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tok = { token: data.access_token, expiresAt: Date.now() + Math.max(300, (data.expires_in ?? 1799) - 60) * 1000 };
  memToken = tok;
  await kvPut(env, 'amadeus:token', JSON.stringify(tok), 1500);
  return tok.token;
}

async function apiGet<T>(env: Env, path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const token = await getToken(env);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== '') qs.set(k, String(v));
  }
  const res = await fetch(`${API}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 400 || res.status === 404) {
    // Amadeus 用 400/404 表示"无结果"（比如测试库未覆盖该城市/日期）
    let detail = '没有查询结果';
    try {
      const b = (await res.json()) as { errors?: { detail?: string }[] };
      detail = b.errors?.[0]?.detail || detail;
    } catch {
      // ignore
    }
    throw new AmadeusError('NO_RESULTS', detail);
  }
  if (res.status === 401) throw new AmadeusError('AUTH', 'Amadeus 认证失败，请检查 API Key / Secret');
  if (!res.ok) throw new AmadeusError(`HTTP_${res.status}`, `Amadeus 接口错误（HTTP ${res.status}）`);
  return (await res.json()) as T;
}

// ---------- 工具函数 ----------

const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: 'JP¥', GBP: '£', HKD: 'HK$' };

function money(n: number | string | undefined, currency?: string): string | undefined {
  const v = Number(n);
  if (n === undefined || n === null || Number.isNaN(v)) return undefined;
  const sym = CURRENCY_SYMBOL[currency ?? 'CNY'] ?? `${currency ?? ''} `;
  return `${sym}${v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

/** PT13H35M / P1DT2H → "13h35m" / "1天2h" */
function fmtDuration(iso?: string): string {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso ?? '');
  if (!m) return '';
  return `${m[1] ? `${m[1]}天` : ''}${m[2] ? `${m[2]}h` : ''}${m[3] ? `${m[3]}m` : ''}`;
}

const CABIN_CN: Record<string, string> = {
  ECONOMY: '经济舱',
  PREMIUM_ECONOMY: '超级经济舱',
  BUSINESS: '商务舱',
  FIRST: '头等舱',
};

// ---------- 机票 ----------

interface AmadeusFlightResp {
  data?: {
    price?: { grandTotal?: string; total?: string; currency?: string };
    numberOfBookableSeats?: number;
    itineraries?: {
      duration?: string;
      segments?: {
        carrierCode?: string;
        number?: string;
        departure?: { iataCode?: string; at?: string };
        arrival?: { iataCode?: string; at?: string };
      }[];
    }[];
    travelerPricings?: { fareDetailsBySegment?: { cabin?: string }[] }[];
  }[];
}

export async function searchFlights(
  env: Env,
  p: { originIata: string; destIata: string; departDate: string; returnDate?: string; adults: number },
): Promise<PriceItem[]> {
  const key = `amadeus:flights:${p.originIata}-${p.destIata}-${p.departDate}-${p.returnDate ?? 'OW'}-${p.adults}-CNY`;
  return cached(env, key, 600, async () => {
    const j = await apiGet<AmadeusFlightResp>(env, '/v2/shopping/flight-offers', {
      originLocationCode: p.originIata,
      destinationLocationCode: p.destIata,
      departureDate: p.departDate,
      returnDate: p.returnDate,
      adults: p.adults,
      currencyCode: 'CNY',
      max: 8,
      nonStop: 'false',
    });
    const items: PriceItem[] = [];
    for (const o of j.data ?? []) {
      const out = o.itineraries?.[0];
      const back = o.itineraries?.[1];
      const first = out?.segments?.[0];
      const last = out?.segments?.[out.segments.length - 1];
      if (!first || !last || !out) continue;
      const subtitle = [
        `${first.departure?.iataCode ?? ''} ${first.departure?.at?.slice(11, 16) ?? ''} → ${last.arrival?.iataCode ?? ''} ${last.arrival?.at?.slice(11, 16) ?? ''}`,
        `去程${fmtDuration(out.duration)}`,
      ];
      if (back) {
        const bf = back.segments?.[0];
        const bl = back.segments?.[back.segments.length - 1];
        subtitle.push(
          `返程 ${bf?.departure?.at?.slice(11, 16) ?? ''}-${bl?.arrival?.at?.slice(11, 16) ?? ''} ${fmtDuration(back.duration)}`,
        );
      }
      const cabin =
        CABIN_CN[o.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ?? ''] ?? undefined;
      items.push({
        title: `${first.carrierCode ?? ''}${first.number ?? ''} ${out.segments && out.segments.length === 1 ? '直飞' : `中转${(out.segments?.length ?? 2) - 1}次`}`,
        subtitle: subtitle.join(' · '),
        price: money(o.price?.grandTotal ?? o.price?.total, o.price?.currency),
        tags: [`${p.adults}人总价`, ...(cabin ? [cabin] : [])],
      });
    }
    if (!items.length) throw new AmadeusError('NO_RESULTS', '该航线/日期暂无报价（Amadeus 测试库覆盖有限）');
    return items.slice(0, 5);
  });
}

// ---------- 酒店 ----------

interface AmadeusHotelListResp {
  data?: { hotelId?: string; name?: string }[];
}

interface AmadeusHotelOffersResp {
  data?: {
    hotel?: { hotelId?: string; name?: string; address?: { cityName?: string } };
    offers?: {
      price?: { total?: string; currency?: string };
      room?: { typeEstimated?: { category?: string; beds?: number; bedType?: string } };
    }[];
  }[];
}

const ROOM_CN: Record<string, string> = {
  STANDARD: '标准间',
  SUPERIOR: '高级房',
  DELUXE: '豪华房',
  JUNIOR_SUITE: '小套房',
  SUITE: '套房',
  EXECUTIVE_SUITE: '行政套房',
};

export async function searchHotels(
  env: Env,
  p: { cityIata: string; checkIn: string; checkOut: string; adults: number },
): Promise<PriceItem[]> {
  const key = `amadeus:hotels:${p.cityIata}-${p.checkIn}-${p.checkOut}-${p.adults}-CNY`;
  return cached(env, key, 600, async () => {
    // 1) 城市码 → 酒店ID列表（测试库覆盖部分城市）
    const list = await apiGet<AmadeusHotelListResp>(env, '/v1/reference-data/locations/hotels/by-city', {
      cityCode: p.cityIata,
    });
    const ids = (list.data ?? []).slice(0, 10).map((h) => h.hotelId).filter(Boolean) as string[];
    if (!ids.length) throw new AmadeusError('NO_RESULTS', `Amadeus 测试库暂无 ${p.cityIata} 的酒店数据`);

    // 2) 酒店ID → 实时报价
    const j = await apiGet<AmadeusHotelOffersResp>(env, '/v3/shopping/hotel-offers', {
      hotelIds: ids.join(','),
      adults: p.adults,
      checkInDate: p.checkIn,
      checkOutDate: p.checkOut,
      roomQuantity: 1,
      currencyCode: 'CNY',
    });
    const items: PriceItem[] = [];
    for (const h of j.data ?? []) {
      if (!h.offers?.length || !h.hotel?.name) continue;
      const best = [...h.offers].sort(
        (a, b) => Number(a.price?.total ?? 1e9) - Number(b.price?.total ?? 1e9),
      )[0];
      const cat = best.room?.typeEstimated?.category;
      items.push({
        title: h.hotel.name,
        subtitle: h.hotel.address?.cityName ?? '',
        price: `${money(best.price?.total, best.price?.currency) ?? ''}/晚`,
        tags: [ROOM_CN[cat ?? ''] ?? cat ?? '客房'],
      });
    }
    if (!items.length) {
      throw new AmadeusError('NO_RESULTS', `${p.cityIata} 的酒店在所选日期暂无可报价房（Amadeus 测试库覆盖有限）`);
    }
    return items
      .sort((a, b) => Number((a.price ?? '').replace(/[^\d.]/g, '')) - Number((b.price ?? '').replace(/[^\d.]/g, '')))
      .slice(0, 5);
  });
}

// ---------- 景点活动 / POI ----------

interface AmadeusActivitiesResp {
  data?: { name?: string; shortText?: string; price?: { amount?: string; currency?: string } }[];
}

export async function searchActivities(env: Env, p: { lat: number; lng: number }): Promise<PriceItem[]> {
  const key = `amadeus:activities:${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
  return cached(env, key, 1800, async () => {
    const j = await apiGet<AmadeusActivitiesResp>(env, '/v1/shopping/activities', {
      latitude: p.lat,
      longitude: p.lng,
      radius: 20,
    });
    const items = (j.data ?? [])
      .filter((d) => d.price?.amount && d.name)
      .map((d) => ({
        title: d.name!,
        subtitle: d.shortText?.slice(0, 60),
        price: money(d.price!.amount, d.price!.currency),
      }));
    if (!items.length) throw new AmadeusError('NO_RESULTS', '该地区暂无活动门票报价（Amadeus 测试库覆盖有限）');
    return items.slice(0, 6);
  });
}

interface AmadeusPoiResp {
  data?: { name?: string; position?: { latitude?: number; longitude?: number } }[];
}

export interface Poi {
  name: string;
  lat: number;
  lng: number;
}

/** 返回带坐标的知名景点列表（供行程生成的路线图定位参考，无价格） */
export async function searchPois(env: Env, p: { lat: number; lng: number }): Promise<Poi[]> {
  try {
    const j = await apiGet<AmadeusPoiResp>(env, '/v1/reference-data/locations/pois', {
      latitude: p.lat,
      longitude: p.lng,
      radius: 15,
      pageLimit: 12,
    });
    return (j.data ?? [])
      .filter((d) => d.name && d.position?.latitude && d.position?.longitude)
      .map((d) => ({ name: d.name!, lat: d.position!.latitude!, lng: d.position!.longitude! }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

// ---------- 城市 IATA 兜底查询 ----------

export async function lookupCityIata(env: Env, keyword: string): Promise<string | undefined> {
  if (!isConfigured(env)) return undefined;
  try {
    const j = await apiGet<{ data?: { iataCode?: string }[] }>(env, '/v1/reference-data/locations', {
      subType: 'CITY',
      keyword,
      'page[limit]': 1,
    });
    return j.data?.[0]?.iataCode;
  } catch {
    return undefined;
  }
}
