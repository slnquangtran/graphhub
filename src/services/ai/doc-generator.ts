import { GraphClient } from '../db/graph-client.ts';
import fs from 'fs/promises';

interface DocGenConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'heuristic';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface SymbolInfo {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  range: { start: { row: number; column: number }; end: { row: number; column: number } };
  sourceCode?: string;
}

interface GeneratedDoc {
  purpose: string;
  strategy: string;
}

export class DocGenerator {
  private db: GraphClient;
  private config: DocGenConfig;

  constructor(config: DocGenConfig) {
    this.db = GraphClient.getInstance();
    this.config = {
      ...config,
      model: config.model || this.getDefaultModel(config.provider),
      baseUrl: config.baseUrl || this.getDefaultBaseUrl(config.provider),
    };
  }

  private getDefaultModel(provider: string): string {
    switch (provider) {
      case 'openai': return 'gpt-4o-mini';
      case 'anthropic': return 'claude-sonnet-4-20250514';
      case 'ollama': return 'llama3.2';
      case 'openrouter': return 'anthropic/claude-sonnet-4-20250514';
      default: return 'gpt-4o-mini';
    }
  }

  private getDefaultBaseUrl(provider: string): string {
    switch (provider) {
      case 'openai': return 'https://api.openai.com/v1';
      case 'anthropic': return 'https://api.anthropic.com/v1';
      case 'ollama': return 'http://localhost:11434/v1';
      case 'openrouter': return 'https://openrouter.ai/api/v1';
      default: return 'https://api.openai.com/v1';
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    const { provider, apiKey, baseUrl, model } = this.config;

    if (provider === 'anthropic') {
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      return data.content?.[0]?.text || '';
    } else {
      // OpenAI-compatible API (OpenAI, Ollama, OpenRouter)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://graphhub.local';
        headers['X-Title'] = 'GraphHub';
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
          temperature: 0.3,
        }),
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }

  private buildPrompt(symbol: SymbolInfo): string {
    return `Analyze this ${symbol.kind} and provide a brief explanation.

**Name:** ${symbol.name}
**Kind:** ${symbol.kind}
**File:** ${symbol.filePath}

**Source Code:**
\`\`\`
${symbol.sourceCode || '(source not available)'}
\`\`\`

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "purpose": "One sentence explaining WHAT this ${symbol.kind} does and WHY it exists.",
  "strategy": "One to two sentences explaining HOW it accomplishes its goal - the key algorithm, pattern, or approach used."
}`;
  }

