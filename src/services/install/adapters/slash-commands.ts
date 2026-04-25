import fs from 'fs';
import path from 'path';
import { InstallContext } from './types.ts';
import { SLASH_COMMAND_DEFS } from '../../commands/defs.ts';
import { generateMarkdown } from '../../commands/markdown.ts';

const SUBDIR = 'graphhub';

function commandsDir(ctx: InstallContext): string {
  return path.join(ctx.home, '.claude', 'commands', SUBDIR);
}

export function writeSlashCommands(ctx: InstallContext): string[] {
  const dir = commandsDir(ctx);
  fs.mkdirSync(dir, { recursive: true });
  return SLASH_COMMAND_DEFS.map((def) => {
    const filePath = path.join(dir, `${def.name}.md`);
    fs.writeFileSync(filePath, generateMarkdown(def, ctx.graphhubDir));
    return filePath;
  });
}

export function removeSlashCommands(ctx: InstallContext): void {
  try {
    fs.rmSync(commandsDir(ctx), { recursive: true, force: true });
  } catch { /* already gone */ }
}
