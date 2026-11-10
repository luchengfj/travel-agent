#!/usr/bin/env node
/**
 * tools/tunnel.mjs —— 一条命令把行旅 PWA 送到公网，供手机打开。
 *
 * 用法（在仓库根目录）：
 *     node tools/tunnel.mjs           # cloudflared quick tunnel（域名每次随机）
 *     node tools/tunnel.mjs --lt      # localtunnel（loca.lt）固定子域，重启后同名可认领
 *
 * 两种模式都做同样四件事：
 *   1. 检查本机桥（127.0.0.1:8789）是否活着 —— 桥是 DSH 宿主内插件，DSH 开着它就在跑；
 *   2. 起隧道；
 *   3. 拿到公网地址后**实测 /healthz 真的通**（不是「拿到域名」就算成功）；
 *   4. 打印公网地址 + 手机配对码，然后前台守着，Ctrl+C 结束。
 *
 * 为什么 cloudflared 模式不用管道读输出：本机沙箱下给子进程开管道会 EPERM，
 * 所以统一走 --logfile，靠读文件拿日志。
 *
 * 为什么 localtunnel 模式要自己实现：官方 CLI 是 npm 包（本机无 npm），
 * 而协议极简（GET 协商 → 拿 port → 裸 TCP 转发，一条连接一个请求）。
 * **绝不改写 Host 头**：localtunnel 的 `--local-host` 会把 Host 改成 127.0.0.1，
 * 那样桥会以为是本机请求，直接把主 token 和配对码发给公网。
 *
 * 已知限制（如实写在输出里，不粉饰）：
 *   - cloudflared quick tunnel 域名每次重启都变；
 *   - **localtunnel 免费档实测已不可靠（2026-11-10 复测）**：同一子域连续 15 次探测
 *     得到 0 次 200（502/503/超时混着来），子域协商连续 403。`--lt` 分支保留但**不建议**用；
 *     默认走 cloudflared。
 *   - localtunnel 并发很弱（max_conn_count 只要 2），一 TCP 一请求；
 *   - localtunnel 对浏览器 UA 首访会弹一个反滥用页，要照页面提示输一次 IP；
 *   - 配对码是桥每个进程随机生成的，DSH 重启就换。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const BRIDGE = 'http://127.0.0.1:8789';
const LOCAL = { host: '127.0.0.1', port: 8789 };
const CF = process.env.CLOUDFLARED || 'C:\\ai\\.tools\\cloudflared\\cloudflared.exe';
const LOG = path.join(ROOT, `_tunnel-${process.pid}.log`);

// localtunnel：固定子域。改这里就是改地址；桥的 publicHosts 也要同步改。
const LT_HOST = process.env.LT_HOST || 'loca.lt';
const LT_SUBDOMAIN = process.env.LT_SUBDOMAIN || 'xinglv-2736';

const USE_LT = process.argv.includes('--lt');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function getJson(url, timeoutMs = 5000, headers = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store', headers });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

// ── 1. 桥在不在 ──────────────────────────────────────────────
async function checkBridge() {
  let info;
  try {
    const r = await getJson(`${BRIDGE}/bridge-info.json`);
    if (r.status !== 200) return { ok: false, why: `bridge-info.json 返回 ${r.status}` };
    info = JSON.parse(r.body);
  } catch (err) {
    return { ok: false, why: `连不上 ${BRIDGE}（${err.message}）` };
  }
  if (!info.ok) return { ok: false, why: 'bridge-info.json 里 ok !== true' };
  if (info.auth !== 'bearer') {
    return {
      ok: false,
      why: `桥没开公网模式（auth=${info.auth}）。请在 bridge/cordis.patch.yml 里设 publicAccess: true 后重装插件`,
    };
  }
  if (!/^\d{6}$/.test(String(info.pairCode || ''))) {
    return { ok: false, why: `拿不到 6 位配对码（实际：${JSON.stringify(info.pairCode)}）` };
  }
  return { ok: true, info };
}

// ── 2a. cloudflared quick tunnel ─────────────────────────────
function startCloudflared() {
  if (!existsSync(CF)) die(`找不到 cloudflared：${CF}\n  下载：https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe\n  或用环境变量 CLOUDFLARED 指定路径。`);
  if (existsSync(LOG)) rmSync(LOG, { force: true });

  // stdio 全 ignore：沙箱下给子进程开管道会 EPERM；日志靠 --logfile。
  const child = spawn(CF, [
    'tunnel',
    '--url', BRIDGE,
    '--protocol', 'http2',
    '--logfile', LOG,
    '--loglevel', 'info',
    '--no-autoupdate',
  ], { stdio: 'ignore', windowsHide: true });

  child.on('error', (err) => die(`起隧道失败：${err.message}`));
  return child;
}

async function waitForDomain(child, budgetMs = 90000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      die(`cloudflared 退出了（code=${child.exitCode}），日志：${LOG}`);
    }
    if (existsSync(LOG)) {
      let text = '';
      try {
        text = readFileSync(LOG, 'utf8');
      } catch {
        /* 文件正被写，下一轮再来 */
      }
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && /Registered tunnel connection/.test(text)) return m[0];
    }
    await sleep(700);
  }
  die(`等了 ${budgetMs / 1000}s 还没拿到公网域名，看看日志：${LOG}`);
}

