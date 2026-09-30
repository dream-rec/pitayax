import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tryCommand } from '../../lib/runtime.js';

// 钉死版本是默认路径，但机器上的 registry 视野并不总等于公共 registry：
// npm 缓存过期（prefer-offline）、镜像同步滞后、企业代理、以及本机代理进程没起来，
// 都会让一个已发布版本在本机"不存在"（ETARGET）或直接 ECONNREFUSED。
// 这里按「原生安装 → 定位环境问题 → 最小重试/回退」处理，不让一次安装因为本机网络状态整体失败。

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'];

function compareVersions(a, b) {
  const parse = (value) => String(value).split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function lineOf(version) {
  return String(version).split('-')[0].split('.').slice(0, 2).join('.');
}

// 回退优先同一条 minor 线（离实测组合最近），否则用可用的最高版本。
export function pickFallbackVersion(versions, pinned) {
  const published = versions.filter((version) => compareVersions(version, pinned) !== 0);
  if (published.length === 0) return undefined;
  const sameLine = published.filter((version) => lineOf(version) === lineOf(pinned));
  const pool = sameLine.length > 0 ? sameLine : published;
  return pool.reduce((best, version) => (compareVersions(version, best) > 0 ? version : best));
}

export function versionOf(spec) {
  const at = spec.lastIndexOf('@');
  return at > 0 ? spec.slice(at + 1) : undefined;
}

function proxyUrls(env = process.env) {
  const fromEnv = PROXY_ENV_KEYS.map((key) => env[key]).filter(Boolean);
  const fromNpm = ['proxy', 'https-proxy']
    .map((key) => tryCommand('npm', ['config', 'get', key], { env }).stdout)
    .filter(Boolean);
  return [...new Set([...fromEnv, ...fromNpm])].filter((value) => value !== 'null' && /^https?:\/\//.test(value));
}

// 代理端口连不上（本机 7890 之类的代理没启动/被防火墙挡住）时，直连往往才是通的那条路。
export async function unreachableProxies(env = process.env, timeoutMs = 800) {
  const candidates = proxyUrls(env);
  const results = [];
  for (const url of candidates) {
    const parsed = new URL(url);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    const reachable = await new Promise((resolve) => {
      const socket = net.connect({ host: parsed.hostname, port });
      const settle = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => settle(true));
      socket.once('timeout', () => settle(false));
      socket.once('error', () => settle(false));
    });
    if (!reachable) results.push(url);
  }
  return { configured: candidates, unreachable: results };
}

// 直连覆盖：npm 的 proxy/https-proxy 用 `null` 才是真正关掉（空字符串会被当作未设置而回落到 npmrc）。
export function directEnv(env = process.env) {
  const next = { ...env };
  for (const key of PROXY_ENV_KEYS) delete next[key];
  next.npm_config_proxy = 'null';
  next.npm_config_https_proxy = 'null';
  return next;
}

export function npmInstallArgs(spec, npmDir) {
  return ['install', spec, '--prefix', npmDir, '--legacy-peer-deps'];
}

// 这里必须用 registry 查询而不是 dry-run：dry-run 能靠 lockfile 直接解析出结果，
// 分不清"registry 有"和"本地还留着上一次的解析结果"，会让回退判断失真。
// 也不能复用本机缓存：实测网络不可达时 npm 在 --prefer-online 下仍会拿缓存作答，
// 所以单独用一个临时缓存目录，保证读到的是 registry 当下的事实。
export async function registryVersions(name, env = process.env) {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'pitaya-npm-view-'));
  try {
    const result = await tryCommand(
      'npm',
      ['view', name, 'versions', '--json', '--prefer-online', '--cache', cacheDir],
      { env }
    );
    if (!result.ok || !result.stdout) return undefined;
    try {
      const parsed = JSON.parse(result.stdout);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return undefined;
    }
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

export function describeNetwork(env, proxies) {
  const registry = tryCommand('npm', ['config', 'get', 'registry'], { env }).stdout || '(默认)';
  const parts = [`registry=${registry}`];
  if (proxies.configured.length > 0) parts.push(`proxy=${proxies.configured.join(',')}`);
  if (proxies.unreachable.length > 0) parts.push(`代理连不上：${proxies.unreachable.join(',')}`);
  return parts.join('，');
}

export async function installPinnedPlugin(plugin, ctx) {
  const { piInstall, npmDir } = ctx;
  const env = ctx.env ?? process.env;
  const pinned = versionOf(plugin.spec);

  try {
    piInstall(plugin.spec, env);
    return { spec: plugin.spec, version: pinned };
  } catch (error) {
    const proxies = await unreachableProxies(env);
    const direct = proxies.unreachable.length > 0 ? directEnv(env) : env;
    const notes = [];
    if (proxies.unreachable.length > 0) notes.push(`npm 代理 ${proxies.unreachable.join(',')} 连不上，已改直连`);

    // 先确认 registry 到底有没有这个钉死版本，再谈回退还是重试。
    const versions = await registryVersions(plugin.name, direct);
    if (pinned && versions && !versions.includes(pinned)) {
      const fallback = pickFallbackVersion(versions, pinned);
      if (fallback) {
        const spec = `${plugin.spec.slice(0, plugin.spec.lastIndexOf('@'))}@${fallback}`;
        piInstall(spec, direct);
        return {
          spec,
          version: fallback,
          substituted: true,
          reason: [`钉死版本 ${plugin.name}@${pinned} 在本机 registry 不可见，改用同线最高版本 ${fallback}`, ...notes].join('；')
        };
      }
    }

    if (!versions) {
      throw new Error(`${error.message}\n${describeNetwork(env, proxies)}`);
    }

    // registry 看得到这个版本：先按同形状 dry-run 刷新元数据缓存，再让 Pi 重试原版本。
    await tryCommand('npm', [...npmInstallArgs(`${plugin.name}@${pinned}`, npmDir), '--prefer-online', '--dry-run'], { env: direct });
    piInstall(plugin.spec, direct);
    return { spec: plugin.spec, version: pinned, retried: true, reason: notes.join('；') || undefined };
  }
}