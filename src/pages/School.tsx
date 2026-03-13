import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export default function School() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: 'cw-hub-session',
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }, window.location.origin);
      }
    } catch { /* ignore */ }
  }, []);

  const handleLoad = useCallback(() => {
    sendSession();
  }, [sendSession]);

  useEffect(() => {
    sendSession();
  }, [sendSession]);

  return (
    <iframe
      ref={iframeRef}
      src={`${import.meta.env.BASE_URL}school-app/`}
      onLoad={handleLoad}
      className="w-full border-0"
      style={{ height: 'calc(100vh - 52px)', minHeight: '600px' }}
      title="Chatting School"
      allow="autoplay"
    />
  );
}
