import { basename } from "node:path";

import { remotePathFromStatuses } from "./remote-cwd.js";
import { defineWidget } from "../types.js";

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
    // --ssh 会话里 pi-ssh 会把远端路径写进状态，本地 cwd 仍是本机目录。
    // 状态行显示远端路径，本地会话没有这个状态时继续显示本机目录名。
    const remote = remotePathFromStatuses(ctx.getExtensionStatuses?.());
    return renderWidget(remote ?? basename(ctx.cwd));
  },
});
