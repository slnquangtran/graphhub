import { CommandDef } from './defs.ts';

export function generateMarkdown(cmd: CommandDef, graphhubDir: string): string {
  const ghDir = graphhubDir.replace(/\\/g, '/');
  const lines = ['---'];
  for (const [k, v] of Object.entries(cmd.markdown.frontmatter)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push('---', '');
  lines.push(cmd.markdown.body.replace(/GRAPHHUB_DIR/g, ghDir));
  return lines.join('\n') + '\n';
}
