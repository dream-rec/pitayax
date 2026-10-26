import { readTextIfExists, writeTextFile } from './files.js';

export async function readJsonObject(filePath, fallback = {}) {
  const text = await readTextIfExists(filePath);
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${error.message}`);
  }
}

export async function writeJsonObject(filePath, value) {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
