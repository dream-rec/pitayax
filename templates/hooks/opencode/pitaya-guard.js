import fs from 'node:fs';
import path from 'node:path';

const mutatingTools = new Set(['Write', 'Edit', 'MultiEdit', 'Delete', 'apply_patch', 'shell']);
const mutatingShell = /\b(rm|mv|cp|mkdir|touch|npm\s+install|pnpm\s+add|yarn\s+add|bun\s+add|git\s+commit|git\s+push)\b/;

export default function pitayaGuard() {
  return {
    name: 'pitaya-guard',
    async 'tool.execute.before'(input) {
      // 逃生舱：PITAYA_MODE=advisory 时跳过 strict 检查。
      if (process.env.PITAYA_MODE?.toLowerCase() === 'advisory') {
        return;
      }

      const toolName = input?.tool || input?.tool_name || '';
      const toolInput = input?.input || input?.tool_input || {};
      const cwd = input?.cwd || process.cwd();
      const root = findRoot(cwd);
      const command = typeof toolInput.command === 'string' ? toolInput.command : '';
      const isMutating = mutatingTools.has(toolName) || ((toolName === 'Shell' || toolName === 'Bash') && mutatingShell.test(command));

      if (!isMutating) {
        return;
      }

      const tasks = activeTasks(root);
      if (tasks.length === 0) {
        throw new Error('pitaya strict: mutating actions require an active Trellis task. Create or start a Trellis task first, or switch pitaya to advisory mode (PITAYA_MODE=advisory).');
      }

      // 规划产物始终允许，便于在 planning 阶段编写 prd/design 等。
      if (isPlanningArtifact(root, toolInput)) {
        return;
      }

      // 若存在已确认的 in_progress 任务，允许实现操作，不被其它 stale planning 任务阻塞。
      const hasConfirmedInProgress = tasks.some(({ taskDir, task }) => task.status === 'in_progress' && isPrdConfirmed(taskDir));
      if (hasConfirmedInProgress) {
        return;
      }

      const hasAnyInProgress = tasks.some(({ task }) => task.status === 'in_progress');
      if (hasAnyInProgress) {
        return;
      }

      // 剩余情况：所有活跃任务都是 planning。若任一未确认 PRD，则阻塞实现。
      const hasUnconfirmedPlanning = tasks.some(({ taskDir, task }) => task.status === 'planning' && !isPrdConfirmed(taskDir));
      if (hasUnconfirmedPlanning) {
        throw new Error('pitaya strict: implementation is blocked while all active tasks are in planning and at least one PRD is not confirmed. Continue grill-me PRD clarification first. Planning artifacts under .trellis/tasks/** are allowed.');
      }
    }
  };
}

function findRoot(cwd) {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, '.trellis'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd);
    }
    current = parent;
  }
}

function activeTasks(root) {
  const tasksDir = path.join(root, '.trellis', 'tasks');
  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  return fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const taskDir = path.join(tasksDir, entry.name);
      const taskJson = path.join(taskDir, 'task.json');
      if (!fs.existsSync(taskJson)) {
        return undefined;
      }
      try {
        const task = JSON.parse(fs.readFileSync(taskJson, 'utf8'));
        return { taskDir, task };
      } catch {
        return undefined;
      }
    })
    .filter(Boolean)
    .filter(({ task }) => task.status === 'planning' || task.status === 'in_progress');
}

function isPrdConfirmed(taskDir) {
  const prd = path.join(taskDir, 'prd.md');
  if (!fs.existsSync(prd)) {
    return false;
  }
  const text = fs.readFileSync(prd, 'utf8').toLowerCase();
  return ['prd confirmed', 'confirmed: true', 'status: confirmed', '用户已确认', '已确认'].some((marker) => text.includes(marker));
}

function isPlanningArtifact(root, toolInput) {
  const candidate = toolInput?.path || toolInput?.file_path || toolInput?.target_file || '';
  if (!candidate) {
    return false;
  }

  let relative;
  try {
    const rootResolved = fs.realpathSync(root);
    const filePath = path.isAbsolute(candidate) ? candidate : path.resolve(rootResolved, candidate);
    relative = path.relative(rootResolved, fs.realpathSync(filePath)).split(path.sep).join('/');
  } catch {
    return false;
  }

  if (!relative.startsWith('.trellis/tasks/')) {
    return false;
  }

  const name = path.basename(relative);
  return ['prd.md', 'design.md', 'implement.md', 'implement.jsonl', 'check.jsonl'].includes(name) || relative.includes('/research/');
}
