'use client';
import { apiFetch } from '@/lib/api-client';
import { useState, useRef, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { PROMPT_TEMPLATES } from '@/lib/agent-prompts';
import { Send, RefreshCw, Paperclip, X, Image as ImageIcon, Video } from 'lucide-react';
import { useClient } from '@/contexts/ClientContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface UploadedFile {
  name: string;
  url: string;
  type: string;
  size: number;
}

function MarkdownText({ text }: { text: string }) {
  // Simple markdown renderer for agent responses
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.65 }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: '15px', fontWeight: 700, margin: '12px 0 6px', color: 'var(--text-primary)' }}>{line.slice(3)}</h3>;
        if (line.startsWith('# ')) return <h2 key={i} style={{ fontSize: '17px', fontWeight: 700, margin: '14px 0 8px', color: 'var(--text-primary)' }}>{line.slice(2)}</h2>;
        if (line.startsWith('### ')) return <h4 key={i} style={{ fontSize: '14px', fontWeight: 600, margin: '10px 0 4px', color: 'var(--text-accent)' }}>{line.slice(4)}</h4>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: '16px', margin: '2px 0' }}>• {line.slice(2)}</div>;
        if (line.startsWith('| ')) return <div key={i} style={{ fontFamily: 'monospace', fontSize: '12px', margin: '2px 0', color: 'var(--text-secondary)' }}>{line}</div>;
        if (line.trim() === '') return <div key={i} style={{ height: '8px' }} />;
        // Bold
        const withBold = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return <p key={i} style={{ margin: '3px 0' }} dangerouslySetInnerHTML={{ __html: withBold }} />;
      })}
    </div>
  );
}

const defaultMessages: Message[] = [
  {
    role: 'assistant',
    content: '¡Hola! Soy tu agente de Meta Ads 🚀\n\nPuedo ayudarte a **analizar**, **crear**, **pausar** y **optimizar** tus campañas de forma automática.\n\nPrueba con alguno de los prompts de abajo, o escríbeme directamente. Tengo acceso en tiempo real a tu cuenta de Meta Ads.',
    // Don't set dynamic timestamp here to avoid hydration mismatch
  }
];

