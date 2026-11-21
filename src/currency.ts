/**
 * 当地货币汇率：frankfurter.app 免费开放接口（欧洲央行数据，无需 Key）。
 * 按目的地城市映射币种，汇率缓存 12h。
 */
import type { Env } from './types.ts';

export interface CurrencyInfo {
  currency: string;
  symbol: string;
  ratePerCny: number; // 1 CNY ≈ ratePerCny 当地货币
}

/** 目的地 → 币种（frankfurter 不支持 TWD 等，缺省则返回 null） */
const CITY_CCY: Record<string, { ccy: string; symbol: string }> = {
  东京: { ccy: 'JPY', symbol: '円' },
  大阪: { ccy: 'JPY', symbol: '円' },
  名古屋: { ccy: 'JPY', symbol: '円' },
  札幌: { ccy: 'JPY', symbol: '円' },
  首尔: { ccy: 'KRW', symbol: '₩' },
  釜山: { ccy: 'KRW', symbol: '₩' },
  新加坡: { ccy: 'SGD', symbol: 'S$' },
  曼谷: { ccy: 'THB', symbol: '฿' },
  香港: { ccy: 'HKD', symbol: 'HK$' },
  巴黎: { ccy: 'EUR', symbol: '€' },
  伦敦: { ccy: 'GBP', symbol: '£' },
  法兰克福: { ccy: 'EUR', symbol: '€' },
  慕尼黑: { ccy: 'EUR', symbol: '€' },
  苏黎世: { ccy: 'CHF', symbol: 'CHF' },
  悉尼: { ccy: 'AUD', symbol: 'A$' },
  墨尔本: { ccy: 'AUD', symbol: 'A$' },
  纽约: { ccy: 'USD', symbol: '$' },
  洛杉矶: { ccy: 'USD', symbol: '$' },
};

export async function getCurrency(env: Env, city?: string): Promise<CurrencyInfo | null> {
  if (!city) return null;
  const c = CITY_CCY[city];
  if (!c) return null; // 国内或未支持币种

  const key = `fx:CNY-${c.ccy}`;
  try {
    if (env.CACHE) {
      const raw = await env.CACHE.get(key);
      if (raw) {
        const rate = Number(raw);
        if (Number.isFinite(rate) && rate > 0) return { currency: c.ccy, symbol: c.symbol, ratePerCny: rate };
      }
    }
  } catch {
    // KV 不可用
  }

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=CNY&to=${c.ccy}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { rates?: Record<string, number> };
    const rate = j.rates?.[c.ccy];
    if (!Number.isFinite(rate) || !rate) return null;
    try {
      if (env.CACHE) {
        await env.CACHE.put(key, String(rate), { expirationTtl: 43_200 }); // 12h
      }
    } catch {
      // 忽略
    }
    return { currency: c.ccy, symbol: c.symbol, ratePerCny: rate };
  } catch {
    return null;
  }
}
