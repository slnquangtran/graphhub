import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import '../App.css';
import { Search, Code, FileCode, Layers, BookOpen, Home } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const CustomNode = ({ data, selected }: any) => {
  return (
    <div className={`custom-node ${data.type} ${selected ? 'selected' : ''}`} style={{
      ...data.style,
      background: '#252525',
      padding: '12px',
      borderRadius: '8px',
      border: selected ? '2px solid var(--primary-color)' : '1px solid rgba(255, 255, 255, 0.1)',
      color: 'white',
      minWidth: '200px',
      maxWidth: '350px',
      boxShadow: selected ? '0 0 20px rgba(0, 255, 204, 0.5)' : '0 4px 15px rgba(0, 0, 0, 0.5)',
      transition: 'all 0.2s ease'
    }}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div className={`node-chip ${data.type}`}>{data.type}</div>
        <div style={{ fontWeight: 600, fontSize: '14px', wordBreak: 'break-all' }}>{data.label}</div>
      </div>
      {data.properties.doc && (
        <div style={{ 
          fontSize: '12px', 
          color: 'var(--text-secondary)',
          background: 'rgba(0,0,0,0.3)',
          padding: '8px',
          borderRadius: '4px',
          borderLeft: '2px solid var(--primary-color)',
          marginTop: '8px',
          lineHeight: '1.4'
        }}>
          {data.properties.doc}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 150, height: 50 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    node.position = {
      x: nodeWithPosition.x - 75,
      y: nodeWithPosition.y - 25,
    };

    return node;
  });

  return { nodes, edges };
};

function Explorer() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const workspace = searchParams.get('workspace');
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchGraph = async () => {
    try {
      setLoading(true);
      const url = workspace ? `http://localhost:9000/api/graph?workspace=${encodeURIComponent(workspace)}` : 'http://localhost:9000/api/graph';
      const res = await fetch(url);
      const data = await res.json();
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        data.nodes,
        data.edges.map((e: any) => ({
          ...e,
          animated: e.label === 'CALLS',
          style: { stroke: e.label === 'IMPORTS' ? '#3b82f6' : e.label === 'CALLS' ? '#10b981' : '#f59e0b' },
          markerEnd: { type: MarkerType.ArrowClosed, color: e.label === 'IMPORTS' ? '#3b82f6' : e.label === 'CALLS' ? '#10b981' : '#f59e0b' }
        }))
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      console.error('Failed to fetch graph:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, []);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNode(node);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    try {
      const res = await fetch('http://localhost:9000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      const results = await res.json();
      
      // Highlight matching nodes
      const highlightedIds = results.map((r: any) => r.symbolName);
      setNodes((nds) => nds.map((n) => ({
        ...n,
        style: {
          ...n.style,
          border: highlightedIds.includes(n.label) ? '2px solid #00ffcc' : '1px solid rgba(255,170,0,0.1)',
          boxShadow: highlightedIds.includes(n.label) ? '0 0 15px #00ffcc' : 'none'
        }
      })));
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const nodeTypes = useMemo(() => ({ customNode: CustomNode }), []);

  return (
    <div className="dashboard-container">
      <div className="graph-canvas">
        {loading && <div style={{position: 'absolute', top: '50%', left: '50%', color: '#00ffcc'}}>Loading Graph...</div>}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background color="#1a1a1a" gap={20} />
          <Controls />
          <MiniMap nodeStrokeColor="#00ffcc" nodeColor="#1a1a1a" maskColor="rgba(0,0,0,0.5)" />
        </ReactFlow>
      </div>

      <div className="sidebar">
        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: '20px', margin: 0 }}>
              GraphHub Explorer {workspace && <span style={{fontSize: '12px', color: '#00ffcc', display: 'block'}}>{workspace.split(/[/\\]/).filter(Boolean).pop()}</span>}
            </h1>
            <button 
              onClick={() => navigate('/')} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '5px' }}
              title="Return to Home"
            >
              <Home size={18} />
            </button>
          </div>
          <p style={{color: 'var(--text-secondary)', fontSize: '12px'}}>Local Code Intelligence</p>
        </div>

        <form className="search-box" onSubmit={handleSearch}>
          <Search size={18} color="#00ffcc" />
          <input 
            placeholder="Semantic Search..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>

        <div className="details-panel">
          {selectedNode ? (
            <div>
              <div className={`node-chip ${selectedNode.data.type}`}>{selectedNode.data.type}</div>
              <h2 style={{margin: '0 0 10px 0', fontSize: '18px'}}>{selectedNode.data.label}</h2>
              
              <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                <FileCode size={16} /> <span style={{fontSize: '12px'}}>{selectedNode.data.properties.path || 'Symbol'}</span>
              </div>

              {selectedNode.data.properties.doc && (
                <div className="doc-section">
                  <div style={{display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px'}}>
                    <BookOpen size={14} /> <strong>Documentation</strong>
                  </div>
                  {selectedNode.data.properties.doc}
                </div>
              )}

              {selectedNode.data.properties.calls && selectedNode.data.properties.calls.length > 0 && (
                <div style={{marginTop: '20px'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px'}}>
                    <Layers size={14} /> <strong>Outbound Calls</strong>
                  </div>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px'}}>
                    {selectedNode.data.properties.calls.map((c: string) => (
                      <span key={c} style={{background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px'}}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{textAlign: 'center', color: 'var(--text-secondary)', marginTop: '50px'}}>
              <Code size={48} style={{opacity: 0.2, marginBottom: '20px'}} />
              <p>Select a node to see its details and dependencies</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Explorer;
