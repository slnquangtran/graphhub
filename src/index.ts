import { IngestionService } from './services/ingestion/ingestion-service.ts';
import { GraphHubMCPServer } from './services/mcp/server.ts';
import { GraphExporter } from './services/db/graph-exporter.ts';
import { DocGenerator } from './services/ai/doc-generator.ts';
import { Installer } from './services/install/installer.ts';
import { ReportGenerator } from './services/report/report-generator.ts';
import { ObservationService } from './services/memory/observation-service.ts';
import path from 'path';
import fs from 'fs';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'serve';

  if (command === 'index') {
    const service = new IngestionService();
    console.error('--- GraphHub Indexer Starting ---');
    await service.initialize();
    
    const targetDir = args[1] || './src';
    console.error(`Indexing directory: ${path.resolve(targetDir)}`);
    await service.indexDirectory(targetDir);
    await service.resolveImports();
    await service.resolveCalls();
    console.error('Indexing complete.');
    process.exit(0);
  } else if (command === 'serve') {
    const server = new GraphHubMCPServer();
    console.error('--- GraphHub MCP Server Starting ---');
    await server.run();
  } else if (command === 'visualize') {
    const exporter = new GraphExporter();
    console.error('--- GraphHub Visualizer ---');
    const mermaid = await exporter.exportToMermaid();
    const outPath = args[1] || 'graph.mermaid';
    fs.writeFileSync(outPath, mermaid);
    console.error(`Mermaid graph written to ${path.resolve(outPath)}`);
    process.exit(0);
  } else if (command === 'serve-api') {
    const { GraphHubAPIServer } = await import('./services/api/server.ts');
    const server = new GraphHubAPIServer();
    console.error('--- GraphHub API Server Starting ---');
    await server.initialize();
    server.listen(9000);
  } else if (command === 'install') {
    const installer = new Installer();
    const targetDir = args[1] || process.cwd();
    console.error('--- GraphHub Installer ---');
    await installer.installForClaudeCode(targetDir);
    process.exit(0);
  } else if (command === 'uninstall') {
    const installer = new Installer();
    const targetDir = args[1] || process.cwd();
    console.error('--- GraphHub Uninstaller ---');
    await installer.uninstall(targetDir);
    process.exit(0);
  } else if (command === 'report') {
    const service = new IngestionService();
    await service.initialize();
    const obsService = ObservationService.getInstance();
    await obsService.initializeSchema();
    const generator = new ReportGenerator();
    console.error('--- GraphHub Report Generator ---');
    const outPath = await generator.generate();
    console.error(`Report written to ${path.resolve(outPath)}`);
    process.exit(0);
  } else if (command === 'docs') {
    // docs <provider> [--api-key KEY] [--model MODEL] [--base-url URL]
    const provider = (args[1] || 'heuristic') as 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'heuristic';
    const apiKeyIdx = args.indexOf('--api-key');
    const modelIdx = args.indexOf('--model');
    const baseUrlIdx = args.indexOf('--base-url');

    const apiKey = apiKeyIdx !== -1 ? args[apiKeyIdx + 1] : process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;
    const baseUrl = baseUrlIdx !== -1 ? args[baseUrlIdx + 1] : undefined;

    console.error('--- GraphHub Documentation Generator ---');
    console.error(`Provider: ${provider}, Model: ${model || '(default)'}`);

    const generator = new DocGenerator({ provider, apiKey, model, baseUrl });
    await generator.generateAll({
      concurrency: 3,
      onProgress: (current, total, name) => {
        console.error(`[${current}/${total}] Generated docs for: ${name}`);
      },
    });
    process.exit(0);
  } else {
    console.error('Usage: tsx src/index.ts <command> [options]');
    console.error('');
    console.error('Commands:');
    console.error('  index <dir>              Index a directory into the knowledge graph');
    console.error('  serve                    Start the MCP server (stdio)');
    console.error('  serve-api                Start the REST API server (port 9000)');
    console.error('  visualize [out.mermaid]  Export the graph to Mermaid format');
    console.error('  report                   Generate GRAPH_REPORT.md summary');
    console.error('  install [dir]            Configure Claude Code integration (MCP + hooks)');
    console.error('  uninstall [dir]          Remove GraphHub from Claude Code settings');
    console.error('  docs <provider>          Generate purpose/strategy docs for all functions');
    console.error('');
    console.error('Docs providers: heuristic (default, no API needed), openai, anthropic, ollama, openrouter');
    console.error('  Options: --api-key KEY, --model MODEL, --base-url URL');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
