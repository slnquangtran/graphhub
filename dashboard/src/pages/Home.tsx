import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderGit2, Play, Search, Code, LayoutDashboard } from 'lucide-react';

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
    <div className="home-container" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #111 0%, #1a1a2e 100%)',
      color: 'white',
      padding: '20px'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <LayoutDashboard size={64} color="#00ffcc" style={{ marginBottom: '20px' }} />
        <h1 style={{ fontSize: '48px', margin: '0 0 10px 0', letterSpacing: '-1px' }}>GraphHub</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '18px', maxWidth: '600px', lineHeight: '1.5' }}>
          Instantly transform any local codebase into an interactive knowledge graph. 
          Understand architecture, dependencies, and trace execution flows.
        </p>
      </div>

      <div style={{ 
        background: 'rgba(255, 255, 255, 0.03)', 
        border: '1px solid rgba(255, 255, 255, 0.1)', 
        borderRadius: '16px', 
        padding: '40px',
        width: '100%',
        maxWidth: '500px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
      }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', margin: '0 0 20px 0' }}>
          <FolderGit2 color="#00ffcc" /> Add Local Codebase
        </h2>

        <form onSubmit={handleIndexSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Absolute Directory Path
            </label>
            <input 
              type="text" 
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder="C:\Projects\my-app"
              disabled={isIndexing}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '16px',
                outline: 'none',
                transition: 'border 0.2s',
                fontFamily: 'monospace'
              }}
            />
          </div>

          <button 
            type="submit" 
            disabled={isIndexing || !targetDir.trim()}
            style={{
              background: isIndexing ? '#333' : '#00ffcc',
              color: isIndexing ? '#888' : '#000',
              border: 'none',
              padding: '14px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: isIndexing || !targetDir.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'all 0.2s'
            }}
          >
            {isIndexing ? (
              <>Indexing Codebase... This may take a minute.</>
            ) : (
              <><Play size={18} /> Connect & Index</>
            )}
          </button>
        </form>

        {workspaces.length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 15px 0' }}>
              Indexed Workspaces
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {workspaces.map((ws, i) => (
                <div 
                  key={i} 
                  onClick={() => navigate(`/explorer?workspace=${encodeURIComponent(ws)}`)}
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    color: '#ccc'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#00ffcc'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
                >
                  <Code size={14} color="#00ffcc" /> {ws}
                </div>
              ))}
            </div>
            <button 
              onClick={() => navigate('/explorer')}
              style={{
                background: 'transparent',
                border: '1px solid rgba(0, 255, 204, 0.5)',
                color: '#00ffcc',
                padding: '10px',
                borderRadius: '8px',
                width: '100%',
                marginTop: '15px',
                cursor: 'pointer'
              }}
            >
              Open Global Explorer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
