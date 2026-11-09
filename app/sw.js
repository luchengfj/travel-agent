/* 行旅 PWA Service Worker —— 离线可开 App 外壳 + 回看静态样例。
 * /api/chat 一律 network-only：离线时不伪造 LLM 回复。
 * 改任何静态文件后手动 +1 CACHE_VERSION，触发旧缓存清理。
 */
const CACHE_VERSION = "xinglv-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./sample-plan.md",
  "./sample-plan-card.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 对话接口：只走网络，离线直接失败，由前端提示并保留历史（绝不编造）。
  // 两条后端路径都要网：Worker 的 /api/chat，和本机桥的 /v1/chat/completions。
  if (url.pathname.endsWith("/api/chat") || url.pathname.endsWith("/v1/chat/completions")) return;
  // 本机桥的引导信息带每进程随机 token，绝不能进缓存（否则重启后拿旧 token 一直 401）。
  if (url.pathname.endsWith("/bridge-info.json")) return;
  // 注：/pair 是 POST，已在第 34 行按方法放行，不会进缓存。

  // 同源静态资源：缓存优先，后台顺带更新（stale-while-revalidate）。
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 跨域（例如用户填的 Worker 域名）：只走网络，不缓存、不拦截。
  // 不写 event.respondWith，浏览器按默认处理。
});
