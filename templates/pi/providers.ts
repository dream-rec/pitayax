/**
 * pi-provider-manager 单入口转发 —— 由 pitaya 安装，请勿手工改动。
 *
 * 0.3.9 的发布包没有 package.json 的 `pi` 字段，pi 于是按约定扫描包内
 * extensions/ 目录，把 6 个子模块当成 6 个独立扩展分别加载。每个子模块
 * 拿到的 ExtensionAPI 实例互不相同，pi.events 无法互通，面板保存配置后
 * 触发不了轮询引擎热重载。
 *
 * 配套修复在 settings.json：该包的条目写成 { source, extensions: [] }，
 * 关掉包内的约定扫描；真正的加载由本文件单点完成。
 * 补丁写在包外，npm install / pi update 覆盖不掉。
 */
export { default } from "../npm/node_modules/@arcaneorion/pi-provider-manager/index.ts";