// ── 2b. localtunnel（自己实现，因为本机没 npm）───────────────
async function negotiateSubdomain(want, budgetMs = 60000) {
  // 服务端在名字被占时**静默返回随机名**，所以必须循环到 id === want 才算拿到。
  const deadline = Date.now() + budgetMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const r = await getJson(`https://${LT_HOST}/${want}`, 20000, {
      // 非浏览器 UA 可跳过 loca.lt 的 511 反滥用拦截页
      'User-Agent': 'curl/8.4.0',
    });
    if (r.status !== 200) {
      console.log(`  协商第 ${attempt} 次：HTTP ${r.status}，重试…`);
      await sleep(1200);
      continue;
    }
    let info;
    try {
      info = JSON.parse(r.body);
    } catch {
      console.log(`  协商第 ${attempt} 次：返回不是 JSON，重试…`);
      await sleep(1200);
      continue;
    }
    if (info.id === want) {
      console.log(`  协商第 ${attempt} 次：拿到固定子域 ${want}`);
      return info;
    }
    console.log(`  协商第 ${attempt} 次：被服务端改成 ${info.id}（名字被占），重试…`);
    await sleep(900);
  }
  die(`等了 ${budgetMs / 1000}s 也没拿到子域 "${want}"，换个更冷门的名字（LT_SUBDOMAIN 环境变量）再试。`);
}

function startLocaltunnel(info) {
  const target = { host: info.ip || LT_HOST, port: Number(info.port) };
  const maxConn = Math.max(1, Number(info.max_conn_count) || 2);
  const sockets = new Set();
  let closed = false;

  // 一条 TCP 连接只承载一个 HTTP 请求，所以开 maxConn 条循环接活。
  // 关键：永远原样透传 Host 头，绝不改写成 127.0.0.1。
  const worker = () => {
    if (closed) return;
    const remote = net.connect(target, () => {
      remote.setNoDelay(true);
      const local = net.connect(LOCAL, () => {
        local.setNoDelay(true);
        remote.pipe(local).pipe(remote);
      });
      sockets.add(local);
      local.on('close', () => sockets.delete(local));
      local.on('error', () => remote.destroy());
    });
    sockets.add(remote);
    remote.on('close', () => {
      sockets.delete(remote);
      if (!closed) setTimeout(worker, 20);
    });
    remote.on('error', () => {});
  };

  for (let i = 0; i < maxConn; i += 1) worker();

  return {
    url: info.url || `https://${LT_HOST}/${info.id}`,
    stop() {
      closed = true;
      for (const s of sockets) s.destroy();
    },
  };
}

