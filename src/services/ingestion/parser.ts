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
  extends?: string;
  implements?: string[];
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
    this.languages['python'] = await Language.load(
      path.join(langDir, 'tree-sitter-python', 'tree-sitter-python.wasm')
    );
  }

  public supportsLanguage(language: string): boolean {
    return language in this.languages;
  }

  public parse(sourceCode: string, language: string): SymbolDefinition[] {
    if (!this.parser || !this.languages[language]) {
      throw new Error(`Parser not initialized or language ${language} not supported.`);
    }

    this.parser.setLanguage(this.languages[language]);
    const tree = this.parser.parse(sourceCode);

    if (language === 'python') {
      return this.extractPythonSymbols(tree.rootNode);
    }
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
        case 'lexical_declaration':
        case 'variable_declaration':
          let kind: any = node.type === 'method_definition' ? 'method' : 'function';
          let name = 'anonymous';
          let inputs: string[] = [];
          let outputs: string[] = [];
          let technicalDebt: string[] = [];
          
          let funcNode = node;

          // Handle variable declarations: const add = () => ...
          if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
            const declarator = node.descendantsOfType('variable_declarator')[0];
            if (!declarator) break;
            
            const valueNode = declarator.childForFieldName('value');
            if (valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
              name = declarator.childForFieldName('name')?.text || 'anonymous';
              funcNode = valueNode;
            } else {
              // Not a function assignment, skip it to keep the graph focused
              break;
            }
          } else if (node.type === 'method_definition' || node.type === 'function_declaration') {
            name = node.childForFieldName('name')?.text || 'anonymous';
          }

          // Extract inputs from the function node (which might be the variable's value)
          const paramsNode = funcNode.childForFieldName('parameters');
          if (paramsNode) {
            inputs = paramsNode.text.replace(/[()]/g, '').split(',').map(s => s.trim()).filter(Boolean);
          }

          // Extract outputs from the function node
          const returnTypeNode = funcNode.childForFieldName('return_type');
          if (returnTypeNode) {
            outputs.push(returnTypeNode.text.replace(/^:\s*/, ''));
          } else {
             // Basic heuristic inference tracking
             const returnStatements = funcNode.descendantsOfType('return_statement');
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
          pendingComments = [];
          break;
        case 'class_declaration':
          const className = node.childForFieldName('name')?.text || 'anonymous';
          let extendsClass: string | undefined;
          let implementsInterfaces: string[] = [];

          // Extract extends clause (heritage clause with 'extends')
          const heritageClause = node.descendantsOfType('extends_clause')[0];
          if (heritageClause) {
            const typeNode = heritageClause.child(1); // First child after 'extends' keyword
            if (typeNode) {
              extendsClass = typeNode.text.split('<')[0].trim(); // Remove generics
            }
          }

          // Extract implements clause
          const implementsClause = node.descendantsOfType('implements_clause')[0];
          if (implementsClause) {
            for (let i = 1; i < implementsClause.childCount; i++) {
              const child = implementsClause.child(i);
              if (child && child.type !== ',' && child.type !== 'implements') {
                implementsInterfaces.push(child.text.split('<')[0].trim());
              }
            }
          }

          symbol = {
            name: className,
            kind: 'class',
            range: this.getRange(node),
            calls: [],
            doc: pendingComments.join('\n'),
            extends: extendsClass,
            implements: implementsInterfaces.length > 0 ? implementsInterfaces : undefined
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
              named.forEach(n => {
                // Extract only the original exported name, not the local alias
                const originalName = n.childForFieldName('name')?.text || n.text.split(' as ')[0].trim();
                specifiers.push(originalName);
              });
              
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

      let pushed = false;
      if (symbol) {
        symbols.push(symbol);
        // Only push named symbols onto the call-attribution stack. Anonymous symbols
        // arise when the visitor re-enters an arrow_function or function_expression
        // node that was already consumed as the value of a variable declarator (e.g.
        // `const foo = () => {}`). Pushing them would displace `foo` on the stack,
        // causing all calls inside the body to be attributed to the anonymous node
        // instead of `foo` — and then lost when anonymous symbols are filtered out.
        if (['function', 'method', 'class'].includes(symbol.kind) && symbol.name !== 'anonymous') {
          currentSymbolsStack.push(symbol);
          pushed = true;
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i)!);
      }

      if (pushed) {
        currentSymbolsStack.pop();
      }
    };

    visit(rootNode);
    // Filter out anonymous functions - they clutter the graph
    return symbols.filter(s => s.name !== 'anonymous');
  }

  private extractPythonSymbols(rootNode: Parser.SyntaxNode): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    let currentSymbolsStack: SymbolDefinition[] = [];
    let pendingComments: string[] = [];

    const visit = (node: Parser.SyntaxNode) => {
      let symbol: SymbolDefinition | null = null;

      // Capture Python comments and docstrings
      if (node.type === 'comment') {
        pendingComments.push(node.text);
      }
      if (node.type === 'expression_statement') {
        const child = node.child(0);
        if (child?.type === 'string') {
          // This is likely a docstring
          pendingComments.push(child.text);
        }
      }

      switch (node.type) {
        case 'function_definition':
          const funcName = node.childForFieldName('name')?.text || 'anonymous';
          const params = node.childForFieldName('parameters');
          const returnType = node.childForFieldName('return_type');

          let inputs: string[] = [];
          if (params) {
            // Extract parameter names and types
            for (let i = 0; i < params.childCount; i++) {
              const param = params.child(i);
              if (param && (param.type === 'identifier' || param.type === 'typed_parameter' ||
                           param.type === 'default_parameter' || param.type === 'typed_default_parameter')) {
                const paramName = param.childForFieldName('name')?.text || param.text;
                const paramType = param.childForFieldName('type')?.text;
                if (paramName && paramName !== ',' && paramName !== '(' && paramName !== ')') {
                  inputs.push(paramType ? `${paramName}: ${paramType}` : paramName);
                }
              }
            }
          }

          let outputs: string[] = [];
          if (returnType) {
            outputs.push(returnType.text.replace(/^->\s*/, ''));
          } else {
            // Check for return statements
            const returnStmts = node.descendantsOfType('return_statement');
            if (returnStmts.length > 0) {
              outputs.push('inferred');
            } else {
              outputs.push('None');
            }
          }

          symbol = {
            name: funcName,
            kind: 'function',
            range: this.getRange(node),
            calls: [],
            doc: pendingComments.join('\n'),
            inputs: inputs.length > 0 ? inputs : undefined,
            outputs: outputs.length > 0 ? outputs : undefined,
          };
          pendingComments = [];
          break;

        case 'class_definition':
          const pyClassName = node.childForFieldName('name')?.text || 'anonymous';
          let pyExtendsClass: string | undefined;

          // Extract base classes from argument_list (Python inheritance)
          const superclasses = node.childForFieldName('superclasses');
          if (superclasses) {
            // First base class is the primary parent
            for (let i = 0; i < superclasses.childCount; i++) {
              const child = superclasses.child(i);
              if (child && child.type === 'identifier') {
                if (!pyExtendsClass) {
                  pyExtendsClass = child.text;
                }
                break; // Only capture first parent for INHERITS
              }
            }
          }

          symbol = {
            name: pyClassName,
            kind: 'class',
            range: this.getRange(node),
            doc: pendingComments.join('\n'),
            extends: pyExtendsClass
          };
          pendingComments = [];
          break;

        case 'call':
          const caller = currentSymbolsStack[currentSymbolsStack.length - 1];
          if (caller && caller.calls) {
            const funcNode = node.childForFieldName('function');
            if (funcNode) {
              let targetName = '';
              if (funcNode.type === 'identifier') {
                targetName = funcNode.text;
              } else if (funcNode.type === 'attribute') {
                // e.g., obj.method() - get the method name
                targetName = funcNode.childForFieldName('attribute')?.text || '';
              }
              if (targetName && !caller.calls.includes(targetName)) {
                caller.calls.push(targetName);
              }
            }
          }
          break;

        case 'import_statement':
        case 'import_from_statement':
          const moduleName = node.childForFieldName('module_name')?.text ||
                            node.childForFieldName('name')?.text || 'unknown';
          symbol = {
            name: moduleName,
            kind: 'import',
            range: this.getRange(node),
            imports: [{ source: moduleName, specifiers: [] }]
          };
          break;
      }

      if (symbol) {
        symbols.push(symbol);
        if (symbol.kind === 'function') {
          currentSymbolsStack.push(symbol);
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i)!);
      }

      if (symbol && symbol.kind === 'function') {
        currentSymbolsStack.pop();
      }
    };

    visit(rootNode);
    // Filter out anonymous functions - they clutter the graph
    return symbols.filter(s => s.name !== 'anonymous');
  }

  private getRange(node: Parser.SyntaxNode) {
    return {
      start: { row: node.startPosition.row, column: node.startPosition.column },
      end: { row: node.endPosition.row, column: node.endPosition.column },
    };
  }
}
