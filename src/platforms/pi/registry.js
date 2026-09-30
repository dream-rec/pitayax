import { tryCommand } from '../../lib/runtime.js';

// 钉死版本是默认路径，但机器上的 registry 视野并不总等于公共 registry：
// npm 缓存过期（prefer-offline）、镜像同步滞后或企业代理都可能让某个已发布版本
// 在本机"不存在"，npm 会直接 ETARGET 报错。这里按「先确认可见 → 再做最小回退」处理，
// 不让一次安装因为本机缓存状态整体失败。

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

// 复核用与真实安装同形状的 dry-run：Pi 内部的 npm install 用的是缩写 packument，
// 而 npm view 走的是完整 packument（两者缓存键不同），所以用 dry-run 才会真正预热到
// 安装要读的那份元数据，--prefer-online 强制重新校验，--dry-run 不写入 node_modules。
export async function versionVisible(name, version, npmDir) {
  const result = await tryCommand('npm', [
    'install',
    `${name}@${version}`,
    '--prefix',
    npmDir,
    '--legacy-peer-deps',
    '--prefer-online',
    '--dry-run'
  ]);
  return result.ok;
}

export async function publishedVersions(name) {
  const result = await tryCommand('npm', ['view', name, 'versions', '--json', '--prefer-online']);
  if (!result.ok || !result.stdout) return undefined;
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return undefined;
  }
}

// 装某个钉死版本前的最小防护：先原样装，失败才做一次 registry 复核。
// 复核能看到这个版本 → 之前的失败是本机缓存过期，重试原版本即可；
// 本机 registry 确实看不到 → 退到同线最高版本并如实报告，不让整体安装失败。
export async function installPinnedPlugin(plugin, install, npmDir) {
  const pinned = versionOf(plugin.spec);
  try {
    install(plugin.spec);
    return { spec: plugin.spec, version: pinned };
  } catch (error) {
    if (!pinned || !(await versionVisible(plugin.name, pinned, npmDir))) {
      const versions = await publishedVersions(plugin.name);
      const fallback = pickFallbackVersion(versions ?? [], pinned ?? '');
      if (!pinned || !fallback) throw error;
      const spec = `${plugin.spec.slice(0, plugin.spec.lastIndexOf('@'))}@${fallback}`;
      install(spec);
      return {
        spec,
        version: fallback,
        substituted: true,
        reason: `钉死版本 ${plugin.name}@${pinned} 在本机 registry 不可见，改用同线最高版本 ${fallback}`
      };
    }

    install(plugin.spec);
    return { spec: plugin.spec, version: pinned, retried: true };
  }
}

export function versionOf(spec) {
  const at = spec.lastIndexOf('@');
  return at > 0 ? spec.slice(at + 1) : undefined;
}