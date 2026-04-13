import { RAGService } from '../src/services/ai/rag-service.ts';

async function test() {
  const rag = RAGService.getInstance();
  console.log('Searching for: "How to resolve function calls?"');
  const results = await rag.search('How to resolve function calls?');
  
  console.log('\nTop Results:');
  results.forEach(r => {
    console.log(`- [${(r.score * 100).toFixed(1)}%] ${r.symbolName} (${r.kind})`);
    console.log(`  Doc: ${r.text.substring(0, 50)}...`);
  });
}

test();