export default function ChatPage() {
  const { currentClient, isLoading: clientsLoading } = useClient();
  const [messages, setMessages] = useState<Message[]>(defaultMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chatStorageKey = currentClient ? `meta_ads_chat_history_${currentClient.id}` : 'meta_ads_chat_history_guest';

  // Load from localStorage on client change
  useEffect(() => {
    if (clientsLoading) return;

    const saved = localStorage.getItem(chatStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setMessages(parsed);
        } else {
          setMessages([{...defaultMessages[0], timestamp: new Date().toISOString()}]);
        }
      } catch (e) {
        console.error('Error loading chat history', e);
        setMessages([{...defaultMessages[0], timestamp: new Date().toISOString()}]);
      }
    } else {
      setMessages([{...defaultMessages[0], timestamp: new Date().toISOString()}]);
    }
    setIsLoaded(true);
  }, [chatStorageKey, clientsLoading]);

  // Save to localStorage on change
  useEffect(() => {
    if (isLoaded && !clientsLoading) {
      localStorage.setItem(chatStorageKey, JSON.stringify(messages));
    }
  }, [messages, isLoaded, chatStorageKey, clientsLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    try {
      const selectedFiles = Array.from(e.target.files);

      // Step 1: get signed upload URLs from our API (no file data sent to Vercel)
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Step 2: upload each file directly to Supabase Storage (bypasses Vercel size limit)
      const uploaded = await Promise.all(
        data.files.map(async (meta: { signedUrl: string; publicUrl: string; name: string; type: string; size: number }, i: number) => {
          const file = selectedFiles[i];
          const uploadRes = await fetch(meta.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          if (!uploadRes.ok) throw new Error(`Error subiendo ${file.name}: ${uploadRes.statusText}`);
          return { name: meta.name, url: meta.publicUrl, type: meta.type, size: meta.size };
        })
      );

      setUploadedFiles(prev => [...prev, ...uploaded]);
    } catch (err) {
      alert(`Error al subir archivos: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (text?: string) => {
    const content = text || input.trim();
    if ((!content && uploadedFiles.length === 0) || loading) return;

    // Build the user message content including file metadata for the agent
    let fullContent = content;
    if (uploadedFiles.length > 0) {
      const fileList = uploadedFiles.map(f => {
        const isVideo = f.type.startsWith('video/');
        return `[${isVideo ? 'VIDEO' : 'IMAGEN'}: ${f.name} | URL: ${f.url}]`;
      }).join('\n');
      fullContent = fullContent
        ? `${fullContent}\n\nArchivos adjuntos:\n${fileList}`
        : `Archivos adjuntos:\n${fileList}`;
    }

    const userMsg: Message = { role: 'user', content: fullContent, timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setUploadedFiles([]);
    setLoading(true);
    setLoadingSeconds(0);
    loadingTimerRef.current = setInterval(() => setLoadingSeconds(s => s + 1), 1000);

    try {
      const res = await apiFetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          includeContext: true,
        }),
      });

      if (!res.ok) {
        let errMessage = `Error HTTP: ${res.status} ${res.statusText}`;
        try {
          const errData = await res.json();
          if (errData.error) errMessage = typeof errData.error === 'string' ? errData.error : JSON.stringify(errData.error);
        } catch {
          if (res.status === 504) errMessage = 'El agente tardó demasiado (Timeout 504). Intenta de nuevo.';
        }
        throw new Error(errMessage);
      }

      const data = await res.json();

      if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ ${err instanceof Error ? err.message : 'Error desconocido al conectar con el agente.'}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      setLoadingSeconds(0);
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    const resetMessage: Message = {
      role: 'assistant',
      content: 'Chat reiniciado. ¿En qué puedo ayudarte con tus campañas de Meta Ads?',
      timestamp: new Date().toISOString(),
    };
    setMessages([resetMessage]);
    localStorage.removeItem(chatStorageKey);
  };

  if (!currentClient && !clientsLoading) {
    return (
      <AppLayout>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: 'var(--text-muted)' }}>
          <p>Selecciona un cliente para comenzar el chat.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', gap: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <div>
            <h1 className="page-title">Agente IA</h1>
            <p className="page-subtitle">Gestiona tus campañas en lenguaje natural</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={clearChat}>
            <RefreshCw size={13} /> Nuevo chat
          </button>
        </div>

        {/* Prompt templates */}
        <div style={{ flexShrink: 0, marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {PROMPT_TEMPLATES.map((cat, i) => (
              <button
                key={i}
                className={`btn btn-sm ${activeCategory === i ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveCategory(i)}
              >
                {cat.category}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PROMPT_TEMPLATES[activeCategory].prompts.map((p, i) => (
              <button
                key={i}
                onClick={() => sendMessage(p)}
                disabled={loading}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--bg-border)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
              >
                {p.length > 55 ? p.slice(0, 55) + '…' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          paddingRight: '4px',
          minHeight: 0,
        }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className="chat-message animate-in"
              style={{
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}
            >
              <div className={`chat-avatar ${msg.role}`}>
                {msg.role === 'assistant' ? '🤖' : '👤'}
              </div>
              <div>
                <div
                  className="chat-bubble"
                  style={msg.role === 'user' ? {
                    background: 'rgba(37,99,235,0.18)',
                    borderColor: 'rgba(37,99,235,0.3)',
                  } : {}}
                >
                  {msg.role === 'assistant'
                    ? <MarkdownText text={msg.content} />
                    : <span>{msg.content}</span>}
                </div>
                {msg.timestamp && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '4px' }}>
                    {new Date(msg.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-message animate-in">
              <div className="chat-avatar agent">🤖</div>
              <div className="chat-bubble" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="loading-dots"><span /><span /><span /></div>
                {loadingSeconds >= 5 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {loadingSeconds < 30
                      ? `Pensando... ${loadingSeconds}s`
                      : loadingSeconds < 90
                      ? `Creando campañas... ${loadingSeconds}s`
                      : `Subiendo a Meta... ${loadingSeconds}s`}
                  </span>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{ marginTop: '12px', flexShrink: 0 }}>
          {/* File previews */}
          {uploadedFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', padding: '8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-border)' }}>
              {uploadedFiles.map((f, i) => {
                const isVideo = f.type.startsWith('video/');
                return (
                  <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {isVideo ? <Video size={14} style={{ color: 'var(--brand-primary)' }} /> : <ImageIcon size={14} style={{ color: 'var(--brand-primary)' }} />}
                    <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="chat-input-area" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '8px' }}>
            <input
              type="file"
              id="chat-file-upload"
              multiple
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => document.getElementById('chat-file-upload')?.click()}
              disabled={uploading}
              style={{ flexShrink: 0, padding: '8px', borderRadius: '8px', marginRight: '8px', color: uploading ? 'var(--brand-primary)' : 'var(--text-secondary)', position: 'relative' }}
              title={uploading ? 'Subiendo...' : 'Adjuntar imágenes o vídeos'}
            >
              <Paperclip size={18} style={{ animation: uploading ? 'pulse 1s infinite' : 'none' }} />
            </button>
            
            <textarea
              ref={textareaRef}
              className="input chat-input"
              placeholder="Escribe tu consulta o adjunta creatividades... (Enter para enviar)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              style={{ border: 'none', background: 'transparent', resize: 'none', outline: 'none', flex: 1, padding: '8px 0' }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => sendMessage()}
              disabled={loading || uploading || (!input.trim() && uploadedFiles.length === 0)}
              style={{ flexShrink: 0, borderRadius: '8px', marginLeft: '8px' }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
