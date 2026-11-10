#!/usr/bin/env node
/**
 * tools/tunnel.mjs —— 一条命令把行旅 PWA 送到公网，供手机打开。
 *
 * 用法（在仓库根目录）：
 *     node tools/tunnel.mjs
 *
 * 它会做四件事：
 *   1. 检查本机桥（127.0.0.1:8789）是否活着 —— 桥是 DSH 宿主内插件，DSH 开着它就在跑；
 *   2. 起 cloudflared quick tunnel（必须 --protocol http2，QUIC 7844 出站常被墙）；
 *   3. 从日志里解析出公网域名，并实测 /healthz 真的通（不是「拿到域名」就算成功）；
 *   4. 打印公网地址 + 手机配对码，然后前台守着，Ctrl+C 结束。
 *
 * 为什么不用管道读 cloudflared 的输出：本机沙箱下给子进程开管道会 EPERM，
 * 所以统一走 --logfile，靠读文件拿日志。
 *
 * 已知限制（如实写在输出里，不粉饰）：
 *   - quick tunnel 的域名是随机的，每次重启都变；
 *   - 配对码是桥每个进程随机生成的，DSH 重启就换。
 *   想要固定域名，见 bridge/README.md 的「公网模式」一节（需要你的 Cloudflare 账号出一个 token）。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const BRIDGE = 'http://127.0.0.1:8789';
const CF = process.env.CLOUDFLARED || 'C:\\ai\\.tools\\cloudflared\\cloudflared.exe';
const LOG = path.join(ROOT, `_tunnel-${process.pid}.log`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function getJson(url, timeoutMs = 5000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
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

// ── 2. 起隧道 ────────────────────────────────────────────────
function startTunnel() {
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
      if (m && /Registered tunnel connection/.test(text)) {
        return m[0];
      }
    }
    await sleep(700);
  }
  die(`等了 ${budgetMs / 1000}s 还没拿到公网域名，看看日志：${LOG}`);
}

// ── 3. 实测真的通（拿到域名 ≠ 能用）──────────────────────────
async function waitHealthy(domain, child, budgetMs = 60000) {
  const deadline = Date.now() + budgetMs;
  let last = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) die(`cloudflared 在验证期间退出（code=${child.exitCode}）`);
    try {
      const r = await getJson(`${domain}/healthz`, 8000);
      if (r.status === 200 && /"ok"\s*:\s*true/.test(r.body)) return true;
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
console.log('正在起隧道…  （用 --protocol http2，QUIC 7844 在本机常被墙）');

const child = startTunnel();

const cleanup = () => {
  if (child.exitCode === null) child.kill();
  if (existsSync(LOG)) rmSync(LOG, { force: true });
};
process.on('SIGINT', () => { cleanup(); console.log('\n隧道已关闭。'); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

const domain = await waitForDomain(child);
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
console.log('  · 这个域名是临时的，隧道关掉/重启就换一个新的；');
console.log('  · 配对码也是每个 DSH 进程随机生成的，重启即变；');
console.log('  · 隧道只把「本机桥」暴露出去，公网拿不到主 token，必须先配对。');
console.log('  · 要固定域名：见 bridge/README.md「公网模式」里的 Dashboard token 路线。');
console.log('');
console.log('按 Ctrl+C 关闭隧道。\n');

// 前台守着，顺便盯着 cloudflared 别悄悄死掉
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
