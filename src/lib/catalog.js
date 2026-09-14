// 安装聚合器的可选 skill 和 mcp 条目。
// 每个 skill 对应一个模板目录 templates/skills/<name>/，由 shared.installSkill 装入各平台 skills 目录。
// 每个 mcp 对应一个独立 server 配置，由 mcp.installMcpServer 写入各平台 mcp 配置文件。

export const SKILL_CATALOG = [
  {
    id: 'trellis-pitaya-patch',
    name: 'pitaya-grill-prd',
    label: 'pitaya-grill-prd (Trellis patch · grill-me style PRD)',
    description: 'grill-me 风格的 PRD 澄清 skill，pitaya 的核心 patch。',
    templateDir: 'pitaya-grill-prd',
    default: true
  },
  {
    id: 'pitaya-mcp-policy',
    name: 'pitaya-mcp-policy',
    label: 'pitaya-mcp-policy (MCP 优先级策略 skill)',
    description: '强制 fast-context-mcp / grok-search-mcp 优先级的策略 skill。',
    templateDir: 'pitaya-mcp-policy',
    default: true
  }
];

export const MCP_CATALOG = [
  {
    id: 'fast-context',
    name: 'fast-context',
    label: 'fast-context-mcp (代码语义检索)',
    description: '代码库语义理解优先 MCP，来源 SammySnake-d/fast-context-mcp。',
    server: {
      command: 'npx',
      args: ['-y', '--prefer-online', 'fast-context-mcp@latest'],
      env: {
        WINDSURF_API_KEY: 'devin-session-xx'
      }
    },
    default: true,
    requires: {
      binaries: ['npx']
    }
  },
  {
    id: 'grok-search',
    name: 'grok-search',
    label: 'grok-search-mcp (外部文档/实时网络检索)',
    description: '外部文档和实时网络检索优先 MCP，来源 GuDaStudio/GrokSearch。',
    server: {
      type: 'stdio',
      command: 'uvx',
      args: ['--from', 'git+https://github.com/GuDaStudio/GrokSearch@grok-with-tavily', 'grok-search'],
      env: {
        GROK_API_URL: 'https://your-api-endpoint.com/v1',
        GROK_API_KEY: 'your-grok-api-key',
        GROK_MODEL: 'your-model-name',
        TAVILY_API_KEY: 'optional-tavily-key',
        TAVILY_API_URL: 'https://api.tavily.com'
      }
    },
    default: true,
    requires: {
      binaries: ['uvx']
    }
  }
];

export function defaultSkillIds() {
  return SKILL_CATALOG.filter((item) => item.default).map((item) => item.id);
}

export function defaultMcpIds() {
  return MCP_CATALOG.filter((item) => item.default).map((item) => item.id);
}

export function resolveSkills(ids) {
  const set = new Set(ids);
  return SKILL_CATALOG.filter((item) => set.has(item.id));
}

export function resolveMcps(ids) {
  const set = new Set(ids);
  return MCP_CATALOG.filter((item) => set.has(item.id));
}
