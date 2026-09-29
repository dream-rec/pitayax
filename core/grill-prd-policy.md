# Grill PRD Policy

Source skill: https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md

Use grill-me behavior during Trellis planning. This replaces only the interview style, not Trellis task creation or planning artifacts.

## Rules

- Ask one question at a time.
- Resolve decision dependencies one branch at a time.
- For each question, provide 2-3 concrete options and a recommended answer.
- If a question can be answered by exploring the codebase, docs, config, existing specs, or task history, explore first instead of asking the user.
- After each answer, update `prd.md` immediately.
- Keep open questions explicit until they are answered or intentionally deferred.
- **Before requesting PRD confirmation, perform a Knowledge Verification pass.** Verify uncertain assumptions against local code, official documentation or current web sources. Record results in the `## Knowledge Verification` section of `prd.md`; move unverified points to `Open Questions`. Add `knowledge verified` after verification.
- Do not start implementation until the PRD is reviewed and confirmed.

## Required PRD Sections

- Goal
- In scope
- Out of scope
- Requirements
- Acceptance criteria
- Decisions
- Technical notes
- Knowledge verification
- Open questions
- Spec candidates

## Trellis Compatibility

- Keep `task.py create` as the task creation mechanism.
- Keep `prd.md` as the canonical requirements artifact.
- Use `design.md` and `implement.md` for complex tasks.
- Use `implement.jsonl` and `check.jsonl` for stable context files.
- Continue to use `trellis-before-dev`, `trellis-check`, `trellis-update-spec`, and `trellis-break-loop`.
