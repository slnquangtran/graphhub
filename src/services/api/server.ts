import express from 'express';
import cors from 'cors';
import { GraphClient } from '../db/graph-client.ts';
import { RAGService } from '../ai/rag-service.ts';
import { IngestionService } from '../ingestion/ingestion-service.ts';

export class GraphHubAPIServer {
  private app: express.Application;
  private db: GraphClient;
  private rag: RAGService;

  constructor() {
    this.app = express();
    this.db = GraphClient.getInstance();
    this.rag = RAGService.getInstance();
    
    this.app.use(cors());
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.get('/api/workspaces', async (req, res) => {
      try {
        const result = await this.db.runCypher('MATCH (f:File) RETURN DISTINCT f.path AS path');
        const paths = (await result.getAll()).map((r: any) => r.path);
        
        // Simple heuristic to find root directories from file paths.
        const roots = new Set<string>();
        for (const p of paths) {
            // Find the highest level directory by tracking the structure
            const dir = p.substring(0, p.lastIndexOf('\\') !== -1 ? p.lastIndexOf('\\') : p.lastIndexOf('/'));
            if (dir) roots.add(dir.split(/\/|\\/).slice(0, -1).join('/')); // Heuristic root
        }
        res.json({ workspaces: Array.from(roots) });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post('/api/index', async (req, res) => {
      try {
        const { targetDir } = req.body;
        if (!targetDir) {
           res.status(400).json({ error: 'targetDir is required' });
           return;
        }
        
        console.log(`Starting in-process indexing for ${targetDir}...`);
        const ingestion = new IngestionService();
        await ingestion.initialize();
        await ingestion.indexDirectory(targetDir);
        await ingestion.resolveImports();
        await ingestion.resolveCalls();
        console.log(`Indexing for ${targetDir} completed.`);
        
        res.json({ status: 'success' });
      } catch (err: any) {
        console.error('Indexing failed:', err);
        res.status(500).json({ error: err.message });
      }
    });
    this.app.get('/api/graph', async (req, res) => {
      try {
        const workspace = req.query.workspace as string | undefined;

        // Fetch all nodes and edges
        const nodesRes = await this.db.runCypher('MATCH (n) RETURN n');
        const relsRes = await this.db.runCypher('MATCH ()-[r]->() RETURN r');
        
        let allNodes = await nodesRes.getAll();
        let allRels = await relsRes.getAll();
        
        // Filter by workspace if provided
        if (workspace) {
          const normWorkspace = workspace.replace(/\\/g, '/');
          allNodes = allNodes.filter((r: any) => {
            const row = r['n'];
            if (row._label === 'File') {
              return row.path.replace(/\\/g, '/').startsWith(normWorkspace);
            }
            if (row._label === 'Symbol') {
              return row.id.replace(/\\/g, '/').startsWith(normWorkspace);
            }
            if (row._label === 'Chunk') {
              return row.id.replace(/\\/g, '/').startsWith(`chunk:${normWorkspace}`);
            }
            return false;
          });

          // Create a set of valid node offsets for quick edge filtering
          const validNodeOffsets = new Set(allNodes.map((r: any) => r['n']._id.offset.toString()));

          allRels = allRels.filter((r: any) => {
            return validNodeOffsets.has(r['r']._src.offset.toString()) && 
                   validNodeOffsets.has(r['r']._dst.offset.toString());
          });
        }

        const chunks = allNodes.filter((r: any) => r['n']._label === 'Chunk');
        const describesRels = allRels.filter((r: any) => r['r']._label === 'DESCRIBES');
        
        const docMap = new Map();
        for (const rel of describesRels) {
            const chunkId = rel['r']._src.offset.toString();
            const symbolId = rel['r']._dst.offset.toString();
            const chunk = chunks.find((c: any) => c['n']._id.offset.toString() === chunkId);
            if (chunk) {
              docMap.set(symbolId, chunk['n'].doc);
            }
        }

        const nodes = allNodes.filter((row: any) => row['n']._label !== 'Chunk').map((row: any) => {
          const id = row['n']._id?.offset.toString() || row['n'].id || row['n'].path;
          return {
            id,
            type: 'customNode',
            data: {
              label: row['n'].name || row['n'].path || row['n'].text?.substring(0, 20),
              type: row['n']._label,
              properties: { ...row['n'], doc: docMap.get(id) }
            }
          };
        });

        const edges = allRels.filter((row: any) => row['r']._label !== 'DESCRIBES').map((row: any) => ({
          id: `e-${row['r']._src.offset}-${row['r']._dst.offset}`,
          source: row['r']._src.offset.toString(),
          target: row['r']._dst.offset.toString(),
          label: row['r']._label
        }));

        res.json({ nodes, edges });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post('/api/search', async (req, res) => {
      try {
        const { query } = req.body;
        const results = await this.rag.search(query);
        res.json(results);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }

  public listen(port: number = 9000) {
    this.app.listen(port, () => {
      console.error(`GraphHub API Server running on http://localhost:${port}`);
    });
  }
}
