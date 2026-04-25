import readline from 'readline';
import { SLASH_COMMANDS, CommandContext } from '../commands/registry.ts';

export async function startRepl(): Promise<void> {
  const ctx: CommandContext = { cwd: process.cwd() };

  console.log('Graph-Hub REPL — type /help for commands, /exit to quit.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'graphhub> ',
  });

  let busy = false;
  let shutdownPending = false;

  const shutdown = () => {
    console.log('');
    if (!busy) {
      process.exit(0);
    } else {
      console.error('Finishing current command, then exiting…');
      shutdownPending = true;
    }
  };

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    if (!trimmed.startsWith('/')) {
      console.error('Commands start with /  — type /help for the list.');
      rl.prompt();
      return;
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const name = parts[0];
    const args = parts.slice(1);

    if (name === 'exit' || name === 'quit') {
      console.log('Goodbye.');
      rl.close();
      process.exit(0);
    }

    if (name === 'help') {
      console.log('');
      console.log('Available commands:');
      for (const cmd of SLASH_COMMANDS) {
        const usage = `/${cmd.name}${cmd.args ? ' ' + cmd.args : ''}`;
        console.log(`  ${usage.padEnd(24)} ${cmd.description}`);
      }
      console.log('  /help                    Show this help');
      console.log('  /exit, /quit             Exit the REPL');
      console.log('');
      rl.prompt();
      return;
    }

    const cmd = SLASH_COMMANDS.find((c) => c.name === name);
    if (!cmd) {
      console.error(`Unknown command: /${name}  — type /help for the list.`);
      rl.prompt();
      return;
    }

    if (busy) {
      console.error('A command is already running. Please wait.');
      return;
    }

    busy = true;
    rl.pause();
    try {
      await cmd.run(args, ctx);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      busy = false;
      if (shutdownPending) process.exit(0);
      rl.resume();
      rl.prompt();
    }
  });

  rl.on('close', shutdown);
  process.on('SIGINT', shutdown);
}
