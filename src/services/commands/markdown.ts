import { CommandDef } from './defs.ts';

export function generateMarkdown(cmd: CommandDef, graphhubDir: string): string {
  const ghDir = graphhubDir.replace(/\\/g, '/');
  const lines = ['---'];
  for (const [k, v] of Object.entries(cmd.markdown.frontmatter)) {
    // YAML flow sequences ([...]) must be quoted when used as a scalar string value
    const yamlValue = v.startsWith('[') ? `"${v}"` : v;
    lines.push(`${k}: ${yamlValue}`);
  }
  lines.push('---', '');
  lines.push(cmd.markdown.body.replace(/GRAPHHUB_DIR/g, ghDir));
  return lines.join('\n') + '\n';
}
