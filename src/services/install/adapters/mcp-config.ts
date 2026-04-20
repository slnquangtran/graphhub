import fs from 'fs';
import path from 'path';

export interface McpServerEntry {
  command: string;
  args: string[];
  cwd?: string;
}

export function buildGraphhubServerEntry(graphhubDir: string): McpServerEntry {
  // Normalize to forward slashes so configs work on all platforms and in all clients
  const entry = path.join(graphhubDir, 'src', 'index.ts').replace(/\\/g, '/');
  const cwd = graphhubDir.replace(/\\/g, '/');
  return {
    command: 'npx',
    args: ['tsx', entry, 'serve'],
    cwd,
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
