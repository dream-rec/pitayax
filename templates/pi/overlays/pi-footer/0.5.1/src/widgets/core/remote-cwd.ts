// --ssh 会话的远端路径来自 pi-ssh 的状态值。
// 状态形如 "SSH host:/path"（带 ANSI），这里去掉 4 个可见字符的前缀并保留 ANSI，
// 让 footer 沿用 accent 配色。
const SSH_PREFIX = "SSH ";

export function remotePathFromStatuses(
  statuses: ReadonlyMap<string, string> | undefined,
): string | undefined {
  const value = statuses?.get("pi-ssh");
  if (!value) return undefined;
  return trimSshPrefix(value) || undefined;
}

function trimSshPrefix(value: string): string {
  let index = 0;
  let visible = "";
  let prefix = "";

  while (index < value.length && visible.length < SSH_PREFIX.length) {
    const ansi = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(value.slice(index));
    if (ansi) {
      prefix += ansi[0];
      index += ansi[0].length;
      continue;
    }
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const width = codePoint > 0xffff ? 2 : 1;
    visible += value.slice(index, index + width);
    index += width;
  }

  return visible === SSH_PREFIX ? `${prefix}${value.slice(index)}` : value;
}
