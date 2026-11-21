/**
 * Wikivoyage（维基导游）参考价抓取：
 * 解析城市条目里 {{see}}（景点，含价格字段）与 {{sleep}}（住宿，含价格字段）结构化列表。
 * 数据由社区维护，可能滞后 —— 一律标注"参考价"。
 * 服务端抓取（Cloudflare 边缘可访问，用户浏览器无需直连），KV 缓存 24h。
 */
import type { Env, PriceItem } from './types.ts';

const WIKIS = [
  { host: 'zh.wikivoyage.org', name: '名字|名称|name', price: '价格|price' },
  { host: 'en.wikivoyage.org', name: 'name', price: 'price' },
];

interface WvListing {
  kind: 'see' | 'sleep';
  name: string;
  price: string;
}

function stripWiki(s: string): string {
  return s
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$1') // [[链接|文字]] → 链接
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'''?([^']+)'''?/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseListings(wikitext: string): WvListing[] {
  const out: WvListing[] = [];
  const re = /\{\{\s*(see|sleep|景点|住宿)\s*\|([\s\S]*?)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const kind = m[1] === 'see' || m[1] === '景点' ? 'see' : 'sleep';
    const body = m[2].replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$1');
    // 按 | 拆分键值（先移除内层链接已处理，嵌套模板罕见，容忍误差）
    const parts = body.split('|');
    let name = '';
    let price = '';
    for (const part of parts) {
      const kv = part.split('=');
      if (kv.length < 2) continue;
      const key = kv[0].trim().toLowerCase();
      const val = stripWiki(kv.slice(1).join('='));
      if (!val) continue;
      if (!name && /^(名字|名称|name)$/.test(key)) name = val;
      if (!price && /^(价格|price|成本)$/.test(key)) price = val;
    }
    if (name && /\d/.test(price)) {
      out.push({ kind, name, price });
    }
  }
  return out;
}

async function fetchPageWikitext(host: string, page: string): Promise<string | null> {
  const u = new URL(`https://${host}/w/api.php`);
  u.searchParams.set('action', 'parse');
  u.searchParams.set('page', page);
  u.searchParams.set('prop', 'wikitext');
  u.searchParams.set('redirects', '1');
  u.searchParams.set('format', 'json');
  try {
    const res = await fetch(u.toString(), {
      headers: { 'User-Agent': 'travel-agent/0.1 (personal travel planner)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { parse?: { wikitext?: { '*': string } } };
    return j.parse?.wikitext?.['*'] ?? null;
  } catch {
    return null;
  }
}

function cap(items: PriceItem[], n: number): PriceItem[] {
  return items.slice(0, n);
}

export interface WvPrices {
  hotels: PriceItem[];
  tickets: PriceItem[];
  source: string;
}

export async function fetchWvPrices(
  env: Env,
  cityCn: string,
  cityEn?: string,
): Promise<WvPrices | null> {
  const key = `wv:${cityCn}|${cityEn ?? ''}`;
  try {
    if (env.CACHE) {
      const raw = await env.CACHE.get(key);
      if (raw) return JSON.parse(raw) as WvPrices;
    }
  } catch {
    // KV 不可用
  }

  const candidates: { host: string; page: string; cfgIdx: number }[] = [];
  if (cityCn) candidates.push({ host: WIKIS[0].host, page: cityCn, cfgIdx: 0 });
  if (cityEn) candidates.push({ host: WIKIS[1].host, page: cityEn, cfgIdx: 1 });

  for (const c of candidates) {
    const wikitext = await fetchPageWikitext(c.host, c.page);
    if (!wikitext) continue;
    const listings = parseListings(wikitext);
    if (!listings.length) continue;
    const hotels: PriceItem[] = [];
    const tickets: PriceItem[] = [];
    for (const l of listings) {
      const item: PriceItem = {
        title: l.name,
        subtitle: c.host === 'zh.wikivoyage.org' ? `${cityCn} · 社区攻略数据` : `${c.page} · 社区攻略数据`,
        price: l.price,
        tags: ['参考价'],
      };
      (l.kind === 'sleep' ? hotels : tickets).push(item);
    }
    if (!hotels.length && !tickets.length) continue;
    const result: WvPrices = {
      hotels: cap(hotels, 6),
      tickets: cap(tickets, 8),
      source: `${c.host} · ${c.page}`,
    };
    try {
      if (env.CACHE) {
        await env.CACHE.put(key, JSON.stringify(result), { expirationTtl: 86_400 });
      }
    } catch {
      // 忽略
    }
    return result;
  }
  return null;
}
