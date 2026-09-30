import path from 'node:path';
import process from 'node:process';
import { homedir } from 'node:os';
import { readTextIfExists } from '../../lib/files.js';

// Magic Context 自己按「项目覆盖用户」读这两份配置；用户级目录跟随 XDG_CONFIG_HOME，
// 与插件实现一致（XDG 只在绝对路径时生效）。
export function configHome(env = process.env) {
  const xdg = env.XDG_CONFIG_HOME;
  return xdg && path.isAbsolute(xdg) ? xdg : path.join(env.HOME ?? homedir(), '.config');
}

export function magicContextConfigPaths(rootDir, env = process.env) {
  return {
    project: path.join(rootDir, '.cortexkit', 'magic-context.jsonc'),
    user: path.join(configHome(env), 'cortexkit', 'magic-context.jsonc')
  };
}

// 配置是 JSONC：注释和尾逗号都要容忍，但字符串里的 // 不能当注释——
// $schema 的值就是 URL，按行剥离注释会把配置拆坏。
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      out += char;
      if (char === '\\') {
        out += text[index + 1] ?? '';
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      out += '\n';
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }
    out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isObject(merged[key]) && isObject(value) ? deepMerge(merged[key], value) : value;
  }
  return merged;
}

// 模型既可以写成 "provider/model"，也可以写成 { model, thinking_level }。
function modelRef(value) {
  if (typeof value === 'string') return value.trim() || undefined;
  if (isObject(value) && typeof value.model === 'string') return value.model.trim() || undefined;
  return undefined;
}

// setup 向导保证写入的四项：$schema、historian.pi.model、dreamer（模型或 disable）、embedding。
export function magicContextIssues(config) {
  if (config === undefined) return ['未找到 magic-context.jsonc'];
  if (!isObject(config)) return ['配置不是 JSON 对象'];
  const issues = [];
  if (config.enabled === false) issues.push('enabled 为 false');
  if (!(modelRef(config.historian?.pi?.model) ?? modelRef(config.historian?.model))) issues.push('historian.pi.model 缺失');
  if (!(config.dreamer?.disable === true || modelRef(config.dreamer?.pi?.model) || modelRef(config.dreamer?.model))) {
    issues.push('dreamer.pi.model 缺失（或设 dreamer.disable=true）');
  }
  if (typeof config.embedding?.provider !== 'string' || !config.embedding.provider.trim()) {
    issues.push('embedding.provider 缺失');
  }
  return issues;
}

async function loadJsonc(file) {
  const text = await readTextIfExists(file);
  if (text === undefined) return { exists: false };
  try {
    return { exists: true, value: parseJsonc(text) };
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function inspectMagicContext(rootDir, env = process.env) {
  const paths = magicContextConfigPaths(rootDir, env);
  const user = await loadJsonc(paths.user);
  const project = await loadJsonc(paths.project);
  const issues = [];
  for (const [label, file, filePath] of [
    ['用户配置', user, paths.user],
    ['项目配置', project, paths.project]
  ]) {
    if (file.error) issues.push(`${label} ${filePath} 解析失败：${file.error}`);
  }
  const merged =
    user.value === undefined
      ? project.value
      : isObject(user.value) && isObject(project.value)
        ? deepMerge(user.value, project.value)
        : (project.value ?? user.value);
  issues.push(...magicContextIssues(merged));
  return {
    ok: issues.length === 0,
    issues,
    paths,
    source: project.exists ? paths.project : paths.user
  };
}

export function magicContextSetupArgs(cliSpec) {
  return ['--yes', cliSpec, 'setup', '--harness', 'pi'];
}