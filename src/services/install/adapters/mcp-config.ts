import fs from 'fs';
import path from 'path';

export interface McpServerEntry {
  command: string;
  args: string[];
  cwd?: string;
}

export function buildGraphhubServerEntry(graphhubDir: string): McpServerEntry {
  return {
    command: 'npx',
    args: ['tsx', path.join(graphhubDir, 'src', 'index.ts'), 'serve'],
    cwd: graphhubDir,
  };
}

export function readJsonIfExists<T extends object>(filePath: string): T {
  if (!fs.existsSync(filePath)) return {} as T;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return {} as T;
  }
}

export function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
