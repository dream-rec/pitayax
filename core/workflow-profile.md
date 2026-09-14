# Pitaya Profile

`pitaya` is a personal custom patch profile for Trellis. It does not replace Trellis. It installs small, project-level preferences on top of Trellis so Cursor, Claude Code, and OpenCode follow the same workflow.

## Positioning

- Trellis owns task lifecycle, workflow-state injection, specs, task artifacts, context manifests, sub-agent context injection, checks, spec updates, and finish-work.
- `pitaya` owns preference patches: grill-me style PRD clarification, MCP tool priority, dependency checks, and strict guardrails.
- Project files remain the source of truth. Do not rely on chat memory for requirements, project conventions, or task state.

## Preserved Trellis Flow

Keep the native Trellis flow:

1. Classify the user request.
2. Ask for Trellis task-creation consent when useful.
3. Create a task and enter `planning`.
4. Write `prd.md` for every task.
5. Write `design.md` and `implement.md` for complex tasks.
6. Curate `implement.jsonl` and `check.jsonl` when stable context manifests are useful.
7. Start the task and enter `in_progress`.
8. Run before-dev context loading, implementation, check, update-spec, and finish-work.

## Pitaya Patch Points

- Use `pitaya-grill-prd` for PRD clarification instead of open-ended brainstorm interviewing.
- **Before PRD confirmation, perform a Knowledge Verification pass**: use `grok-search-mcp` (`web_search`, `web_fetch`) to verify technical assumptions that could be outdated or wrong. Record results in the `## Knowledge Verification` section of `prd.md`. Correct outdated assumptions. Add `knowledge verified` to the PRD after verification is complete.
- Generate initial spec candidates from user answers, PRD decisions, and verified project facts.
- Prefer `fast-context-mcp` for codebase semantic search.
- Prefer `grok-search-mcp` for external docs, live technical information, and webpage fetching.
- Use strict guardrails to prevent implementation before active task and PRD readiness.
