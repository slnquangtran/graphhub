import { IngestionService } from './services/ingestion/ingestion-service.ts';
import { GraphHubMCPServer } from './services/mcp/server.ts';
import { GraphExporter } from './services/db/graph-exporter.ts';
import { DocGenerator } from './services/ai/doc-generator.ts';
import { Installer } from './services/install/installer.ts';
import { ReportGenerator } from './services/report/report-generator.ts';
import { ObservationService } from './services/memory/observation-service.ts';
import { GraphClient } from './services/db/graph-client.ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Always resolve graphhubDir relative to this file, regardless of where the CLI is invoked from
const __graphhubDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'serve';

  if (command === 'index') {
    const service = new IngestionService();
    console.error('--- GraphHub Indexer Starting ---');
    await service.initialize();

    const positional = args.slice(1).filter((a) => !a.startsWith('--'));
    const targetDir = positional[0] || './src';
    const clean = args.includes('--clean');
    console.error(`Indexing directory: ${path.resolve(targetDir)}  clean=${clean}`);
    const stats = await service.indexDirectoryWithStats(targetDir, { clean });
    await service.resolveImports();
    await service.resolveCalls();
    await service.resolveInheritance();
    console.error(
      `Indexing complete. indexed=${stats.indexed} skipped=${stats.skipped} removed=${stats.removed} errors=${stats.errors} elapsed=${stats.elapsed_ms}ms`,
    );
    process.exit(0);
  } else if (command === 'watch') {
    const { WatchService } = await import('./services/ingestion/watch-service.ts');
    const service = new IngestionService();
    console.error('--- GraphHub Watch Mode ---');
    await service.initialize();
    const targetDir = args[1] || './src';
    console.error(`Priming index: ${path.resolve(targetDir)}`);
    const stats = await service.indexDirectoryWithStats(targetDir, { clean: true });
    await service.resolveImports();
    await service.resolveCalls();
    await service.resolveInheritance();
    console.error(
      `Primed. indexed=${stats.indexed} skipped=${stats.skipped} removed=${stats.removed} elapsed=${stats.elapsed_ms}ms`,
    );
    const watcher = new WatchService(service);
    await watcher.start(targetDir, {
      onEvent: (kind, file) => {
        if (kind === 'unsupported' || kind === 'skipped') return;
        const rel = path.relative(process.cwd(), file);
        console.error(`[${kind}] ${rel}`);
      },
    });
    console.error(`Watching ${path.resolve(targetDir)} (Ctrl-C to stop)`);

    // Write PID file so the post-hook can detect a running watcher and skip
    // its own background reindex (avoids double-indexing on every git commit).
    const pidFile = path.join(path.resolve(targetDir), '.graphhub', '.watch.pid');
    try {
      fs.mkdirSync(path.dirname(pidFile), { recursive: true });
      fs.writeFileSync(pidFile, String(process.pid));
    } catch { /* non-fatal */ }

    const shutdown = async () => {
      try { fs.unlinkSync(pidFile); } catch { /* already gone */ }
      await watcher.stop();
      await GraphClient.getInstance().close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else if (command === 'serve') {
    const server = new GraphHubMCPServer();
    console.error('--- GraphHub MCP Server Starting ---');
    const shutdown = async () => {
      await GraphClient.getInstance().close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
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
    const positional = args.slice(1).filter((a) => !a.startsWith('--'));
    const targetDir = positional[0] || process.cwd();
    console.error('--- GraphHub Installer (Claude Code) ---');
    await installer.installForClaudeCode(targetDir);
    process.exit(0);
  } else if (command === 'uninstall') {
    const installer = new Installer();
    const positional = args.slice(1).filter((a) => !a.startsWith('--'));
    const targetDir = positional[0] || process.cwd();
    console.error('--- GraphHub Uninstaller (Claude Code) ---');
    await installer.uninstall(targetDir);
    process.exit(0);
  } else if (command === 'setup' || command === 'setup-all') {
    const { MultiInstaller } = await import('./services/install/multi-installer.ts');
    const installer = new MultiInstaller();

    const clientFlag = args.indexOf('--client');
    const clients = clientFlag !== -1 && args[clientFlag + 1]
      ? args[clientFlag + 1].split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const force = args.includes('--force');
    const list = args.includes('--list');
    const dryRun = args.includes('--dry-run');

    if (list) {
      console.error('--- GraphHub Supported Clients ---');
      for (const c of installer.listClients()) console.log(`  ${c.name.padEnd(14)} ${c.description}`);
      process.exit(0);
    }

    const positional: string[] = [];
    for (let i = 1; i < args.length; i++) {
      if (!args[i].startsWith('--') && args[i - 1] !== '--client') {
        positional.push(args[i]);
      }
    }
    const projectDir = positional[0] || process.cwd();

    console.error('--- GraphHub Multi-Client Setup ---');
    if (dryRun) {
      const detections = await installer.detect({ projectDir, graphhubDir: __graphhubDir });
      console.log('Detected clients:');
      for (const d of detections) console.log(`  ${d.detected ? '[x]' : '[ ]'} ${d.name}`);
      process.exit(0);
    }

    const results = await installer.installAll({ projectDir, graphhubDir: __graphhubDir, clients, force });
    if (results.length === 0) {
      console.error('No supported clients detected. Re-run with --force to install for every adapter,');
      console.error('or with --client claude-code,opencode,gemini-cli,antigravity,kilo-cli to pick explicitly.');
      process.exit(0);
    }
    for (const r of results) {
      const status = r.installed ? 'installed' : r.reason;
      console.log(`  [${r.installed ? 'x' : ' '}] ${r.client.padEnd(14)} ${status}  ${r.files.join(', ')}`);
    }
    console.error('Done. Restart the clients above so they pick up the new MCP server.');
    process.exit(0);
  } else if (command === 'uninstall-all') {
    const { MultiInstaller } = await import('./services/install/multi-installer.ts');
    const installer = new MultiInstaller();
    const clientFlag = args.indexOf('--client');
    const clients = clientFlag !== -1 && args[clientFlag + 1]
      ? args[clientFlag + 1].split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const force = args.includes('--force');
    const positional: string[] = [];
    for (let i = 1; i < args.length; i++) {
      if (!args[i].startsWith('--') && args[i - 1] !== '--client') {
        positional.push(args[i]);
      }
    }
    const projectDir = positional[0] || process.cwd();
    console.error('--- GraphHub Multi-Client Uninstall ---');
    const results = await installer.uninstallAll({ projectDir, graphhubDir: __graphhubDir, clients, force });
    for (const r of results) {
      console.log(`  ${r.client.padEnd(14)} ${r.reason}`);
    }
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
  } else if (command === 'repl') {
    const { startRepl } = await import('./services/repl/repl.ts');
    await startRepl();
  } else {
    console.error('Usage: tsx src/index.ts <command> [options]');
    console.error('');
    console.error('Commands:');
    console.error('  index <dir> [--clean]    Index a directory (--clean removes files no longer on disk)');
    console.error('  watch <dir>              Incrementally re-index on file change');
    console.error('  serve                    Start the MCP server (stdio)');
    console.error('  serve-api                Start the REST API server (port 9000)');
    console.error('  visualize [out.mermaid]  Export the graph to Mermaid format');
    console.error('  report                   Generate GRAPH_REPORT.md summary');
    console.error('  repl                     Interactive REPL with /find, /search, /impact and more');
    console.error('  setup [dir] [--client X,Y] [--force] [--list] [--dry-run]');
    console.error('                           Configure every detected MCP client (claude-code, opencode,');
    console.error('                           gemini-cli, antigravity, kilo-cli). Use --force to install for all.');
    console.error('  uninstall-all [dir]      Remove GraphHub from all detected MCP clients');
    console.error('  install [dir]            Legacy: Claude Code only (includes hooks + CLAUDE.md)');
    console.error('  uninstall [dir]          Legacy: remove Claude Code config only');
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
