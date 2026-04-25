export interface CommandDef {
  name: string;
  args: string;
  description: string;
  markdown: {
    frontmatter: Record<string, string>;
    body: string;
  };
}

export const SLASH_COMMAND_DEFS: CommandDef[] = [
  {
    name: 'index',
    args: '[dir]',
    description: 'Index a directory into the Graph-Hub knowledge graph',
    markdown: {
      frontmatter: {
        description: 'Index a directory into Graph-Hub (run after large changes)',
        'argument-hint': '[dir]',
        'allowed-tools': 'Bash',
      },
      body: 'Run the Graph-Hub indexer on the given directory (or `./src` if none specified).\n\n!tsx GRAPHHUB_DIR/src/index.ts index $ARGUMENTS',
    },
  },
  {
    name: 'find',
    args: '<symbol>',
    description: 'Find callers, callees, and definition location of a symbol',
    markdown: {
      frontmatter: {
        description: 'Find callers, callees, and definition of a symbol via Graph-Hub',
        'argument-hint': '<symbol-name>',
        'allowed-tools': 'mcp__graphhub__get_context',
      },
      body: 'Use the `get_context` MCP tool with `name` set to $ARGUMENTS. Display the `definedIn` location, `callers`, and `callees` clearly.',
    },
  },
  {
    name: 'search',
    args: '<query>',
    description: 'Semantic / keyword search across the indexed codebase',
    markdown: {
      frontmatter: {
        description: 'Semantic code search across the Graph-Hub index',
        'argument-hint': '<natural-language query>',
        'allowed-tools': 'mcp__graphhub__semantic_search',
      },
      body: 'Use the `semantic_search` MCP tool with `query` set to $ARGUMENTS and `mode` set to `"hybrid"`. Display the top results with their file paths and relevance scores.',
    },
  },
  {
    name: 'impact',
    args: '<symbol>',
    description: 'Blast radius of a symbol: direct and indirect callers with risk rating',
    markdown: {
      frontmatter: {
        description: 'Show blast radius of a symbol (direct + indirect callers)',
        'argument-hint': '<symbol-name>',
        'allowed-tools': 'mcp__graphhub__impact_analysis',
      },
      body: 'Use the `impact_analysis` MCP tool with `name` set to $ARGUMENTS. Display the risk rating (LOW/MEDIUM/HIGH), direct callers, and indirect callers.',
    },
  },
  {
    name: 'debug',
    args: '<bug description>',
    description: 'One-shot debug trace: ranked candidate symbols with full context',
    markdown: {
      frontmatter: {
        description: 'One-shot debug trace for a bug or error via Graph-Hub',
        'argument-hint': '<bug description or error message>',
        'allowed-tools': 'mcp__graphhub__debug_trace',
      },
      body: 'Use the `debug_trace` MCP tool with `query` set to $ARGUMENTS. Analyse the ranked candidates and suggest the most likely root cause and fix.',
    },
  },
  {
    name: 'similar',
    args: '<symbol>',
    description: 'Find semantically similar symbols (potential duplicates)',
    markdown: {
      frontmatter: {
        description: 'Find symbols semantically similar to a given symbol',
        'argument-hint': '<symbol-name>',
        'allowed-tools': 'mcp__graphhub__find_similar',
      },
      body: 'Use the `find_similar` MCP tool with `symbolName` set to $ARGUMENTS and `limit` set to 10. Show the results grouped by similarity score.',
    },
  },
  {
    name: 'review',
    args: '[git-ref]',
    description: 'Pre-merge diff review: per-symbol blast radius and risk rating',
    markdown: {
      frontmatter: {
        description: 'Pre-merge diff review with risk rating via Graph-Hub',
        'argument-hint': '[git-ref]',
        'allowed-tools': 'mcp__graphhub__review_diff',
      },
      body: 'Use the `review_diff` MCP tool. If $ARGUMENTS contains a git ref pass it as `since`, otherwise omit it. Summarise the per-symbol blast radius and overall risk rating.',
    },
  },
  {
    name: 'report',
    args: '',
    description: 'Generate a GRAPH_REPORT.md summary of the codebase',
    markdown: {
      frontmatter: {
        description: 'Generate a GRAPH_REPORT.md codebase summary via Graph-Hub',
        'allowed-tools': 'Bash',
      },
      body: 'Run the Graph-Hub report generator.\n\n!tsx GRAPHHUB_DIR/src/index.ts report',
    },
  },
];
