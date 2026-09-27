import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

// Pi 的 agent 目录。PI_CODING_AGENT_DIR 是 pi 自身认的环境变量，
// 隔离测试时覆盖它即可，不会动到真实的 ~/.pi。
export function piAgentDir(options = {}) {
  const env = options.env ?? process.env;
  const home = env.USERPROFILE ?? env.HOME ?? options.homeDir ?? os.homedir();
  if (env.PI_CODING_AGENT_DIR) {
    return env.PI_CODING_AGENT_DIR;
  }
  if (env.PI_CODING_AGENT_HOME) {
    return env.PI_CODING_AGENT_HOME;
  }
  return path.join(home, '.pi', 'agent');
}

export function piSettingsPath(agentDir = piAgentDir()) {
  return path.join(agentDir, 'settings.json');
}

export function piExtensionsDir(agentDir = piAgentDir()) {
  return path.join(agentDir, 'extensions');
}

// pi 把所有 npm 扩展装进 <agentDir>/npm，这里是它的 package.json 与 node_modules。
export function piNpmDir(agentDir = piAgentDir()) {
  return path.join(agentDir, 'npm');
}

export function piPackageDir(packageName, agentDir = piAgentDir()) {
  return path.join(piNpmDir(agentDir), 'node_modules', ...packageName.split('/'));
}
