import { Eye, X } from 'lucide-react';
import { useImpersonationStore } from '../stores/impersonationStore';
import { ROLE_LABELS } from '../lib/roles';

export default function ImpersonationBanner() {
  const { active, role, userName, deactivate } = useImpersonationStore();

  if (!active || !role) return null;

  const label = userName
    ? `${userName} (${ROLE_LABELS[role] ?? role})`
    : ROLE_LABELS[role] ?? role;

  return (
    <div className="fixed top-0 left-0 right-0 h-8 bg-amber-500 z-[60] flex items-center justify-center gap-3 text-black text-xs font-semibold">
      <Eye size={13} />
      <span>Viewing as: {label}</span>
      <button
        onClick={deactivate}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/15 hover:bg-black/25 transition-colors"
      >
        <X size={11} />
        Exit
      </button>
    </div>
  );
}
