import { Parser, Language } from 'web-tree-sitter';
import path from 'path';

export interface ImportDefinition {
  source: string;
  specifiers: string[];
}

export interface SymbolDefinition {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'method' | 'import' | 'variable';
  range: {
    start: { row: number; column: number };
    end: { row: number; column: number };
  };
  calls?: string[];
  imports?: ImportDefinition[];
  doc?: string;
  inputs?: string[];
  outputs?: string[];
  technicalDebt?: string[];
  status?: 'Done' | 'Incomplete';
}

export class CodeParser {
  private parser: Parser | null = null;
  private languages: Record<string, Parser.Language> = {};

  public async initialize(): Promise<void> {
    await Parser.init();
    this.parser = new Parser();

    // Load languages
    const langDir = path.resolve('node_modules');
    
    this.languages['typescript'] = await Language.load(
      path.join(langDir, 'tree-sitter-typescript', 'tree-sitter-typescript.wasm')
    );
    this.languages['javascript'] = await Language.load(
      path.join(langDir, 'tree-sitter-javascript', 'tree-sitter-javascript.wasm')
    );
    this.languages['tsx'] = await Language.load(
      path.join(langDir, 'tree-sitter-typescript', 'tree-sitter-tsx.wasm')
    );
  }

  public parse(sourceCode: string, language: string): SymbolDefinition[] {
    if (!this.parser || !this.languages[language]) {
      throw new Error(`Parser not initialized or language ${language} not supported.`);
    }

    this.parser.setLanguage(this.languages[language]);
    const tree = this.parser.parse(sourceCode);
    
    return this.extractSymbols(tree.rootNode);
  }

  private extractSymbols(rootNode: Parser.SyntaxNode): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    let currentSymbolsStack: SymbolDefinition[] = [];
    let pendingComments: string[] = [];

    const visit = (node: Parser.SyntaxNode) => {
      let symbol: SymbolDefinition | null = null;

      // Capture comments
      if (node.type === 'comment') {
        const text = node.text;
        if (text.startsWith('/**') || text.startsWith('//')) {
          pendingComments.push(text);
        }
      }

      // Basic extraction logic for TS/JS
      switch (node.type) {
        case 'function_declaration':
        case 'function_expression':
        case 'arrow_function':
        case 'method_definition':
          let kind: any = node.type === 'method_definition' ? 'method' : 'function';
          let name = 'anonymous';
          let inputs: string[] = [];
          let outputs: string[] = [];
          let technicalDebt: string[] = [];
          
          if (node.type === 'method_definition' || node.type === 'function_declaration') {
            name = node.childForFieldName('name')?.text || 'anonymous';
          }

          // Extract inputs
          const paramsNode = node.childForFieldName('parameters');
          if (paramsNode) {
            inputs = paramsNode.text.replace(/[()]/g, '').split(',').map(s => s.trim()).filter(Boolean);
          }

          // Extract outputs
          const returnTypeNode = node.childForFieldName('return_type');
          if (returnTypeNode) {
            outputs.push(returnTypeNode.text.replace(/^:\s*/, ''));
          } else {
             // Basic heuristic inference tracking
             const returnStatements = node.descendantsOfType('return_statement');
             if (returnStatements.length > 0) {
                 outputs.push('inferred_dynamic_type');
             } else {
                 outputs.push('void');
             }
          }

          // Identify Technical Debt
          const rawText = node.text;
          const pendingCommentsStr = pendingComments.join('\n');
          const combinedContext = rawText + pendingCommentsStr;
          const debtMarkers = combinedContext.match(/(TODO|FIXME|HACK|OPTIMIZE|XXX).*$/gm);
          
          if (debtMarkers) {
             // Clean markers strings
             technicalDebt = [...new Set(debtMarkers.map(m => m.trim()))];
          }

          symbol = {
            name,
            kind,
            range: this.getRange(node),
            calls: [],
            doc: pendingCommentsStr,
            inputs: inputs.length > 0 ? inputs : undefined,
            outputs: outputs.length > 0 ? outputs : undefined,
            technicalDebt: technicalDebt.length > 0 ? technicalDebt : undefined,
            status: technicalDebt.length > 0 ? 'Incomplete' : 'Done'
          };
          pendingComments = []; // Reset after assigning
          break;
        case 'class_declaration':
          symbol = {
            name: node.childForFieldName('name')?.text || 'anonymous',
            kind: 'class',
            range: this.getRange(node),
            doc: pendingComments.join('\n')
          };
          pendingComments = [];
          break;
        case 'interface_declaration':
          symbol = {
            name: node.childForFieldName('name')?.text || 'anonymous',
            kind: 'interface',
            range: this.getRange(node),
            doc: pendingComments.join('\n')
          };
          pendingComments = [];
          break;
        case 'import_specifier':
        case 'import_clause':
          // We don't typically associate docs with individual import names
          break;
        
        // --- Call Extraction ---
        case 'call_expression':
          const caller = currentSymbolsStack[currentSymbolsStack.length - 1];
          if (caller && caller.calls) {
            const funcNode = node.childForFieldName('function');
            if (funcNode) {
              // Extract simple name from identifier or member expression
              let targetName = '';
              if (funcNode.type === 'identifier') {
                targetName = funcNode.text;
              } else if (funcNode.type === 'member_expression') {
                targetName = funcNode.childForFieldName('property')?.text || '';
              }
              
              if (targetName) {
                caller.calls.push(targetName);
              }
            }
          }
          break;

        // --- Import Extraction ---
        case 'import_statement':
          const sourceNode = node.childForFieldName('source');
          if (sourceNode) {
            const source = sourceNode.text.replace(/['"]/g, ''); // Clean quotes
            const specifiers: string[] = [];
            
            const clause = node.childForFieldName('clause');
            if (clause) {
              // Find named imports, namespace imports, etc.
              const named = clause.descendantsOfType('import_specifier');
              named.forEach(n => specifiers.push(n.text));
              
              // Handle default import
              const firstChild = clause.child(0);
              if (firstChild && firstChild.type === 'identifier') {
                specifiers.push(firstChild.text);
              }

              // Handle namespace import
              const namespace = clause.descendantsOfType('namespace_import');
              namespace.forEach(n => specifiers.push(n.text));
            }

            // Map imports to the file level by pushing to the list
            // We'll return them as part of a virtual 'file' symbol or just in the list
            symbol = {
              name: source,
              kind: 'import',
              range: this.getRange(node),
              imports: [{ source, specifiers }]
            };
          }
          break;
      }

      if (symbol) {
        symbols.push(symbol);
        if (['function', 'method'].includes(symbol.kind)) {
          currentSymbolsStack.push(symbol);
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i)!);
      }

      if (symbol && ['function', 'method'].includes(symbol.kind)) {
        currentSymbolsStack.pop();
      }
    };

    visit(rootNode);
    return symbols;
  }

  private getRange(node: Parser.SyntaxNode) {
    return {
      start: { row: node.startPosition.row, column: node.startPosition.column },
      end: { row: node.endPosition.row, column: node.endPosition.column },
    };
  }
}
