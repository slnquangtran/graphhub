import { Parser, Language } from 'web-tree-sitter';
import path from 'path';

async function run() {
  await Parser.init();
  const parser = new Parser();
  const langDir = 'node_modules';
  const typescript = await Language.load(path.join(langDir, 'tree-sitter-typescript', 'tree-sitter-typescript.wasm'));
  parser.setLanguage(typescript);
  
  const code = `
    /**
     * @param a first input
     * TODO: rename this function
     */
    function calculateTotal(a: number, b: number): number {
      return a + b;
    }
  `;
  const tree = parser.parse(code);
  
  function debug(node, depth = 0) {
    console.log(`${'  '.repeat(depth)}${node.type}: ${node.text}`);
    for (let i = 0; i < node.childCount; i++) {
      debug(node.child(i), depth + 1);
    }
  }

  debug(tree.rootNode);
}

run().catch(console.error);