  private parseResponse(response: string): GeneratedDoc {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          purpose: parsed.purpose || 'Purpose not generated.',
          strategy: parsed.strategy || 'Strategy not generated.',
        };
      }
    } catch (e) {
      // Fall back to extracting text
    }
    return {
      purpose: 'Purpose not generated.',
      strategy: 'Strategy not generated.',
    };
  }

  async getSymbolsToDocument(): Promise<SymbolInfo[]> {
    const result = await this.db.runCypher(
      `MATCH (f:File)-[:CONTAINS]->(s:Symbol)
       WHERE s.kind IN ['function', 'method', 'class']
       AND (s.purpose IS NULL OR s.purpose = '')
       RETURN s.id as id, s.name as name, s.kind as kind, f.path as filePath, s.range as range`
    );
    const rows = await result.getAll();

    const symbols: SymbolInfo[] = [];
    for (const row of rows) {
      let range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
      try {
        range = JSON.parse(row.range || '{}');
      } catch {}

      // Read source code from file
      let sourceCode = '';
      try {
        const content = await fs.readFile(row.filePath, 'utf8');
        const lines = content.split('\n');
        sourceCode = lines.slice(range.start.row, range.end.row + 1).join('\n');
      } catch {}

      symbols.push({
        id: row.id,
        name: row.name,
        kind: row.kind,
        filePath: row.filePath,
        range,
        sourceCode,
      });
    }
    return symbols;
  }

  private generateHeuristicDoc(symbol: SymbolInfo): GeneratedDoc {
    const { name, kind, sourceCode } = symbol;
    const code = sourceCode || '';

    // Analyze the code to generate heuristic documentation
    const lines = code.split('\n').filter(l => l.trim());
    const hasAsync = code.includes('async ') || code.includes('await ');
    const hasReturn = code.includes('return ');
    const hasThrow = code.includes('throw ');
    const hasTryCatch = code.includes('try {') || code.includes('catch (');
    const hasLoop = /\b(for|while|forEach|map|reduce|filter)\b/.test(code);
    const hasConditional = /\b(if|switch|else)\b/.test(code);
    const dbOps = code.includes('runCypher') || code.includes('query') || code.includes('MATCH');
    const httpOps = code.includes('fetch(') || code.includes('axios') || code.includes('request(');
    const fileOps = code.includes('readFile') || code.includes('writeFile') || code.includes('fs.');

    // Extract parameter names from signature
    const paramMatch = code.match(/\(([^)]*)\)/);
    const params = paramMatch ? paramMatch[1].split(',').map(p => p.trim().split(':')[0].trim()).filter(Boolean) : [];

    // Generate purpose based on name and patterns
    let purpose = '';
    const nameLower = name.toLowerCase();

    if (nameLower.startsWith('get') || nameLower.startsWith('fetch') || nameLower.startsWith('load')) {
      purpose = `Retrieves ${this.camelToWords(name.replace(/^(get|fetch|load)/i, ''))} data`;
    } else if (nameLower.startsWith('set') || nameLower.startsWith('update')) {
      purpose = `Updates ${this.camelToWords(name.replace(/^(set|update)/i, ''))}`;
    } else if (nameLower.startsWith('create') || nameLower.startsWith('add') || nameLower.startsWith('insert')) {
      purpose = `Creates a new ${this.camelToWords(name.replace(/^(create|add|insert)/i, ''))}`;
    } else if (nameLower.startsWith('delete') || nameLower.startsWith('remove')) {
      purpose = `Removes ${this.camelToWords(name.replace(/^(delete|remove)/i, ''))}`;
    } else if (nameLower.startsWith('is') || nameLower.startsWith('has') || nameLower.startsWith('can')) {
      purpose = `Checks whether ${this.camelToWords(name.replace(/^(is|has|can)/i, ''))}`;
    } else if (nameLower.startsWith('validate') || nameLower.startsWith('check')) {
      purpose = `Validates ${this.camelToWords(name.replace(/^(validate|check)/i, ''))}`;
    } else if (nameLower.startsWith('parse') || nameLower.startsWith('extract')) {
      purpose = `Parses and extracts ${this.camelToWords(name.replace(/^(parse|extract)/i, ''))}`;
    } else if (nameLower.startsWith('init') || nameLower === 'constructor') {
      purpose = `Initializes the ${kind === 'method' ? 'instance' : 'component'} with required dependencies`;
    } else if (nameLower.startsWith('handle') || nameLower.startsWith('on')) {
      purpose = `Handles ${this.camelToWords(name.replace(/^(handle|on)/i, ''))} events or actions`;
    } else if (nameLower.startsWith('render') || nameLower.startsWith('display')) {
      purpose = `Renders ${this.camelToWords(name.replace(/^(render|display)/i, ''))} to the UI`;
    } else if (nameLower.includes('save') || nameLower.includes('store') || nameLower.includes('persist')) {
      purpose = `Persists ${this.camelToWords(name)} data to storage`;
    } else if (nameLower.includes('search') || nameLower.includes('find') || nameLower.includes('query')) {
      purpose = `Searches for ${this.camelToWords(name.replace(/search|find|query/gi, ''))}`;
    } else {
      purpose = `Performs ${this.camelToWords(name)} operation`;
    }

    if (params.length > 0) {
      purpose += ` based on ${params.slice(0, 2).join(' and ')}`;
    }

    // Generate strategy based on code patterns
    const strategies: string[] = [];

    if (hasAsync) strategies.push('uses async/await for asynchronous operations');
    if (dbOps) strategies.push('queries the graph database');
    if (httpOps) strategies.push('makes HTTP requests');
    if (fileOps) strategies.push('performs file system operations');
    if (hasLoop) strategies.push('iterates over data');
    if (hasConditional) strategies.push('applies conditional logic');
    if (hasTryCatch) strategies.push('includes error handling');
    if (hasThrow) strategies.push('throws errors on failure');
    if (hasReturn && !hasThrow) strategies.push('returns the result');

    let strategy = strategies.length > 0
      ? `This ${kind} ${strategies.slice(0, 3).join(', ')}.`
      : `Executes the ${name} logic directly.`;

    if (lines.length > 20) {
      strategy += ` Contains ${lines.length} lines of logic.`;
    }

    return { purpose, strategy };
  }

  private camelToWords(str: string): string {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim()
      .toLowerCase();
  }

  async generateDocForSymbol(symbol: SymbolInfo): Promise<GeneratedDoc> {
    if (this.config.provider === 'heuristic') {
      return this.generateHeuristicDoc(symbol);
    }
    const prompt = this.buildPrompt(symbol);
    const response = await this.callLLM(prompt);
    return this.parseResponse(response);
  }

  async saveDoc(symbolId: string, doc: GeneratedDoc): Promise<void> {
    await this.db.runCypher(
      `MATCH (s:Symbol {id: $id}) SET s.purpose = $purpose, s.strategy = $strategy`,
      { id: symbolId, purpose: doc.purpose, strategy: doc.strategy }
    );
  }

  async generateAll(options: { concurrency?: number; onProgress?: (current: number, total: number, name: string) => void } = {}): Promise<void> {
    const { concurrency = 3, onProgress } = options;
    const symbols = await this.getSymbolsToDocument();

    console.error(`Found ${symbols.length} symbols to document.`);

    let completed = 0;
    const queue = [...symbols];

    const worker = async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();
        if (!symbol) break;

        try {
          const doc = await this.generateDocForSymbol(symbol);
          await this.saveDoc(symbol.id, doc);
          completed++;
          onProgress?.(completed, symbols.length, symbol.name);
        } catch (err: any) {
          console.error(`Failed to generate doc for ${symbol.name}: ${err.message}`);
          completed++;
        }
      }
    };

    const workers = Array(concurrency).fill(null).map(() => worker());
    await Promise.all(workers);

    console.error(`Documentation generation complete. ${completed} symbols documented.`);
  }
}
