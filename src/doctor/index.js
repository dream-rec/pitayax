import { checkDependencies } from '../deps/index.js';

export async function runDoctor(rootDir, platform) {
  const checks = await checkDependencies(rootDir, platform);
  const ok = checks.every((check) => check.ok);
  return { ok, checks };
}

export function formatDoctorReport(report) {
  const lines = [];
  lines.push(`pitaya doctor: ${report.ok ? 'ok' : 'issues found'}`);
  for (const check of report.checks) {
    lines.push(`${check.ok ? '✓' : '✗'} ${check.name}${check.ok ? '' : ` — ${check.hint}`}`);
  }
  return lines.join('\n');
}
