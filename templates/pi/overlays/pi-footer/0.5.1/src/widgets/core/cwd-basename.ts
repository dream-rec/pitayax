import { basename } from "node:path";

import { defineWidget } from "../types.js";

const SSH_PREFIX = "SSH ";

export const CwdBasenameWidget = defineWidget({
  type: "cwd-basename",
  label: "Working Dir Name",
  category: "Core",
  description: "Current directory name",
  dependencies: ["cwd", "getExtensionStatuses"],
  baseOptions: ["raw", "hideWhenEmpty", "icon", "text"],
  baseOptionDefaults: { text: "" },
  properties: [],
  icons: { emoji: "📂", nerd: "", text: "dir" },
  defaultStyle: { fg: "blue", bg: "default", bold: false },
  render({ ctx, renderWidget }) {
    // --ssh 会话里 pi-ssh 会把远端路径写进 pi-ssh 状态，本地 cwd 仍是本机目录。
    // 状态行显示远端路径，本地会话没有这个状态时继续显示本机目录名。
    const ssh = ctx.getExtensionStatuses?.()?.get("pi-ssh");
    return renderWidget(ssh ? trimSshPrefix(ssh) : basename(ctx.cwd));
  },
});

// 只去掉状态值开头的 "SSH " 前缀，保留前面的 ANSI 颜色序列。
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
