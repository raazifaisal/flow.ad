import { useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Phone,
  Settings, AlignLeft, Sparkles, Send, X, Zap,
  Info, Share2, ExternalLink, Plus
} from 'lucide-react';
import audioService from './services/audioService';

/* ─── Types ─────────────────────────────────────────────── */
interface LedgerEntry { id: string; agentName: string; message: string; timestamp: string; }
interface ChatMsg { id: string; sender: 'user' | 'ai'; text: string; gallery?: string[]; }
type State = 'IDLE' | 'CONNECTING' | 'STREAMING' | 'BARGE_IN';

/* ─── Vibe Templates ────────────────────────────────────── */
const VIBES = [
  { id: 'default', emoji: '✨', name: 'Default Vibe', event: 'Local Bazaar', trigger: 'Sunny afternoon', slang: 'Boss, Guru, Macha', copy: 'Quality sweet treats & bakery specials. Order now!' },
  { id: 'midnight', emoji: '🌙', name: 'Midnight Bites', event: 'Late Night Food Crawl', trigger: 'Cool midnight breeze', slang: 'Macha, Da, Semma', copy: 'Hungry at midnight? 🍔 Grab our fresh hot rolls!' },
  { id: 'monsoon', emoji: '🌧️', name: 'Monsoon Special', event: 'Sudden Monsoon', trigger: 'Cold monsoon rain', slang: 'Gethu, Machan', copy: 'Cozy rains call for hot cakes & filter coffee! ☕' },
  { id: 'bakery', emoji: '🍰', name: 'Bakery Fresh', event: 'Weekend Patisserie', trigger: 'Breezy sweet scent', slang: 'Macha, Boss', copy: 'Signature croissants & fruit cakes. Indulge now! 🥐' },
  { id: 'ipl', emoji: '🏏', name: 'IPL Hype', event: 'IPL Screening Match', trigger: 'Hot match night', slang: 'Semma, Gethu', copy: 'Sweeten the victory! Cupcakes in 15 mins! 🏏' },
];

