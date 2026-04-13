import kuzu from 'kuzu';
import fs from 'fs';
import path from 'path';

async function test() {
  const dbPath = './.graphhub/test-vector';
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { recursive: true });
  }
  
  const db = new kuzu.Database(dbPath);
  const conn = new kuzu.Connection(db);
  
  try {
    console.log('Testing FLOAT[384] support...');
    await conn.query('CREATE NODE TABLE Chunk(id STRING, vec FLOAT[384], PRIMARY KEY(id))');
    console.log('Table created successfully!');
    
    // Test ingestion
    const dummyVec = Array(384).fill(0).map((_, i) => i / 384);
    await conn.query('CREATE (c:Chunk {id: "test", vec: $vec})', { vec: dummyVec });
    console.log('Vector data inserted!');
    
    const res = await conn.query('MATCH (c:Chunk) RETURN c.id, c.vec');
    const rows = await res.getAll();
    console.log('Retrieved vector length:', rows[0]['c.vec'].length);
    
  } catch (err) {
    console.error('Vector test failed:', err);
  } finally {
    await db.close();
  }
}

test();
