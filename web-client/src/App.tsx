import { useEffect, useRef, useState } from 'react';
import { 
  Play, 
  Square, 
  Video, 
  Terminal, 
  Share2, 
  ExternalLink,
  Zap,
  Sparkles,
  Volume2
} from 'lucide-react';
import audioService from './services/audioService';

interface LedgerEntry {
  id: string;
  timestamp: string;
  agentName: string;
  message: string;
}

type EngineState = 'DISCONNECTED' | 'CONNECTED' | 'STREAMING' | 'BARGE_IN_FREEZE' | 'CREATIVE_PROCESSING';

export default function App() {
  const [runtimeState, setRuntimeState] = useState<EngineState>('DISCONNECTED');
  const [adUrl, setAdUrl] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [sessionId] = useState<string>(() => `session_${Date.now()}`);

  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ledgerEndRef = useRef<HTMLDivElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  // Setup video stream on component load
  useEffect(() => {
    enableCamera();
    return () => {
      disableCamera();
      disconnectSession();
    };
  }, []);

  // Auto-scroll ledger to bottom when new entries arrive
  useEffect(() => {
    ledgerEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ledger]);

  const enableCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error('[Web Viewfinder] Camera access failed:', err);
      appendLedger('System Controller', 'Viewfinder camera permission denied.');
    }
  };

  const disableCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  const appendLedger = (agentName: string, message: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLedger(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: time,
        agentName,
        message
      }
    ]);
  };

  const initializeSession = () => {
    disconnectSession();
    setRuntimeState('CONNECTED');
    setLedger([]);
    setAdUrl(null);

    appendLedger('Meta Orchestrator', 'Initializing Live Agent WebSocket session...');
    const ws = new WebSocket('ws://localhost:50051');
    wsRef.current = ws;

    ws.onopen = () => {
      appendLedger('Meta Orchestrator', 'WebSocket Gateway link active.');
      // Send session init signal
      ws.send(
        JSON.stringify({
          type: 'INIT_SESSION',
          sessionId: sessionId
        })
      );
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'STATE_MUTATION':
            setRuntimeState(message.state);
            appendLedger('System Gateway', `Transitioned to state: ${message.state}`);

            if (message.state === 'BARGE_IN_FREEZE') {
              audioService.flushPlayback();
              appendLedger('Voice Engine', 'User Barge-In detected. Clearing audio play buffers instantly.');
              // Reset back to streaming shortly
              setTimeout(() => {
                setRuntimeState('STREAMING');
              }, 1500);
            }
            break;

          case 'AUDIO_OUTPUT':
            if (message.audio) {
              audioService.playChunk(message.audio);
            }
            break;

          case 'AD_PREVIEW':
            if (message.url) {
              setAdUrl(message.url);
              setRuntimeState('CREATIVE_PROCESSING');
              appendLedger('Creative Director', `New dynamic ad asset compiled: ${message.url}`);
            }
            break;

          case 'AGENT_LOG':
            if (message.agentName && message.executionLog) {
              appendLedger(message.agentName, message.executionLog);
            }
            break;
        }
      } catch (err) {
        console.error('[Web App] WebSocket message error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[Web App] WebSocket connection error:', err);
      appendLedger('System Gateway', 'WebSocket error encountered.');
      setRuntimeState('DISCONNECTED');
    };

    ws.onclose = () => {
      appendLedger('Meta Orchestrator', 'WebSocket session closed.');
      setRuntimeState('DISCONNECTED');
    };
  };

  const disconnectSession = () => {
    audioService.stopRecording();
    audioService.flushPlayback();

    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'USER_CANCEL' }));
      } catch (e) {}
      wsRef.current.close();
      wsRef.current = null;
    }
    setRuntimeState('DISCONNECTED');
  };

  const toggleStream = async () => {
    if (runtimeState === 'DISCONNECTED') {
      initializeSession();
    } else {
      disconnectSession();
    }
  };

  // Capture video frame at 1 FPS and stream to backend
  useEffect(() => {
    if (runtimeState !== 'STREAMING' || !cameraActive) return;

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Draw video frame to hidden canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Export as base64 JPEG
          const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
          
          wsRef.current.send(
            JSON.stringify({
              type: 'VIDEO_INPUT',
              image: base64Image
            })
          );
        }
      }
    }, 1000); // 1 FPS

    return () => clearInterval(interval);
  }, [runtimeState, cameraActive]);

  // Start microphone recording when streaming
  useEffect(() => {
    if (runtimeState === 'STREAMING') {
      audioService.startRecording((chunk: string) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'AUDIO_INPUT',
              audio: chunk
            })
          );
        }
      });
      appendLedger('Voice Controller', 'Local microphone stream open (16kHz PCM).');
    } else if (runtimeState !== 'BARGE_IN_FREEZE') {
      audioService.stopRecording();
    }
  }, [runtimeState]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      {/* Top Header Navigation bar */}
      <header className="glass" style={{ margin: '16px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: runtimeState === 'STREAMING' ? '#06b6d4' : runtimeState === 'BARGE_IN_FREEZE' ? '#ef4444' : '#64748b', boxShadow: runtimeState === 'STREAMING' ? '0 0 10px #06b6d4' : 'none' }}></div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.5px', margin: 0 }}>BHARATFLOW ENGINE</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
            STATUS: <span style={{ color: runtimeState === 'STREAMING' ? 'var(--color-cyan)' : runtimeState === 'BARGE_IN_FREEZE' ? 'var(--color-red)' : 'var(--text-muted)' }}>{runtimeState}</span>
          </span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px', padding: '0 16px 16px', overflow: 'hidden' }}>
        
        {/* Left Side: Live Spatial Viewport Camera Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
          <div 
            className={`glass-dark ${runtimeState === 'STREAMING' ? 'active-viewport' : runtimeState === 'BARGE_IN_FREEZE' ? 'barge-in-viewport' : ''}`}
            style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Native HTML5 Video Element representing camera viewport */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />

            {/* Hidden canvas for capturing video frames */}
            <canvas ref={canvasRef} width="640" height="480" style={{ display: 'none' }} />

            {/* Neon Scanning line when active */}
            {runtimeState === 'STREAMING' && <div className="scanner" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />}

            {/* Viewport UI Overlays */}
            <div style={{ position: 'absolute', top: '20px', left: '20px', display: 'flex', gap: '10px' }}>
              <span className="glass" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                <Video size={12} color="#06b6d4" />
                SPATIAL VIEWPORT ACTIVE (1 FPS)
              </span>
              {runtimeState === 'STREAMING' && (
                <span className="glass" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <Volume2 size={12} color="#06b6d4" />
                  AUDIO FEED BACKEND
                </span>
              )}
            </div>

            {/* Barge-In Interruption Neon Overlay Flash */}
            {runtimeState === 'BARGE_IN_FREEZE' && (
              <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(239, 68, 68, 0.15)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', animation: 'pulse 1s infinite' }}>
                <Zap size={64} color="var(--color-red)" style={{ filter: 'drop-shadow(0 0 15px var(--color-red))', marginBottom: '16px' }} />
                <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-red)', letterSpacing: '2px', textShadow: '0 0 10px rgba(239,68,68,0.5)' }}>
                  USER INTERRUPT / BARGE-IN
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  Flushing audio channels and updating instructions...
                </span>
              </div>
            )}

            {/* Empty camera prompt */}
            {!cameraActive && (
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <Video size={48} color="var(--text-muted)" />
                <button onClick={enableCamera} className="glass" style={{ padding: '10px 20px', color: '#fff', cursor: 'pointer' }}>
                  Enable Viewfinder Camera
                </button>
              </div>
            )}

            {/* Overlay Status Bar */}
            <div style={{ position: 'absolute', bottom: '24px', left: '24px', right: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="glass" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '16px', border: '1px solid rgba(255,255,255,0.15)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Active Agent Node:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: runtimeState === 'STREAMING' ? '#10b981' : '#64748b' }}></div>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>
                    {runtimeState === 'STREAMING' ? 'Gemini 3.1 Live Engine' : 'Idle'}
                  </span>
                </div>
              </div>

              {/* Dynamic waveform simulation */}
              {runtimeState === 'STREAMING' && (
                <div className="glass" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <div className="wave-bar" style={{ animationDelay: '0.1s' }}></div>
                  <div className="wave-bar" style={{ animationDelay: '0.3s' }}></div>
                  <div className="wave-bar" style={{ animationDelay: '0.5s' }}></div>
                  <div className="wave-bar" style={{ animationDelay: '0.2s' }}></div>
                  <div className="wave-bar" style={{ animationDelay: '0.4s' }}></div>
                </div>
              )}
            </div>
          </div>

          {/* Action Session Controller bar */}
          <div className="glass" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Full-Duplex Bridge Gateway
              </span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {runtimeState === 'DISCONNECTED' ? 'Ready to initiate session.' : 'Voice connection active.'}
              </span>
            </div>

            <button 
              onClick={toggleStream} 
              className="glass" 
              style={{
                padding: '12px 28px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                backgroundColor: runtimeState !== 'DISCONNECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                borderColor: runtimeState !== 'DISCONNECTED' ? 'var(--color-red)' : 'var(--color-cyan)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              {runtimeState !== 'DISCONNECTED' ? (
                <>
                  <Square size={16} fill="#fff" />
                  Disconnect Session
                </>
              ) : (
                <>
                  <Play size={16} fill="#fff" />
                  Initialize Agent Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side Column: Swarm agentic thoughts and outputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Box 1: Handoff Ledger (Agent Swarm Activity Log) */}
          <div className="glass-dark" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Terminal size={18} color="var(--color-cyan)" />
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', letterSpacing: '-0.3px', margin: 0 }}>
                Antigravity Agentic Ledger
              </h2>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {ledger.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                  <Sparkles size={24} />
                  <span style={{ fontSize: '13px' }}>Swarm logs will display here once session starts.</span>
                </div>
              ) : (
                ledger.map((entry) => (
                  <div key={entry.id} className="glass" style={{ padding: '10px 14px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: entry.agentName.includes('Geo') ? 'var(--color-cyan)' : entry.agentName.includes('Archivist') ? 'var(--color-purple)' : '#10b981', textTransform: 'uppercase' }}>
                        {entry.agentName}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {entry.timestamp}
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {entry.message}
                    </p>
                  </div>
                ))
              )}
              <div ref={ledgerEndRef} />
            </div>
          </div>

          {/* Box 2: Creative preview output when generated */}
          {adUrl && (
            <div className="glass-dark" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="var(--color-purple)" />
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Generated Creative</h2>
                </div>
                <span style={{ fontSize: '10px', backgroundColor: 'rgba(168, 85, 247, 0.2)', color: 'var(--color-purple)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  ACTIVE PREVIEW
                </span>
              </div>

              {/* Creative display container */}
              <div className="glass" style={{ width: '100%', height: '240px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', position: 'relative' }}>
                {adUrl.endsWith('.mp4') ? (
                  <video src={adUrl} autoPlay loop muted controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <img src={adUrl} alt="Generated Creative preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
              </div>

              {/* Dispatch trigger buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <a 
                  href={`https://wa.me/?text=${encodeURIComponent('Check out this new ad listing: ' + adUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="glass" 
                  style={{
                    padding: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderColor: 'rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <Share2 size={14} />
                  WhatsApp
                </a>
                <button 
                  onClick={() => window.open(adUrl, '_blank')}
                  className="glass" 
                  style={{
                    padding: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <ExternalLink size={14} />
                  View Original
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
