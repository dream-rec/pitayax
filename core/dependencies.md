# Dependencies

`pitaya` expects Trellis plus two MCP servers and the grill-me skill behavior.

## Trellis

Source: https://github.com/mindfold-ai/trellis

```bash
npm install -g @mindfoldhq/trellis@latest
```

Initialize per platform:

```bash
trellis init -u your-name --cursor
trellis init -u your-name --claude
trellis init -u your-name --opencode
```

## Grill Me

Source: https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md

`pitaya` vendors the behavior as `pitaya-grill-prd` rather than depending on a global skill installer.

## Fast Context MCP

Source: https://github.com/SammySnake-d/fast-context-mcp

```bash
npm install @sammysnake/fast-context-mcp
```

Example MCP server config:

```json
{
  "command": "npx",
  "args": [
    "-y",
    "--prefer-online",
    "fast-context-mcp@latest"
  ],
  "env": {
    "WINDSURF_API_KEY": "devin-session-xx"
  }
}
```

## Grok Search MCP

Source: https://github.com/GuDaStudio/GrokSearch

Requires Python 3.10+ and `uv`/`uvx`.

Example MCP server config with placeholders only:

```json
{
  "grok-search": {
    "type": "stdio",
    "command": "uvx",
    "args": [
      "--from",
      "git+https://github.com/GuDaStudio/GrokSearch@grok-with-tavily",
      "grok-search"
    ],
    "env": {
      "GROK_API_URL": "https://your-api-endpoint.com/v1",
      "GROK_API_KEY": "your-grok-api-key",
      "TAVILY_API_KEY": "optional-tavily-key",
      "GROK_MODEL":"your-model-name"
    }
  }
}
```

Do not commit real MCP API keys into project files.
