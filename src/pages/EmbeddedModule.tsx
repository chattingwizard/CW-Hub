import { useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { modules } from '../lib/modules';
import { supabase } from '../lib/supabase';
import { ExternalLink, AlertCircle } from 'lucide-react';

export default function EmbeddedModule() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const mod = modules.find((m) => m.id === moduleId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeLoad = useCallback(async () => {
    setLoading(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: 'cw-hub-session',
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }, '*');
      }
    } catch { /* iframe may block postMessage on cross-origin */ }
  }, []);

  if (!mod || mod.type !== 'iframe') {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">Module not found.</p>
        </div>
      </div>
    );
  }

  const iframeUrl = mod.path;

  return (
    <div className="h-screen flex flex-col">
      <div className="h-10 bg-surface-1 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white font-medium">{mod.name}</span>
          {loading && !error && (
            <div className="w-3 h-3 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
          )}
        </div>
        <a
          href={iframeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-cw transition-colors"
        >
          Open in new tab
          <ExternalLink size={12} />
        </a>
      </div>

      {error && (
        <div className="flex-1 flex items-center justify-center bg-surface-0">
          <div className="text-center">
            <AlertCircle size={40} className="text-warning mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Could not load {mod.name}</h3>
            <p className="text-sm text-text-secondary mb-4">
              The module might not be deployed yet or may have a different URL.
            </p>
            <a
              href={iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium"
            >
              Try opening directly
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={iframeUrl}
        className={`flex-1 w-full border-0 bg-surface-0 ${error ? 'hidden' : ''}`}
        title={mod.name}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        allow="clipboard-write"
        referrerPolicy="no-referrer"
        onLoad={handleIframeLoad}
        onError={() => { setLoading(false); setError(true); }}
      />
    </div>
  );
}
