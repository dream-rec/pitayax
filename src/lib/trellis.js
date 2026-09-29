import path from 'node:path';
import process from 'node:process';
import { appendBlockOnce, pathExists, readTextIfExists, writeTextFile } from './files.js';
import { runCommand, commandExists } from './runtime.js';
import { trellisPlatformFlag } from './platforms.js';

const PITAYA_MARKER = '<!-- pitaya:profile:v1 -->';
const PITAYA_END_MARKER = '<!-- /pitaya:profile:v1 -->';
// 旧版 dream-wf 写入的 profile 区块，更新时原位替换，避免 workflow.md 里出现两份 profile。
const LEGACY_PROFILE_MARKERS = ['<!-- dream-wf:profile:v1 -->', '<!-- /dream-wf:profile:v1 -->'];

function writeOutput(message) {
  process.stdout.write(`${message}\n`);
}

export async function detectTrellis(rootDir) {
  const trellisDir = path.join(rootDir, '.trellis');
  const workflowPath = path.join(trellisDir, 'workflow.md');
  const scriptsDir = path.join(trellisDir, 'scripts');

  return {
    trellisDir,
    workflowPath,
    exists: await pathExists(trellisDir),
    hasWorkflow: await pathExists(workflowPath),
    hasScripts: await pathExists(scriptsDir),
    cli: commandExists('trellis')
  };
}

export async function ensureTrellisInitialized(rootDir, options) {
  const state = await detectTrellis(rootDir);
  if (state.exists) {
    return { ...state, initialized: true, initCommand: undefined };
  }

  const platformFlag = trellisPlatformFlag(options.platform);
  const initCommand = `trellis init -u ${options.developer ?? '<your-name>'} ${platformFlag} --yes`;

  if (!options.installDeps) {
    return { ...state, initialized: false, initCommand };
  }

  if (!options.developer) {
    throw new Error('Pass --developer <name> when using --install-deps so pitaya can run trellis init non-interactively.');
  }

  // trellis CLI 未安装时，先 npm install -g。
  if (!state.cli) {
    writeOutput('Installing @mindfoldhq/trellis globally...');
    runCommand('npm', ['install', '-g', '@mindfoldhq/trellis@latest']);

    // 重新检测。
    state.cli = commandExists('trellis');
    if (!state.cli) {
      throw new Error('trellis CLI still not found after npm install. Check your PATH.');
    }
  }

  runCommand('trellis', ['init', '-u', options.developer, platformFlag, '--yes'], { cwd: rootDir });

  return { ...(await detectTrellis(rootDir)), initialized: true, initCommand };
}

export async function installTrellisProfile(rootDir) {
  const workflowPath = path.join(rootDir, '.trellis', 'workflow.md');
  const existing = await readTextIfExists(workflowPath);
  if (!existing) {
    return {
      changed: false,
      action: 'skipped',
      path: workflowPath,
      reason: '.trellis/workflow.md not found. Run trellis init first.'
    };
  }

  const [legacyStart, legacyEnd] = LEGACY_PROFILE_MARKERS;
  const block = pitayaWorkflowBlock();
  const markerPair = existing.includes(PITAYA_MARKER)
    ? [PITAYA_MARKER, PITAYA_END_MARKER]
    : [legacyStart, legacyEnd];
  const start = existing.indexOf(markerPair[0]);
  const end = existing.indexOf(markerPair[1]);
  if (start !== -1 || end !== -1) {
    if (start === -1 || end <= start) throw new Error(`Trellis profile markers incomplete in ${workflowPath}`);
    const next = `${existing.slice(0, start)}${block}${existing.slice(end + markerPair[1].length)}`;
    if (next === existing) return { changed: false, action: 'unchanged', path: workflowPath };
    await writeTextFile(workflowPath, next);
    return { changed: true, action: 'updated', path: workflowPath };
  }

  return appendBlockOnce(workflowPath, PITAYA_MARKER, block);
}

export async function writeSpecPolicy(rootDir, name, contents) {
  return writeTextFile(path.join(rootDir, '.trellis', 'spec', 'guides', name), contents);
}

function pitayaWorkflowBlock() {
  return [
    PITAYA_MARKER,
    '',
    '## Pitaya Profile',
    '',
    'This repository uses `pitaya` as a Trellis custom patch profile. Trellis remains the source of truth for task lifecycle, specs, workflow state, before-dev, check, update-spec, break-loop, sub-agent context injection, and finish-work.',
    '',
    '### Pitaya Planning Override',
    '',
    'When a request enters Trellis planning, keep the native Trellis task artifacts and lifecycle, but use the `pitaya-grill-prd` skill as the PRD clarification method before implementation.',
    '',
    'Rules:',
    '',
    '- Keep Trellis task creation, `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, and `check.jsonl`.',
    '- Do not use Trellis brainstorm as an open-ended interview style when `pitaya-grill-prd` is available.',
    '- Do not start planning by writing a speculative initial PRD. First inspect available context, then ask the first grill-me question.',
    '- Use grill-me behavior for requirement discovery: ask one question at a time, provide 2-3 options and a recommended answer, and inspect code/docs/config before asking the user.',
    '- Update `prd.md` only after a user answer, confirmed existing fact, or explicit decision is available.',
    '- Treat PRD confirmation as separate from task creation consent.',
    '- **Before requesting PRD confirmation, perform a Knowledge Verification pass.** Verify uncertain technical assumptions against local code, official documentation or current web sources. Record results in `## Knowledge Verification`; move unverified points to `Open Questions`. Add `knowledge verified` after verification.',
    '- Generate initial spec candidates from user answers, PRD decisions, and verified project/code facts; require user review before treating them as stable conventions.',
    '- Do not guess or fabricate unknown facts, APIs, package behavior, release status, or external documentation; search with available code/web tools or ask the user.',
    '- Write README and project documentation in Chinese. Write code comments in Chinese when comments are necessary, and avoid obvious comments.',
    '- Prefer concise file names: use one word when clear, or lowercase snake_case for necessary multi-word names.',
    '- Continue using `trellis-before-dev`, `trellis-check`, `trellis-update-spec`, and `trellis-break-loop` without replacing them.',
    '',
    '### Pitaya Tool Policy',
    '',
    'Before searching, classify the need:',
    '',
    '- Codebase semantic understanding: use available indexed code search / structural navigation tools (Pi: AFT).',
    '- Exact known symbols or files: use exact search or direct reads.',
    '- External docs and live information: use available web search/fetch tools (Pi: pi-web-access).',
    '- Verify sources before treating assumptions as fact.',
    '',
    'Read `.trellis/spec/guides/pitaya-prd-policy.md` when planning or starting implementation.',
    '',
    PITAYA_END_MARKER
  ].join('\n');
}
