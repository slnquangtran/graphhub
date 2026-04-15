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
import { Search, Code, FileCode, Layers, BookOpen, Home, Lightbulb, Zap, ArrowRight, ArrowLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const CustomNode = ({ data, selected }: any) => {
  return (
    <div className={`custom-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span className={`node-chip ${data.type}`}>{data.type}</span>
        <span className="node-label">{data.label}</span>
      </div>
      {data.properties.purpose && (
        <div className="node-doc" style={{ borderLeftColor: '#fbbf24' }}>
          {data.properties.purpose}
        </div>
      )}
      {!data.properties.purpose && data.properties.doc && (
        <div className="node-doc">
          {data.properties.doc.length > 100 ? data.properties.doc.substring(0, 100) + '...' : data.properties.doc}
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
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 240, height: 80 });
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
      x: nodeWithPosition.x - 120,
      y: nodeWithPosition.y - 40,
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
          style: {
            stroke: e.label === 'IMPORTS' ? '#0071e3' : e.label === 'CALLS' ? '#34d399' : '#fbbf24',
            strokeWidth: 1.5
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: e.label === 'IMPORTS' ? '#0071e3' : e.label === 'CALLS' ? '#34d399' : '#fbbf24',
            width: 16,
            height: 16
          }
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

      const highlightedIds = results.map((r: any) => r.symbolName);
      setNodes((nds) => nds.map((n) => ({
        ...n,
        style: {
          ...n.style,
          border: highlightedIds.includes(n.data.label) ? '2px solid #0071e3' : undefined,
          boxShadow: highlightedIds.includes(n.data.label) ? '0 0 0 2px #0071e3' : undefined
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
        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#0071e3',
            fontSize: '17px',
            fontWeight: 500
          }}>
            Loading Graph...
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          style={{ background: '#000000' }}
        >
          <Background color="#1a1a1a" gap={32} size={1} />
          <Controls />
          <MiniMap
            nodeStrokeColor="#0071e3"
            nodeColor="#272729"
            maskColor="rgba(0, 0, 0, 0.7)"
          />
        </ReactFlow>
      </div>

      <div className="sidebar">
        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1>
              {workspace ? workspace.split(/[/\\]/).filter(Boolean).pop() : 'GraphHub'}
            </h1>
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.56)',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Return to Home"
            >
              <Home size={18} />
            </button>
          </div>
          <p>Code Intelligence Explorer</p>
        </div>

        <form className="search-box" onSubmit={handleSearch}>
          <Search size={18} color="#0071e3" />
          <input
            placeholder="Search code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>

        <div className="details-panel">
          {selectedNode ? (
            <div>
              <span className={`node-chip ${selectedNode.data.type}`}>{selectedNode.data.type}</span>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '21px',
                fontWeight: 600,
                margin: '0 0 12px 0',
                lineHeight: 1.19
              }}>
                {selectedNode.data.label}
              </h2>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.56)'
              }}>
                <FileCode size={14} />
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {selectedNode.data.properties.path || selectedNode.data.properties.id?.split(':')[0]?.split('/').pop() || 'Symbol'}
                </span>
              </div>

              {selectedNode.data.properties.purpose && (
                <div className="doc-section" style={{ borderLeftColor: '#fbbf24' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Lightbulb size={14} color="#fbbf24" />
                    <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Purpose</strong>
                  </div>
                  {selectedNode.data.properties.purpose}
                </div>
              )}

              {selectedNode.data.properties.strategy && (
                <div className="doc-section" style={{ borderLeftColor: '#a855f7', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Zap size={14} color="#a855f7" />
                    <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strategy</strong>
                  </div>
                  {selectedNode.data.properties.strategy}
                </div>
              )}

              {(selectedNode.data.properties.inputs?.length > 0 || selectedNode.data.properties.outputs?.length > 0) && (
                <div style={{ marginTop: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {selectedNode.data.properties.inputs?.length > 0 && (
                    <div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        fontSize: '12px',
                        color: 'rgba(255, 255, 255, 0.56)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        <ArrowRight size={12} />
                        <strong>Inputs</strong>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {selectedNode.data.properties.inputs.map((i: string, idx: number) => (
                          <span key={idx} style={{
                            background: 'rgba(34, 197, 94, 0.15)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            color: '#34d399'
                          }}>{i}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedNode.data.properties.outputs?.length > 0 && (
                    <div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        fontSize: '12px',
                        color: 'rgba(255, 255, 255, 0.56)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        <ArrowLeft size={12} />
                        <strong>Outputs</strong>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {selectedNode.data.properties.outputs.map((o: string, idx: number) => (
                          <span key={idx} style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            color: '#60a5fa'
                          }}>{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedNode.data.properties.doc && (
                <div className="doc-section" style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <BookOpen size={14} />
                    <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Documentation</strong>
                  </div>
                  {selectedNode.data.properties.doc}
                </div>
              )}

              {selectedNode.data.properties.calls && selectedNode.data.properties.calls.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.56)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    <Layers size={12} />
                    <strong>Calls</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedNode.data.properties.calls.map((c: string, idx: number) => (
                      <span key={idx} style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <ChevronRight size={10} />
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.32)',
              marginTop: '80px'
            }}>
              <Code size={56} strokeWidth={1} style={{ marginBottom: '24px' }} />
              <p style={{ fontSize: '17px', lineHeight: 1.47 }}>
                Select a node to explore<br />its purpose and connections
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Explorer;
