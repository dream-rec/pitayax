---
name: pitaya-mcp-policy
description: |
  Use before codebase exploration, external documentation lookup, live web research, or webpage fetching. Enforces Pitaya MCP priority: fast-context-mcp for semantic code context and grok-search-mcp for external web/docs/fetch tasks.
---

# Pitaya MCP Policy

Classify the information need before choosing a search or fetch tool.

## Codebase Semantic Context

Use `fast-context-mcp` first when the request needs semantic codebase understanding.

Preferred tool:

- `fast_context_search`

Use for:

- Finding where behavior lives.
- Tracing architecture or cross-file flows.
- Discovering relevant files from natural language.
- Planning implementation or PRD context collection.

Fallback:

- Use exact search only for known symbols, strings, paths, or narrow scoped patterns.
- If `fast-context-mcp` is unavailable, state the fallback reason before using another tool.

## External Docs and Web Information

Use `grok-search-mcp` first for external documentation, live technical information, webpage fetch, and source discovery.

Preferred tools:

- `web_search`
- `web_fetch`
- `web_map`
- `get_sources`

Fallback:

- Use built-in web tools only if `grok-search-mcp` is unavailable or insufficient.
- State the fallback reason before using another web tool.

## Strict Mode

In strict mode, do not silently bypass the preferred MCP. If the preferred tool is missing, say so and proceed with the narrowest fallback that can answer the question.

## Security

Never write API keys, tokens, or MCP secrets into tracked project files. Use environment variables, user-level MCP config, or secret managers.
