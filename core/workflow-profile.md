# Pitaya Profile

`pitaya` is a personal custom patch profile for Trellis. It does not replace Trellis. It installs small, project-level preferences on top of Trellis so Cursor, Claude Code, and OpenCode follow the same workflow.

## Positioning

- Trellis owns task lifecycle, workflow-state injection, specs, task artifacts, context manifests, sub-agent context injection, checks, spec updates, and finish-work.
- `pitaya` owns preference patches: grill-me style PRD clarification, dependency checks, and strict guardrails.
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
- **Before PRD confirmation, verify uncertain technical assumptions against local code, official documentation or current web sources.** Record results in the `## Knowledge Verification` section of `prd.md`. Correct outdated assumptions and move unverified points to `Open Questions`. Add `knowledge verified` after verification.
- Generate initial spec candidates from user answers, PRD decisions, and verified project facts.
- Use available indexed code search and structural navigation tools for codebase understanding (Pi: AFT).
- Use available web search/fetch tools for external docs and live information (Pi: pi-web-access).
- Use strict guardrails to prevent implementation before active task and PRD readiness.