// ── 3. 实测真的通（拿到域名 ≠ 能用）──────────────────────────
async function waitHealthy(domain, child, budgetMs = 60000) {
  const deadline = Date.now() + budgetMs;
  let last = '';
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) die(`cloudflared 在验证期间退出（code=${child.exitCode}）`);
    try {
      // 非浏览器 UA：跳过 loca.lt 拦截页，也让 403 明确是桥回的
      const r = await getJson(`${domain}/healthz`, 12000, { 'User-Agent': 'curl/8.4.0' });
      if (r.status === 200 && /"ok"\s*:\s*true/.test(r.body)) return true;
      if (r.status === 403 && /public host/.test(r.body)) {
        die(`隧道通了，但桥的 Host 白名单没放行 ${new URL(domain).host}\n`
          + `  把它加进 bridge/cordis.patch.yml 的 publicHosts（或用后缀白名单），然后重装插件。`);
      }
      last = `${r.status} ${r.body.slice(0, 120)}`;
    } catch (err) {
      last = `${err.name}: ${err.message}`;
    }
    await sleep(1500);
  }
  die(`隧道起来了但 /healthz 一直不通（最后一次：${last}）`);
}

// ── main ─────────────────────────────────────────────────────
const bridge = await checkBridge();
if (!bridge.ok) die(bridge.why);

console.log('行旅 · 公网隧道');
console.log('─'.repeat(58));
console.log(`本机桥        ${BRIDGE}  （${bridge.info.provider} / ${bridge.info.model}）`);

let child = null;
let lt = null;
let domain;

if (USE_LT) {
  console.log(`模式          localtunnel（固定子域，${LT_HOST}）`);
  console.log('正在认领子域…');
  const info = await negotiateSubdomain(LT_SUBDOMAIN);
  lt = startLocaltunnel(info);
  domain = lt.url;
} else {
  console.log('模式          cloudflared quick tunnel（域名每次随机）');
  console.log('正在起隧道…  （用 --protocol http2，QUIC 7844 在本机常被墙）');
  child = startCloudflared();
  domain = await waitForDomain(child);
}

let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  if (child && child.exitCode === null) child.kill();
  if (lt) lt.stop();
  if (existsSync(LOG)) rmSync(LOG, { force: true });
};
process.on('SIGINT', () => { cleanup(); console.log('\n隧道已关闭。'); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

await waitHealthy(domain, child);

// 域名通了之后重读一次桥信息：token/pairCode 是每进程随机的，不缓存
const fresh = await checkBridge();
const pairCode = fresh.ok ? fresh.info.pairCode : bridge.info.pairCode;

console.log('─'.repeat(58));
console.log('');
console.log('  手机打开：  ' + domain);
console.log('  配对码：    ' + pairCode);
console.log('');
console.log('  手机上：打开上面的地址 → 右下 ⚙ → 输入这 6 位数字 → 保存。');
console.log('  配对一次就行，令牌存在手机本地（30 天，DSH 重启后需重新配对）。');
console.log('');
console.log('─'.repeat(58));
console.log('注意：');
if (USE_LT) {
  console.log('  · 这个子域是固定的，重启后再跑同一条命令能认领回来（名字被占时多试几次）；');
  console.log('  · 【已实测不可靠】2026-11-10 复测：同一地址连续 15 次探测 0 次成功（502/503/超时），');
  console.log('    子域协商也常连续 403。这只是「能用一下」，正式用请走 cloudflared 或命名隧道；');
  console.log('  · 手机第一次打开可能见到一个反滥用页面，照提示把页面上的 IP 输进去点 Continue（约 7 天一次）；');
  console.log('  · localtunnel 并发很弱（一个连接一个请求），只适合手机上先用，不建议当正式入口；');
} else {
  console.log('  · 这个域名是临时的，隧道关掉/重启就换一个新的（要固定请用 --lt）；');
}
console.log('  · 配对码也是每个 DSH 进程随机生成的，重启即变；');
console.log('  · 隧道只把「本机桥」暴露出去，公网拿不到主 token，必须先配对。');
console.log('');
console.log('按 Ctrl+C 关闭隧道。\n');

// 前台守着，顺便盯着隧道别悄悄死掉
if (child) {
  const guard = setInterval(() => {
    if (child.exitCode !== null) {
      cleanup();
      console.error(`✗ cloudflared 退出了（code=${child.exitCode}），隧道已断。`);
      process.exit(1);
    }
  }, 5000);
  guard.unref?.();

  child.on('exit', (code) => {
    cleanup();
    console.error(`\n✗ cloudflared 退出（code=${code}），隧道已断。`);
    process.exit(code ?? 1);
  });
} else {
  setInterval(() => {}, 1 << 30);
}
