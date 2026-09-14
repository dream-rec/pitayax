# MCP Tool Policy

`pitaya` uses MCP tools deliberately. Classify the information need before searching.

## Preferred Tools

### Codebase Semantic Context

Use `fast-context-mcp` first when the task requires semantic understanding of a codebase.

Source: https://github.com/SammySnake-d/fast-context-mcp

Preferred tool:

- `fast_context_search`

Use it for:

- Finding where a behavior is implemented.
- Understanding architecture or cross-file flows.
- Discovering relevant files from a natural-language query.
- Initial context gathering for PRD, design, or implementation planning.

Fallback:

- Use exact search only when looking for known symbols, strings, paths, or small scoped patterns.
- If `fast-context-mcp` is unavailable, say why before falling back.

### External Docs and Live Web Information

Use `grok-search-mcp` first for external docs, live technical information, real-time search, webpage fetch, and source discovery.

Source: https://github.com/GuDaStudio/GrokSearch

Preferred tools:

- `web_search`
- `web_fetch`
- `web_map`
- `get_sources`

Use it for:

- Current documentation.
- API usage and examples.
- Live technology information.
- Fetching webpage content.
- Finding and citing source URLs.

Fallback:

- Use built-in web tools only when `grok-search-mcp` is unavailable or insufficient.
- State the fallback reason before using another web tool.

## Strict Mode Rules

In strict mode:

- Do not start broad code exploration with plain grep when semantic search is available.
- Do not use built-in web search before `grok-search-mcp` for external docs or live information.
- Do not silently degrade when an MCP is unavailable.
- Do not put API keys or MCP secrets into tracked project files.

## Installation References

Fast Context MCP:

```bash
npm install @sammysnake/fast-context-mcp
```

Grok Search MCP requires Python 3.10+ and `uv`/`uvx`. Example MCP command uses placeholders only:

```json
{
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
```
