import fs from 'fs-extra';
import path from 'path';

export async function loadConfig(cwd) {
  const configPath = path.join(cwd, 'docslit.json');
  if (!await fs.pathExists(configPath)) {
    console.error(`  Error: docslit.json not found in ${cwd}`);
    console.error(`  Run "docslit init" to create a new project.`);
    process.exit(1);
  }
  const raw = await fs.readFile(configPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`  Error: docslit.json is not valid JSON.`);
    process.exit(1);
  }
}

export function getAllPageIds(config) {
  const ids = [];
  for (const group of (config.sidebar || [])) {
    for (const page of (group.pages || [])) {
      ids.push(page);
    }
  }
  return ids;
}
