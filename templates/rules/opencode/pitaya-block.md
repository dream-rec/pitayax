<!-- PITAYA:START -->
# Pitaya Entry

For every software engineering request in this project, use the Pitaya profile on top of Trellis by default. The user does not need to mention Trellis or pitaya.

## Default Routing

- First classify the request using Trellis task classification.
- For conversation-only or tiny inline work, ask whether a Trellis task is needed only if durable tracking would help.
- For feature work, bug fixes with uncertainty, refactors, architecture decisions, multi-file changes, or unclear requests, create/use a Trellis planning task before implementation.

## PRD First, Grill-Me Style

During planning, do not start by drafting and writing a speculative PRD. Use `pitaya-grill-prd` behavior first: inspect available context, ask exactly one high-value question at a time, provide 2-3 options and a recommended answer, then update `prd.md` after the user answers.

Before requesting PRD confirmation, verify technical assumptions against latest knowledge using `grok-search-mcp` (`web_search`, `web_fetch`). Record results in the `## Knowledge Verification` section of `prd.md`. Correct any outdated assumptions. Add `knowledge verified` to the PRD after verification is complete.

Do not start implementation until the active Trellis task has a confirmed PRD. Planning artifacts such as `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, `check.jsonl`, and `research/**` are allowed during planning.

## MCP Policy

- Use `fast-context-mcp` for codebase semantic context.
- Use `grok-search-mcp` for external docs, live web information, and webpage fetch.
- If a preferred MCP is unavailable, state the fallback reason before using another tool.

## Accuracy Policy

- Do not guess or fabricate facts, APIs, package behavior, release status, or external documentation when the answer is not already known from model knowledge or project context.
- When current or missing knowledge is required, actively use the preferred web search/fetch MCP tools, or ask the user for authoritative information.
- Continue searching or asking until the information is accurate enough to proceed safely.

## Language Policy

- Write README and project documentation in Chinese.
- Write code comments in Chinese when comments are necessary.
- Avoid obvious comments; only explain non-obvious intent, constraints, or trade-offs.

## Naming Policy

- Prefer concise file names.
- Use one word when one word clearly describes the purpose, such as `pipeline`.
- When multiple words are necessary, use lowercase snake_case, such as `paper_extract`.
<!-- PITAYA:END -->
