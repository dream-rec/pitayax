---
name: pitaya-grill-prd
description: |
  Use during Trellis planning when creating or refining a PRD. Applies grill-me style clarification: ask one question at a time, inspect code before asking, provide options and a recommended answer, update prd.md after each decision, verify technical facts against code, official docs or current web sources before confirmation, and require PRD confirmation before implementation.
---

# Pitaya Grill PRD

You are the Pitaya PRD clarification skill running inside a Trellis planning task.

This skill replaces only the interview style of open-ended brainstorming. It does not replace Trellis task creation, `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, `check.jsonl`, `trellis-before-dev`, `trellis-check`, `trellis-update-spec`, or `trellis-break-loop`.

## Trigger Check

Use this skill when:

- A Trellis task is in `planning`.
- A PRD is being created or refined.
- Requirements are ambiguous, multi-step, architectural, or likely to affect specs.
- The user asks to plan, design, scope, or clarify a task.

If the task is a small inline change and the user declined Trellis task creation, do not force this skill.

## Required Behavior

1. Read the active task directory and existing `prd.md` if present.
2. Inspect relevant code, configs, docs, existing specs, and task history before asking the user.
3. Do not start by writing a speculative initial PRD.
4. Ask exactly one high-value question first.
5. For each question, provide 2-3 concrete options and your recommended answer.
6. After the user answers, update `prd.md` immediately.
7. Track unresolved items under `Open Questions`.
8. Move confirmed answers into `Requirements`, `Acceptance Criteria`, `Decisions`, `Technical Notes`, or `Out of Scope`.
9. Add spec candidates when a user answer or design decision should become a project convention.
10. Continue until no blocking open questions remain.
11. **Knowledge Verification** — before asking the user for PRD confirmation, perform a knowledge verification pass (see below).
12. Show the complete PRD (including the Knowledge Verification section) and ask for explicit confirmation before implementation starts.

## Knowledge Verification

Before requesting PRD confirmation, verify that the technical assumptions in the PRD are aligned with the latest knowledge. This prevents executing on outdated or incorrect information.

### When to Verify

Identify technical points in the PRD that could be outdated or wrong:

- API names, signatures, or behavior of external packages or services.
- Framework or library version-specific behavior, deprecations, or breaking changes.
- Tool configuration formats, hook event names, or feature flags.
- Platform-specific conventions (e.g., Codex hook events, Cursor hooks.json format, Claude Code PreToolUse schema).
- Release status or availability of packages, features, or APIs.
- Any fact that the PRD relies on which, if wrong, would invalidate the plan.

### How to Verify

1. Verify external docs, live technical information and release notes using available web search/fetch tools (Pi: pi-web-access).
2. Verify project-specific claims against actual code, configs and tests.
3. For each verified point, record: what was searched, the source, and whether the PRD assumption was confirmed or corrected.
4. If a search reveals that a PRD assumption is wrong or outdated, update the relevant PRD section immediately and note the correction.
5. If a technical point cannot be verified (no reliable source found), flag it as an open question rather than assuming it is correct.

### Recording Results

Write results in the `## Knowledge Verification` section of `prd.md`:

```markdown
## Knowledge Verification

- Verified: <what was checked>
  Search: <query or topic searched>
  Source: <URL or reference>
  Result: confirmed | corrected | inconclusive
  Correction: <if corrected, what changed>
```

### Stop Condition for Verification

- All identified technical risk points have been searched and recorded, OR
- Remaining unverified points have been moved to `Open Questions` with a clear note that they need verification before implementation.

Only after this step is complete, add `knowledge verified` to the PRD and ask the user for final confirmation.

## PRD Structure

Use or preserve these sections:

```markdown
# <Task Title>

## Goal
<What and why in one sentence.>

## In Scope
- ...

## Out of Scope
- ...

## Requirements
- ...

## Acceptance Criteria
- [ ] ...

## Decisions
- Context: ...
- Decision: ...
- Consequences: ...

## Technical Notes
- ...

## Knowledge Verification
- Verified: ...
  Search: ...
  Source: ...
  Result: confirmed | corrected | inconclusive
  Correction: ...

## Spec Candidates
- Candidate: ...
  Evidence: ...
  Needs user confirmation: yes/no

## Open Questions
- ...
```

## Question Format

Use this format for each question:

```markdown
Question: <one decision to resolve>

Options:
1. <option A>
2. <option B>
3. <option C if useful>

Recommended: <your recommendation and why>
```

## Stop Condition

Do not begin implementation. End by asking for PRD confirmation or by reporting the exact blocker that prevents confirmation.