export default function App() {
  /* ── State ───────────────────────────────────────────── */
  const [connState, setConnState] = useState<State>('IDLE');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [vibeIdx, setVibeIdx] = useState(0);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  /* Modals */
  const [logsOpen, setLogsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* Data */
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { id: 'm0', sender: 'user', text: 'Generate an ad for tonight — closest bakery to my location.' },
    {
      id: 'm1', sender: 'ai', text: "I found great options near you! Here's a quick ad preview:", gallery: [
        'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=200&q=60',
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&q=60',
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=200&q=60',
      ]
    },
    { id: 'm2', sender: 'user', text: 'Make it more festive for IPL night.' },
    { id: 'm3', sender: 'ai', text: 'Done! Swarm synced to IPL Hype vibe 🏏 — copy updated with local slang for your neighbourhood.' },
  ]);
  const [logs, setLogs] = useState<LedgerEntry[]>([]);
  const [profile, setProfile] = useState({
    businessName: 'zaid patisserie',
    merchantLocation: 'Dairy Circle, Bengaluru',
    businessCategory: 'Bakery and Cake Shop',
  });
  const [manifest, setManifest] = useState({
    local_event: VIBES[0].event,
    environmental_trigger: VIBES[0].trigger,
    neighborhood_slangs: VIBES[0].slang,
    recommended_copy_strategy: VIBES[0].copy,
  });

  /* Refs */
  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const feedEnd = useRef<HTMLDivElement>(null);
  const sessionId = useRef(`s_${Date.now()}`);

  /* ── Auto scroll ─────────────────────────────────────── */
  useEffect(() => { feedEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, typing]);

  /* ── Camera ──────────────────────────────────────────── */
  useEffect(() => {
    if (camOn) startCam(); else stopCam();
    return stopCam;
  }, [camOn]);

  const startCam = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamOn(false);
      setPermError('Camera requires HTTPS. Open the ngrok https:// URL on your phone.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (videoRef.current) videoRef.current.srcObject = s;
      setPermError(null);
    } catch (err: any) {
      setCamOn(false);
      if (err.name === 'NotAllowedError')
        setPermError('Camera access denied. Allow camera in your browser settings.');
      else if (err.name === 'NotFoundError')
        setPermError('No camera found on this device.');
      else
        setPermError('Camera error: ' + err.message);
    }
  };
  const stopCam = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  /* ── Log helper ──────────────────────────────────────── */
  const addLog = (agentName: string, message: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(p => [...p, { id: Math.random().toString(36).slice(2), agentName, message, timestamp: ts }]);
  };

  const checkMediaSupport = (): boolean => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermError('Microphone requires HTTPS. Open the ngrok https:// URL on your phone.');
      return false;
    }
    return true;
  };

  /* ── WebSocket ───────────────────────────────────────── */
  const startSession = () => {
    if (!checkMediaSupport()) return;
    if (wsRef.current) endSession();
    setConnState('CONNECTING');
    addLog('Meta Orchestrator', 'Connecting to Twin-Plane Gateway...');
    const wsUrl = `ws://${window.location.hostname}:50051`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnState('STREAMING');
      addLog('Gateway', 'Connected. Broadcasting context matrices...');
      ws.send(JSON.stringify({ type: 'INIT_SESSION', sessionId: sessionId.current, businessProfile: profile }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'AUDIO_OUTPUT' && msg.audio) {
          audioService.playChunk(msg.audio);
        } else if (msg.type === 'STATE_MUTATION') {
          if (msg.state === 'BARGE_IN_FREEZE') {
            setConnState('BARGE_IN');
            audioService.flushPlayback();
            setTimeout(() => setConnState('STREAMING'), 1500);
          } else setConnState(msg.state === 'STREAMING' ? 'STREAMING' : 'IDLE');
          addLog('System Gateway', `State → ${msg.state}`);
        } else if (msg.type === 'MANIFEST_UPDATED' && msg.manifest) {
          setManifest(msg.manifest);
          setMsgs(p => [...p, {
            id: `ai_${Date.now()}`, sender: 'ai',
            text: `Swarm synced! Copy: "${msg.manifest.recommended_copy_strategy}"`
          }]);
          addLog('Swarm Coordinator', 'Manifest synchronized.');
        } else if (msg.type === 'AGENT_LOG' && msg.agentName) {
          addLog(msg.agentName, msg.executionLog);
        } else if (msg.type === 'AD_PREVIEW') {
          setTyping(false);
          const gallery = msg.stillUrl ? [msg.stillUrl, ...(msg.keyframes || [])] : (msg.url ? [msg.url] : []);
          setMsgs(p => [
            ...p,
            {
              id: `ai_preview_${Date.now()}`,
              sender: 'ai',
              text: `Creative assets compiled! High-resolution Still (1:1) and Cinematic vertical (9:16) storyboard frames are ready for review.`,
              gallery: gallery
            }
          ]);
          addLog('Creative Director', `New dynamic ad assets compiled successfully.`);
        }
      } catch { }
    };
    ws.onerror = () => { setConnState('IDLE'); addLog('System', 'WebSocket error.'); };
    ws.onclose = () => { setConnState('IDLE'); addLog('System', 'Session closed.'); };
  };

  const endSession = () => {
    audioService.stopRecording();
    audioService.flushPlayback();
    try { wsRef.current?.send(JSON.stringify({ type: 'USER_CANCEL' })); } catch { }
    wsRef.current?.close();
    wsRef.current = null;
    setConnState('IDLE');
  };

  /* ── Mic ─────────────────────────────────────────────── */
  useEffect(() => {
    if (connState === 'STREAMING' && micOn) {
      (async () => {
        try {
          await audioService.startRecording((chunk: string) => {
            if (wsRef.current?.readyState === WebSocket.OPEN)
              wsRef.current.send(JSON.stringify({ type: 'AUDIO_INPUT', audio: chunk }));
          });
          setPermError(null);
        } catch (err: any) {
          // Surface the error in the UI banner
          if (err.name === 'InsecureContextError') {
            setPermError('Microphone requires HTTPS. Open the https:// URL on your phone (accept the certificate warning).');
          } else if (err.name === 'NotAllowedError') {
            setPermError('Microphone access denied. Tap the 🔒 icon in your browser address bar and allow Microphone.');
          } else if (err.name === 'NotFoundError') {
            setPermError('No microphone found on this device.');
          } else {
            setPermError('Microphone error: ' + (err.message || err.name));
          }
          setMicOn(false);
          endSession();
        }
      })();
    } else {
      audioService.stopRecording();
    }
  }, [connState, micOn]);


  /* ── Video frames ────────────────────────────────────── */
  useEffect(() => {
    if (connState !== 'STREAMING' || !camOn) return;
    const iv = setInterval(() => {
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c || wsRef.current?.readyState !== WebSocket.OPEN) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      wsRef.current.send(JSON.stringify({ type: 'VIDEO_INPUT', image: c.toDataURL('image/jpeg', 0.6).split(',')[1] }));
    }, 1000);
    return () => clearInterval(iv);
  }, [connState, camOn]);

  /* ── Vibe select ─────────────────────────────────────── */
  const selectVibe = (i: number) => {
    setVibeIdx(i);
    const v = VIBES[i];
    const m = {
      local_event: v.event, environmental_trigger: v.trigger,
      neighborhood_slangs: v.slang, recommended_copy_strategy: v.copy
    };
    setManifest(m);
    setMsgs(p => [...p, {
      id: `ai_${Date.now()}`, sender: 'ai',
      text: `${v.emoji} Vibe shifted to **${v.name}**. New copy: "${v.copy}"`
    }]);
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: 'UPDATE_CONTEXT', manifest: m }));
    addLog('Meta Orchestrator', `Vibe → "${v.name}"`);
  };

  /* ── Send text message ───────────────────────────────── */
  const sendMsg = () => {
    const txt = input.trim();
    if (!txt) return;
    setMsgs(p => [...p, { id: `u_${Date.now()}`, sender: 'user', text: txt }]);
    setInput('');
    setTyping(true);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'TEXT_INPUT', text: txt }));
    } else {
      setTimeout(() => {
        setTyping(false);
        setMsgs(p => [...p, {
          id: `ai_${Date.now()}`, sender: 'ai',
          text: `Got it — "${txt}". Start a live session to sync with the Swarm agents.`
        }]);
      }, 900);
    }
  };

  /* ── Log category ────────────────────────────────────── */
  const logClass = (a: string) =>
    a.includes('Swarm') || a.includes('Creative') ? 'swarm' :
      a.includes('Voice') || a.includes('Audio') ? 'voice' : 'system';

  const isLive = connState !== 'IDLE';
  const isMicLive = isLive && micOn;

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">
            <Sparkles size={16} />
          </div>
          <span className="header-name">flow.ad</span>
        </div>

        <div className="header-right">
          {isLive && (
            <div className="live-badge">
              <span className="live-dot" />
              {connState === 'BARGE_IN' ? 'BARGE-IN' : 'LIVE'}
            </div>
          )}
          <button className="icon-btn" onClick={() => { setSettingsOpen(true); setLogsOpen(false); }} aria-label="Settings">
            <Settings size={18} />
          </button>
          <button className="icon-btn" onClick={() => { setLogsOpen(true); setSettingsOpen(false); }} aria-label="Ledger">
            <AlignLeft size={18} />
          </button>
        </div>
      </header>

      {/* ── Permission error banner ── */}
      {permError && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', background: '#fff7ed',
          borderBottom: '1px solid #fed7aa', fontSize: 12, color: '#92400e', lineHeight: 1.4,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <span style={{ flex: 1 }}>{permError}</span>
          <button onClick={() => setPermError(null)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#92400e', fontSize: 16, padding: 0, lineHeight: 1 }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Chat feed ── */}
      <div className="chat-feed">
        <div className="date-divider"><span>Today</span></div>

        {msgs.map(m => (
          <div key={m.id} className={`bubble-row ${m.sender}`}>
            {m.sender === 'ai' && (
              <div className="ai-avatar"><Sparkles size={12} /></div>
            )}
            {m.sender === 'user' ? (
              <div className="bubble-user">{m.text}</div>
            ) : (
              <div className="bubble-ai">
                {m.gallery && (
                  <div className="bubble-gallery">
                    {m.gallery.map((src, i) => (
                      <img key={i} src={src} className="gallery-img" alt="creative preview" />
                    ))}
                  </div>
                )}
                {m.text}
                {m.gallery && (
                  <button className="bubble-cta">
                    <Zap size={12} /> Open in Ad Studio
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {typing && (
          <div className="bubble-row ai">
            <div className="ai-avatar"><Sparkles size={12} /></div>
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={feedEnd} />
      </div>

      {/* ── Bottom bar ── */}
      <div className="bottom-bar">
        {/* Vibe chips */}
        <div className="chips-row">
          {VIBES.map((v, i) => (
            <button key={v.id} className={`chip ${vibeIdx === i ? 'active' : ''}`} onClick={() => selectVibe(i)}>
              {v.emoji} {v.name}
            </button>
          ))}
        </div>

        {/* Input + controls row */}
        <div className="input-row">
          {/* Media controls */}
          <div className="media-controls">
            {/* Mic */}
            <button
              className={`ctrl ${isMicLive ? 'ctrl-on' : ''}`}
              onClick={() => isLive ? setMicOn(v => !v) : startSession()}
              aria-label={isLive ? 'Toggle mic' : 'Start live'}
              title={isLive ? (micOn ? 'Mute mic' : 'Unmute mic') : 'Start voice session'}
            >
              {isMicLive ? <Mic size={17} /> : <MicOff size={17} />}
            </button>

            {/* Camera */}
            <button
              className={`ctrl ${camOn ? 'ctrl-on' : ''}`}
              onClick={() => setCamOn(v => !v)}
              aria-label="Toggle camera"
              title={camOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {camOn ? <Video size={17} /> : <VideoOff size={17} />}
            </button>

            {/* Call / End */}
            <button
              className={`ctrl ${isLive ? 'ctrl-red' : 'ctrl-live'}`}
              onClick={isLive ? endSession : startSession}
              aria-label={isLive ? 'End session' : 'Start session'}
              title={isLive ? 'End live session' : 'Start live session'}
            >
              {isLive ? <PhoneOff size={18} /> : <Phone size={18} />}
            </button>
          </div>

          {/* Text input */}
          <div className="text-input-wrap">
            <input
              className="text-input"
              placeholder="Message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMsg()}
            />
            <button className={`send-btn ${input.trim() ? 'ready' : ''}`} onClick={sendMsg} aria-label="Send">
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Fullscreen video overlay ── */}
      <div className={`video-overlay ${camOn ? 'open' : ''}`}>
        <button className="video-close" onClick={() => setCamOn(false)} aria-label="Close camera">
          <X size={18} />
        </button>
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} width={640} height={480} style={{ display: 'none' }} />
        <div className="video-overlay-bar">
          <button
            className={`vid-ctrl ${micOn ? 'vid-ctrl-default' : 'vid-ctrl-muted'}`}
            onClick={() => setMicOn(v => !v)}
            aria-label="Toggle mic"
          >
            {micOn ? <Mic size={22} color="#fff" /> : <MicOff size={22} />}
          </button>
          <button
            className="vid-ctrl vid-ctrl-end"
            onClick={() => { setCamOn(false); if (isLive) endSession(); }}
            aria-label="End"
          >
            <PhoneOff size={24} color="#fff" />
          </button>
          <button
            className="vid-ctrl vid-ctrl-default"
            onClick={() => setCamOn(false)}
            aria-label="Close video"
          >
            <VideoOff size={22} color="#fff" />
          </button>
        </div>
      </div>

      {/* ── Logs Modal ── */}
      <div className={`modal-backdrop ${logsOpen ? 'open' : ''}`} onClick={() => setLogsOpen(false)}>
        <div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-header">
            <span className="modal-title">
              <AlignLeft size={14} /> Twin-Plane Ledger
            </span>
            <button className="modal-close" onClick={() => setLogsOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="modal-body">
            {logs.length === 0 ? (
              <div className="log-empty">
                <Info size={18} />
                <span>Start a session — agent logs will appear here.</span>
              </div>
            ) : logs.map(l => (
              <div key={l.id} className={`log-item ${logClass(l.agentName)}`}>
                <div className="log-agent">{l.agentName} · {l.timestamp}</div>
                <div className="log-text">{l.message}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      <div className={`modal-backdrop ${settingsOpen ? 'open' : ''}`} onClick={() => setSettingsOpen(false)}>
        <div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-header">
            <span className="modal-title">
              <Settings size={14} /> Business Profile
            </span>
            <button className="modal-close" onClick={() => setSettingsOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="modal-body">
            {(['businessName', 'merchantLocation', 'businessCategory'] as const).map(k => (
              <div key={k} className="field-group">
                <label className="field-label">
                  {{ businessName: 'Merchant Name', merchantLocation: 'Location', businessCategory: 'Category' }[k]}
                </label>
                <input
                  className="field-input"
                  value={profile[k]}
                  disabled={isLive}
                  onChange={e => setProfile(p => ({ ...p, [k]: e.target.value }))}
                />
              </div>
            ))}
            <div className="field-group" style={{ marginTop: 4 }}>
              <label className="field-label">Active Vibe</label>
              <div className="field-input" style={{ color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                {VIBES[vibeIdx].emoji} {VIBES[vibeIdx].name}
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Active Manifest</label>
              <div className="field-input" style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.7, height: 'auto' }}>
                {manifest.local_event} · {manifest.neighborhood_slangs}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
