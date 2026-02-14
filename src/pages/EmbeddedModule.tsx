import { useParams } from 'react-router-dom';
import { modules } from '../lib/modules';
import { ExternalLink } from 'lucide-react';

export default function EmbeddedModule() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const mod = modules.find((m) => m.id === moduleId);

  if (!mod || mod.type !== 'iframe') {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <p className="text-text-secondary">Module not found.</p>
      </div>
    );
  }

  // Build iframe URL — same origin on GitHub Pages
  const iframeUrl = mod.path.startsWith('http') ? mod.path : mod.path;

  return (
    <div className="h-screen flex flex-col">
      {/* Thin header bar */}
      <div className="h-10 bg-surface-1 border-b border-border flex items-center justify-between px-4 shrink-0">
        <span className="text-sm text-white font-medium">{mod.name}</span>
        <a
          href={iframeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-cw"
        >
          Open in new tab
          <ExternalLink size={12} />
        </a>
      </div>

      {/* iframe */}
      <iframe
        src={iframeUrl}
        className="flex-1 w-full border-0 bg-surface-0"
        title={mod.name}
        allow="clipboard-write"
      />
    </div>
  );
}
