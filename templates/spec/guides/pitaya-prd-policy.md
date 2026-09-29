# Pitaya PRD Policy

This project uses `pitaya` on top of Trellis.

## Policy

- Keep Trellis task lifecycle and artifacts.
- Use grill-me style clarification during PRD creation and refinement.
- Do not start planning by writing a speculative initial PRD.
- Ask one high-value question first.
- Provide 2-3 options and a recommended answer for each question.
- Inspect code, docs, config, existing specs, and task history before asking the user.
- Update `prd.md` only after each confirmed answer, confirmed existing fact, or explicit decision.
- Treat task creation consent and implementation approval as separate gates.
- **Before PRD confirmation, verify uncertain technical assumptions against local code, official documentation or current web sources.** Record results in `## Knowledge Verification` in `prd.md`. Correct outdated assumptions and move unverified points to `Open Questions`. Add `knowledge verified` after verification.
- Do not start implementation until the PRD is confirmed.
- Write README and project documentation in Chinese.
- Write code comments in Chinese when comments are necessary, and avoid obvious comments.
- Prefer concise file names: one word when clear, or lowercase snake_case for necessary multi-word names.

## Knowledge Verification

Before requesting PRD confirmation, identify technical risk points that could be outdated or wrong, and verify them with code, official docs or current web sources:

- API names, signatures, behavior of external packages or services.
- Framework or library version-specific behavior, deprecations, or breaking changes.
- Tool configuration formats, hook event names, or feature flags.
- Platform-specific conventions (e.g., Codex hook events, Cursor hooks.json format, Claude Code PreToolUse schema).
- Release status or availability of packages, features, or APIs.

Record each verification in `prd.md` under `## Knowledge Verification`. Add `knowledge verified` to the PRD after all risk points have been verified or moved to `Open Questions`.

## Initial Spec Candidates

During bootstrap or planning, spec candidates may come from:

- User answers.
- PRD decisions.
- Design decisions.
- Verified codebase facts.
- Knowledge verification results (confirmed or corrected).
- Existing tests, configs, docs, and conventions.

Initial spec candidates require user review before they become stable project conventions.
