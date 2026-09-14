#!/usr/bin/env python3

import json
import os
import re
import sys
from pathlib import Path

MUTATING_TOOLS = {"Write", "Edit", "MultiEdit", "Delete"}
MUTATING_SHELL = re.compile(r"\b(rm|mv|cp|mkdir|touch|npm\s+install|pnpm\s+add|yarn\s+add|bun\s+add|git\s+commit|git\s+push)\b")


def find_root(cwd):
    current = Path(cwd).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".trellis").exists():
            return candidate
    return current


def active_tasks(root):
    tasks_dir = root / ".trellis" / "tasks"
    if not tasks_dir.exists():
        return []

    result = []
    for task_json in tasks_dir.glob("*/task.json"):
        try:
            data = json.loads(task_json.read_text())
        except Exception:
            continue
        if data.get("status") in {"planning", "in_progress"}:
            result.append((task_json.parent, data))
    return result


def is_prd_confirmed(task_dir):
    prd = task_dir / "prd.md"
    if not prd.exists():
        return False
    text = prd.read_text(errors="ignore").lower()
    markers = ["prd confirmed", "confirmed: true", "status: confirmed", "用户已确认", "已确认"]
    return any(marker in text for marker in markers)


def is_planning_artifact(root, tool_input):
    if not isinstance(tool_input, dict):
        return False

    candidate = tool_input.get("path") or tool_input.get("file_path") or tool_input.get("target_file") or ""
    if not candidate:
        return False

    try:
        root_resolved = root.resolve()
        file_path = Path(candidate)
        if not file_path.is_absolute():
            file_path = (root_resolved / file_path)
        # 规范化符号链接，避免 /tmp vs /private/tmp 导致 relative_to 失败。
        relative = file_path.resolve().relative_to(root_resolved).as_posix()
    except Exception:
        return False

    if not relative.startswith(".trellis/tasks/"):
        return False

    name = Path(relative).name
    return (
        name in {"prd.md", "design.md", "implement.md", "implement.jsonl", "check.jsonl"}
        or "/research/" in relative
    )


def deny(message):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": message
        }
    }))
    sys.exit(0)


def allow():
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow"
        }
    }))
    sys.exit(0)


def main():
    # 逃生舱：PITAYA_MODE=advisory 时跳过 strict 检查。
    if os.environ.get("PITAYA_MODE", "").lower() == "advisory":
        allow()

    try:
        payload = json.load(sys.stdin)
    except Exception:
        allow()

    tool_name = payload.get("tool_name") or payload.get("tool", "")
    tool_input = payload.get("tool_input") or payload.get("input") or {}
    cwd = payload.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    root = find_root(cwd)

    is_mutating = tool_name in MUTATING_TOOLS
    command = tool_input.get("command", "") if isinstance(tool_input, dict) else ""
    if tool_name in {"Shell", "Bash"} and MUTATING_SHELL.search(command):
        is_mutating = True

    if not is_mutating:
        allow()

    tasks = active_tasks(root)
    if not tasks:
        deny("pitaya strict: mutating actions require an active Trellis task. Create or start a Trellis task first, or switch pitaya to advisory mode (PITAYA_MODE=advisory).")

    # 规划产物始终允许，便于在 planning 阶段编写 prd/design 等。
    if is_planning_artifact(root, tool_input):
        allow()

    # 若存在已确认的 in_progress 任务，允许实现操作，不被其它 stale planning 任务阻塞。
    in_progress_confirmed = any(
        task.get("status") == "in_progress" and is_prd_confirmed(task_dir)
        for task_dir, task in tasks
    )
    if in_progress_confirmed:
        allow()

    in_progress_any = any(task.get("status") == "in_progress" for _, task in tasks)
    if in_progress_any:
        allow()

    # 剩余情况：所有活跃任务都是 planning。若任一未确认 PRD，则阻塞实现。
    planning_unconfirmed = [
        task_dir for task_dir, task in tasks
        if task.get("status") == "planning" and not is_prd_confirmed(task_dir)
    ]
    if planning_unconfirmed:
        deny("pitaya strict: implementation is blocked while all active tasks are in planning and at least one PRD is not confirmed. Continue grill-me PRD clarification first. Planning artifacts under .trellis/tasks/** are allowed.")

    allow()


if __name__ == "__main__":
    main()
