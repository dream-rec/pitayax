import { delimiter, extname, join } from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function executableCandidates(command, platform = process.platform) {
  if (platform !== 'win32' || extname(command)) {
    return [command];
  }
  return [`${command}.cmd`, `${command}.exe`, `${command}.bat`, command];
}

export function resolveCommand(command, options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const pathValue = options.pathValue ?? env.PATH ?? env.Path ?? env.path ?? '';
  const separator = options.delimiter ?? (platform === 'win32' ? ';' : delimiter);
  const candidates = executableCandidates(command, platform);

  for (const directory of pathValue.split(separator).filter(Boolean)) {
    for (const candidate of candidates) {
      const filePath = join(directory.replace(/^"|"$/g, ''), candidate);
      if (existsSync(filePath)) {
        return filePath;
      }
    }
  }
  return undefined;
}

export function commandExists(command, options) {
  return Boolean(resolveCommand(command, options));
}

export function commandForPlatform(command, platform = process.platform) {
  if (platform === 'win32' && !extname(command)) {
    return `${command}.cmd`;
  }
  return command;
}

// cmd.exe 只按空白切词，含空格的参数（Windows 用户目录常带空格）必须加引号。
function quoteForCmd(value) {
  const text = String(value);
  return /[\s"&|<>^()]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function windowsCommandLine(executable, args) {
  return [executable, ...args].map(quoteForCmd).join(' ');
}

// shell 模式下整行作为单个字符串交给 shell：与 Node 的 shell+args 拼接行为一致，
// 但会自行给含空格的参数加引号，并且不触发 DEP0190。
function spawnShell(line, options) {
  return spawnSync(line, {
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding,
    cwd: options.cwd,
    env: options.env,
    shell: true,
    windowsHide: true
  });
}

export function runCommand(command, args, options = {}) {
  const executable = options.resolve === false ? command : resolveCommand(command, options) ?? commandForPlatform(command, options.platform);
  const isWindowsShim = (options.platform ?? process.platform) === 'win32' && /\.(cmd|bat)$/i.test(executable);
  const useShell = options.shell ?? isWindowsShim;
  const result = useShell
    ? spawnShell(windowsCommandLine(executable, args), options)
    : spawnSync(executable, args, {
        stdio: options.stdio ?? 'inherit',
        encoding: options.encoding,
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true
      });

  if (result.error) {
    throw new Error(`无法运行 ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 执行失败（退出码 ${result.status ?? 'unknown'}）。`);
  }
  return result;
}

// 用于探测类调用（npm view 等）：不抛异常，把失败交给调用方判断。
export function tryCommand(command, args, options = {}) {
  const executable = options.resolve === false ? command : resolveCommand(command, options) ?? commandForPlatform(command, options.platform);
  const isWindowsShim = (options.platform ?? process.platform) === 'win32' && /\.(cmd|bat)$/i.test(executable);
  const useShell = options.shell ?? isWindowsShim;
  const result = useShell
    ? spawnShell(windowsCommandLine(executable, args), { ...options, stdio: 'pipe', encoding: 'utf8' })
    : spawnSync(executable, args, {
        stdio: 'pipe',
        encoding: 'utf8',
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true
      });
  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error
  };
}

export function pythonCommand(options) {
  if (commandExists('python3', options)) {
    return 'python3';
  }
  if (commandExists('python', options)) {
    return 'python';
  }
  return undefined;
}

export function projectPythonCommand(relativeScript, options) {
  const platform = options?.platform ?? process.platform;
  const python = pythonCommand(options) ?? (platform === 'win32' ? 'python' : 'python3');
  return `${python} -X utf8 ${relativeScript}`;
}
