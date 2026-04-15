import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderGit2, Play, Code, Layers } from 'lucide-react';
import '../App.css';

const Home = () => {
  const [targetDir, setTargetDir] = useState('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch('http://localhost:9000/api/workspaces');
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
    } catch (err) {
      console.error('Failed to fetch workspaces', err);
    }
  };

  const handleIndexSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDir.trim()) return;

    setIsIndexing(true);
    try {
      const res = await fetch('http://localhost:9000/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir: targetDir.trim() })
      });

      if (res.ok) {
        navigate(`/explorer?workspace=${encodeURIComponent(targetDir.trim())}`);
      } else {
        const error = await res.json();
        alert(`Indexing failed: ${error.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to GraphHub API.');
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="home-container">
      <div className="home-hero">
        <Layers size={56} color="#0071e3" strokeWidth={1.5} style={{ marginBottom: 24 }} />
        <h1>GraphHub</h1>
        <p>
          Transform any codebase into an interactive knowledge graph.
          Understand architecture, trace execution flows, and navigate with clarity.
        </p>
      </div>

      <div className="home-card">
        <h2>
          <FolderGit2 size={20} color="#0071e3" />
          Index a Codebase
        </h2>

        <form onSubmit={handleIndexSubmit}>
          <div>
            <label>Directory Path</label>
            <input
              type="text"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder="C:\Projects\my-app"
              disabled={isIndexing}
            />
          </div>

          <button type="submit" disabled={isIndexing || !targetDir.trim()}>
            {isIndexing ? (
              <>Indexing...</>
            ) : (
              <>
                <Play size={18} />
                Index & Explore
              </>
            )}
          </button>
        </form>

        {workspaces.length > 0 && (
          <div className="workspaces-section">
            <h3>Indexed Workspaces</h3>
            {workspaces.map((ws, i) => (
              <div
                key={i}
                className="workspace-item"
                onClick={() => navigate(`/explorer?workspace=${encodeURIComponent(ws)}`)}
              >
                <Code size={16} color="#0071e3" />
                {ws.split(/[/\\]/).filter(Boolean).slice(-2).join('/')}
              </div>
            ))}
            <button
              className="btn-outline"
              onClick={() => navigate('/explorer')}
            >
              Open Full Explorer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
