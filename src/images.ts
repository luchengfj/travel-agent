/**
 * 图片代理：服务端从 Wikimedia Commons 抓取地点实景图并缓存。
 * 用户浏览器可能无法直连 Wikimedia（国内网络），经由本 Worker/Node 服务中转即可正常加载。
 */
import type { Env } from './types.ts';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'travel-agent/0.1 (https://workers.dev; personal travel planner)';
const IMG_HEADERS_BASE: Record<string, string> = {
  'Cache-Control': 'public, max-age=86400',
  'Access-Control-Allow-Origin': '*',
};

// ---------- 缓存：KV（Worker）或内存（Node） ----------

const memCache = new Map<string, { body: ArrayBuffer; ct: string }>();
const MEM_LIMIT = 60;

async function cacheGet(env: Env, key: string): Promise<{ body: ArrayBuffer; ct: string } | null> {
  try {
    if (env.CACHE) {
      const buf = await env.CACHE.get(key, { type: 'arrayBuffer' });
      const ct = await env.CACHE.get(`${key}:ct`);
      if (buf) return { body: buf, ct: ct ?? 'image/jpeg' };
    }
  } catch {
    // KV 不可用则走内存
  }
  return memCache.get(key) ?? null;
}

async function cachePut(env: Env, key: string, body: ArrayBuffer, ct: string): Promise<void> {
  if (memCache.size >= MEM_LIMIT) {
    const first = memCache.keys().next().value;
    if (first) memCache.delete(first);
  }
  memCache.set(key, { body, ct });
  try {
    if (env.CACHE) {
      await env.CACHE.put(key, body, { expirationTtl: 86400 });
      await env.CACHE.put(`${key}:ct`, ct, { expirationTtl: 86400 });
    }
  } catch {
    // 忽略 KV 写入失败
  }
}

// ---------- Wikimedia Commons 检索 ----------

interface CommonsThumb {
  url: string;
  ct: string;
  title?: string;
}

const TITLE_BLACKLIST = /map|logo|icon|flag|chart|diagram|coat of arms|auto ?show|motor ?show|车展|concept car|\bsedan\b| bus\b/i;

function pickFromPages(pages: Record<string, unknown>, requireTitle?: string): CommonsThumb | null {
  const list = Object.values(pages) as { title?: string; imageinfo?: { thumburl?: string; mime?: string }[] }[];
  const candidates: CommonsThumb[] = [];
  for (const p of list) {
    const title = p.title ?? '';
    if (!/\.(jpe?g|png)$/i.test(title)) continue;
    if (TITLE_BLACKLIST.test(title)) continue;
    const info = p.imageinfo?.[0];
    if (!info?.thumburl) continue;
    candidates.push({ url: info.thumburl, ct: info.mime === 'image/png' ? 'image/png' : 'image/jpeg', title });
  }
  if (!candidates.length) return null;
  // 文本搜索时优先选标题包含关键词的图片，避免"重庆"配到车展照片这类不相关结果
  if (requireTitle) {
    const kw = requireTitle.toLowerCase();
    const matched = candidates.find((c) => (c.title ?? '').toLowerCase().includes(kw));
    return matched ?? null;
  }
  return candidates[0] ?? null;
}

async function commonsQuery(params: Record<string, string>, requireTitle?: string): Promise<CommonsThumb | null> {
  const u = new URL(COMMONS_API);
  u.searchParams.set('action', 'query');
  u.searchParams.set('format', 'json');
  u.searchParams.set('prop', 'imageinfo');
  u.searchParams.set('iiprop', 'url|mime');
  u.searchParams.set('iiurlwidth', '480');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { query?: { pages?: Record<string, unknown> } };
  if (!j.query?.pages) return null;
  return pickFromPages(j.query.pages, requireTitle);
}

