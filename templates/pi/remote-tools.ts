/**
 * pi-ssh 的远端 grep/find/ls —— 由 pitayax 安装，请勿手工改动。
 *
 * pi-ssh 只替换 read/write/edit/bash，grep/find/ls 仍是 pi 的本机内置工具，
 * 在 --ssh 会话里会读错文件。这里复用 pi 自己的工具工厂，把搜索与列目录
 * 委托给远端 shell；连接参数与 pi-ssh 保持一致（同一个 ControlPath），复用
 * 它已经建立的 SSH 主连接。
 *
 * 未带 --ssh 启动时不注册任何工具，本地会话保持 pi 原样。
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import {
  createFindTool,
  createGrepTool,
  createGrepToolDefinition,
  createLsTool,
  type ExtensionAPI,
  type FindOperations,
  type LsOperations
} from "@earendil-works/pi-coding-agent";

interface Target {
  remote: string;
  port?: number;
  remoteCwd: string;
  remoteHome: string;
}

interface Capture {
  stdout: string;
  stderr: string;
  code: number | null;
}

const SSH_MODE = process.argv.some((arg) => arg === "--ssh" || arg.startsWith("--ssh="));
const MAX_CAPTURE = 5_000_000;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function findRemotePathSeparator(value: string): number {
  const colonIndex = value.lastIndexOf(":");
  if (colonIndex === -1) return -1;
  const remotePath = value.slice(colonIndex + 1).trim();
  if (remotePath.startsWith("/") || remotePath === "~" || remotePath.startsWith("~/")) return colonIndex;
  if (value.indexOf(":") === colonIndex) return colonIndex;
  return -1;
}

function parseSshFlag(raw: string): { remote: string; remotePath?: string } {
  const value = raw.trim();
  if (!value) throw new Error("--ssh requires a value like user@host or user@host:/remote/path");
  const colonIndex = findRemotePathSeparator(value);
  if (colonIndex === -1) return { remote: value };
  const remote = value.slice(0, colonIndex).trim();
  const remotePath = value.slice(colonIndex + 1).trim();
  if (!remote) throw new Error("Invalid --ssh value: missing remote host");
  if (!remotePath) throw new Error("Invalid --ssh value: empty remote path");
  return { remote, remotePath };
}

function parseSshPort(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid SSH port: ${value}`);
  }
  return parsed;
}

// 和 pi-ssh 用同一组选项（含 ControlPath），才能复用它已建立的连接。
function sshBaseArgs(port: number | undefined): string[] {
  const args: string[] = [];
  if (port !== undefined) args.push("-p", String(port));
  args.push("-o", "ControlMaster=auto", "-o", "ControlPersist=600", "-o", "ControlPath=/tmp/pi-ssh-%C");
  return args;
}

function sshRun(command: string, target: Target, signal?: AbortSignal, timeoutMs = 120_000): Promise<Capture> {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [...sshBaseArgs(target.port), target.remote, command], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => child.kill();
    const timer = setTimeout(() => child.kill(), timeoutMs);

    if (signal) {
      if (signal.aborted) {
        child.kill();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_CAPTURE) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8192) stderr += chunk.toString();
    });
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      cleanup();
      resolve({ stdout, stderr, code });
    });
  });
}

function cdCommand(remotePath: string | undefined): string {
  if (!remotePath || remotePath === "~") return 'cd -- "$HOME"';
  if (remotePath.startsWith("~/")) return `cd -- "$HOME"/${shellQuote(remotePath.slice(2))}`;
  return `cd -- ${shellQuote(remotePath)}`;
}

export default function remoteTools(pi: ExtensionAPI): void {
  if (!SSH_MODE) return;

  const localCwd = process.cwd();
  const localHome = homedir();
  let target: Target | null = null;
  let connecting: Promise<Target | null> | null = null;
  const dirCache = new Map<string, boolean>();

  const localGrep = createGrepTool(localCwd);
  const localFind = createFindTool(localCwd);
  const localLs = createLsTool(localCwd);

  function toRemote(localPath: string): string {
    if (!target) return localPath;
    if (localPath === localCwd) return target.remoteCwd;
    if (localPath.startsWith(`${localCwd}/`)) return `${target.remoteCwd}${localPath.slice(localCwd.length)}`;
    if (localPath === localHome) return target.remoteHome;
    if (localPath.startsWith(`${localHome}/`)) return `${target.remoteHome}${localPath.slice(localHome.length)}`;
    return localPath;
  }

  async function connect(): Promise<Target | null> {
    try {
      const flag = pi.getFlag("ssh") as string | undefined;
      if (!flag) return null;
      const rawPort = (pi.getFlag("p") as string | undefined) ?? (pi.getFlag("ssh-port") as string | undefined);
      const { remote, remotePath } = parseSshFlag(flag);
      const port = parseSshPort(rawPort);
      const command = `${cdCommand(remotePath)} && printf '%s\\n%s\\n' "$PWD" "$HOME"`;
      const probe: Target = { remote, port, remoteCwd: "", remoteHome: "" };
      const result = await sshRun(command, probe, undefined, 30_000);
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || `ssh exited with ${result.code}`);
      }
      const [remoteCwd, remoteHome] = result.stdout.trimEnd().split("\n");
      if (!remoteCwd || !remoteHome) {
        throw new Error("ssh did not report a remote cwd/home");
      }
      return { remote, port, remoteCwd, remoteHome };
    } catch (error) {
      console.error(`pitaya remote-tools: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  function ensureTarget(): Promise<Target | null> {
    if (!connecting) {
      connecting = connect().then((resolved) => {
        target = resolved;
        return resolved;
      });
    }
    return connecting;
  }

  const findOperations: FindOperations = {
    async exists(localPath) {
      const result = await sshRun(`test -e ${shellQuote(toRemote(localPath))}`, target!);
      return result.code === 0;
    },
    async glob(pattern, localSearchPath, { ignore, limit }) {
      const dir = toRemote(localSearchPath);
      const excludes = ignore.map((glob) => `--glob ${shellQuote(`!${glob}`)}`).join(" ");
      const basename = pattern.split("/").pop() || pattern;
      const command = [
        `cd ${shellQuote(dir)} 2>/dev/null || exit 1`,
        `if command -v rg >/dev/null 2>&1; then rg --files --hidden --glob ${shellQuote(pattern)} ${excludes} . | head -n ${limit}`,
        `elif command -v fd >/dev/null 2>&1; then fd --hidden --glob ${shellQuote(pattern)} . | head -n ${limit}`,
        `else find . -type f -name ${shellQuote(basename)} | head -n ${limit}`,
        "fi"
      ].join("; ");
      const result = await sshRun(command, target!);
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || `find failed with ${result.code}`);
      }
      return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    }
  };

  const lsOperations: LsOperations = {
    async exists(localPath) {
      const result = await sshRun(`test -e ${shellQuote(toRemote(localPath))}`, target!);
      return result.code === 0;
    },
    async stat(localPath) {
      const remotePath = toRemote(localPath);
      const cached = dirCache.get(remotePath);
      if (cached !== undefined) {
        return { isDirectory: () => cached };
      }
      const result = await sshRun(`test -d ${shellQuote(remotePath)}`, target!);
      return { isDirectory: () => result.code === 0 };
    },
    async readdir(localPath) {
      const remotePath = toRemote(localPath);
      const result = await sshRun(`LC_ALL=C ls -1Ap -- ${shellQuote(remotePath)}`, target!);
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || `cannot read ${remotePath}`);
      }
      return result.stdout
        .split("\n")
        .filter(Boolean)
        .map((entry) => {
          const isDirectory = entry.endsWith("/");
          const name = isDirectory ? entry.slice(0, -1) : entry;
          dirCache.set(`${remotePath}/${name}`, isDirectory);
          return name;
        });
    }
  };

  const remoteFind = createFindTool(localCwd, { operations: findOperations });
  const remoteLs = createLsTool(localCwd, { operations: lsOperations });
  const grepDefinition = createGrepToolDefinition(localCwd);

  pi.registerTool({
    ...localFind,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!(await ensureTarget())) return localFind.execute(id, params, signal, onUpdate, ctx);
      return remoteFind.execute(id, params, signal, onUpdate, ctx);
    }
  });

  pi.registerTool({
    ...localLs,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!(await ensureTarget())) return localLs.execute(id, params, signal, onUpdate, ctx);
      return remoteLs.execute(id, params, signal, onUpdate, ctx);
    }
  });

  pi.registerTool({
    ...grepDefinition,
    async execute(id, params, signal, _onUpdate, ctx) {
      if (!(await ensureTarget())) return localGrep.execute(id, params, signal, _onUpdate, ctx);
      const searchPath = toRemote(path.resolve(ctx?.cwd ?? localCwd, params.path ?? "."));
      const limit = Math.max(1, params.limit ?? 100);
      const contextFlag = params.context && params.context > 0 ? `-C ${params.context}` : "";
      const rgArgs = [
        "--line-number",
        "--no-heading",
        "--color=never",
        "--hidden",
        "--glob",
        shellQuote("!**/.git/**"),
        params.ignoreCase ? "--ignore-case" : "",
        params.literal ? "--fixed-strings" : "",
        params.glob ? `--glob ${shellQuote(params.glob)}` : "",
        contextFlag,
        "--",
        shellQuote(params.pattern),
        shellQuote(searchPath)
      ].filter(Boolean).join(" ");
      const grepArgs = [
        "-r",
        "-n",
        "-I",
        "--color=never",
        params.ignoreCase ? "-i" : "",
        params.literal ? "-F" : "-E",
        params.glob ? `--include=${shellQuote(params.glob)}` : "",
        contextFlag,
        "-e",
        shellQuote(params.pattern),
        shellQuote(searchPath)
      ].filter(Boolean).join(" ");
      const command = `if command -v rg >/dev/null 2>&1; then rg ${rgArgs} | head -n ${limit}; else grep ${grepArgs} 2>/dev/null | head -n ${limit}; fi`;
      const result = await sshRun(command, target!, signal);
      const text = result.stdout.trim();
      if (!text) {
        const failed = result.code !== null && result.code > 1;
        return {
          content: [{ type: "text", text: failed ? (result.stderr.trim() || `grep failed with ${result.code}`) : "No matches found" }],
          ...(failed ? { isError: true } : {})
        };
      }
      return { content: [{ type: "text", text }], details: undefined };
    }
  });

  pi.on("session_start", () => {
    void ensureTarget();
  });

  pi.on("session_shutdown", () => {
    target = null;
    connecting = null;
    dirCache.clear();
  });
}