/** Wikidata 实体主图（P18）：城市/著名景点的官方配图，最可靠 */
async function wikidataImage(q: string): Promise<CommonsThumb | null> {
  try {
    const s = new URL('https://www.wikidata.org/w/api.php');
    s.searchParams.set('action', 'wbsearchentities');
    s.searchParams.set('search', q);
    s.searchParams.set('language', 'zh');
    s.searchParams.set('uselang', 'zh');
    s.searchParams.set('type', 'item');
    s.searchParams.set('limit', '1');
    s.searchParams.set('format', 'json');
    const sr = await fetch(s.toString(), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!sr.ok) return null;
    const sj = (await sr.json()) as { search?: { id?: string }[] };
    const entityId = sj.search?.[0]?.id;
    if (!entityId) return null;

    const c = new URL('https://www.wikidata.org/w/api.php');
    c.searchParams.set('action', 'wbgetclaims');
    c.searchParams.set('entity', entityId);
    c.searchParams.set('property', 'P18');
    c.searchParams.set('format', 'json');
    const cr = await fetch(c.toString(), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!cr.ok) return null;
    const cj = (await cr.json()) as { claims?: { P18?: { mainsnak?: { datavalue?: { value?: unknown } } }[] } };
    const fileRaw = cj.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    const file = typeof fileRaw === 'string' ? fileRaw.replace(/^File:/i, '') : '';
    if (!file || !/\.(jpe?g|png)$/i.test(file)) return null;
    return {
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`,
      ct: 'image/jpeg',
      title: file,
    };
  } catch {
    return null;
  }
}

async function findThumb(
  q: string,
  geo: { lat: number; lng: number } | null,
  strict: boolean,
): Promise<CommonsThumb | null> {
  // 1) Wikidata 实体主图：著名景点/城市的官方配图，最精确
  if (q) {
    const wd = await wikidataImage(q);
    if (wd) return wd;
    if (strict) return null; // 餐饮/酒店等：Wikidata 没有就宁可不放图，避免张冠李戴
    // 2) Commons 标题精确匹配
    try {
      const r = await commonsQuery({ generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '8' }, q);
      if (r) return r;
    } catch {
      // fallthrough
    }
  }
  if (strict) return null;
  // 3) 地理检索：坐标附近的实拍（适合景点/交通枢纽兜底）
  if (geo) {
    try {
      const r = await commonsQuery({
        generator: 'geosearch',
        ggscoord: `${geo.lat}|${geo.lng}`,
        ggsradius: '800',
        ggslimit: '8',
      });
      if (r) return r;
    } catch {
      // fallthrough
    }
  }
  // 4) 放宽标题限制的全文检索（最后兜底）
  if (q) {
    try {
      const r = await commonsQuery({ generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '6' });
      if (r) return r;
    } catch {
      // fallthrough
    }
  }
  return null;
}

// ---------- 404 占位图 ----------

const NOT_FOUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#c7d2fe"/><stop offset="1" stop-color="#bae6fd"/>
</linearGradient></defs>
<rect width="96" height="96" rx="12" fill="url(#g)"/>
<text x="48" y="58" font-size="40" text-anchor="middle">📍</text></svg>`;

function notFound(): Response {
  return new Response(NOT_FOUND_SVG, {
    status: 404,
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', ...IMG_HEADERS_BASE },
  });
}

// ---------- 入口 ----------

export async function handleImageRequest(env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '');
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '');
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
  const strict = url.searchParams.get('strict') === '1';
  if (!q && !hasGeo) {
    return Response.json({ error: '需要 q 或 lat/lng 参数' }, { status: 400 });
  }
  // _v 版本参数仅用于客户端缓存失效，不参与服务端缓存键
  const key = `img:v4:${q}|${strict ? 's' : 'r'}|${hasGeo ? `${lat.toFixed(3)},${lng.toFixed(3)}` : ''}`;
  const cached = await cacheGet(env, key);
  if (cached) {
    return new Response(cached.body, {
      headers: { 'Content-Type': cached.ct, ...IMG_HEADERS_BASE },
    });
  }

  const thumb = await findThumb(q, hasGeo ? { lat, lng } : null, strict);
  if (!thumb) return notFound();

  try {
    const imgRes = await fetch(thumb.url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(9000),
    });
    if (!imgRes.ok) return notFound();
    const ct = imgRes.headers.get('content-type') ?? thumb.ct;
    if (!ct.startsWith('image/')) return notFound();
    const buf = await imgRes.arrayBuffer();
    await cachePut(env, key, buf, ct);
    return new Response(buf, { headers: { 'Content-Type': ct, ...IMG_HEADERS_BASE } });
  } catch {
    return notFound();
  }
}
