import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';
import {
  Megaphone, Pin, X, ChevronDown, ChevronUp,
  Plus, Send, Loader2,
} from 'lucide-react';
import type { Announcement, AnnouncementPriority, UserRole } from '../types';
import { isManagement } from '../lib/roles';

const PRIORITY_STYLES: Record<AnnouncementPriority, { bg: string; border: string; icon: string; label: string }> = {
  urgent: { bg: 'bg-danger/[0.06]', border: 'border-danger/30', icon: 'text-danger', label: 'Urgent' },
  important: { bg: 'bg-warning/[0.06]', border: 'border-warning/30', icon: 'text-warning', label: 'Important' },
  normal: { bg: 'bg-surface-1', border: 'border-border', icon: 'text-text-muted', label: 'Normal' },
};

export function AnnouncementBanner() {
  const { profile } = useAuthStore();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    if (!profile) return;

    const { data } = await supabase
      .from('announcements')
      .select('*, author:profiles!announcements_author_id_fkey(full_name)')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      const visible = (data as Announcement[]).filter(a =>
        a.target_roles.length === 0 || a.target_roles.includes(profile.role)
      );
      setAnnouncements(visible);
    }
  }, [profile]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const active = announcements.filter(a => !dismissed.has(a.id));
  if (active.length === 0) return null;

  const pinned = active.filter(a => a.pinned);
  const rest = active.filter(a => !a.pinned);
  const shown = expanded ? [...pinned, ...rest] : pinned.slice(0, 1);

  return (
    <div className="mb-4 space-y-2">
      {shown.map(a => {
        const style = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.normal;
        return (
          <div key={a.id} className={cn('border rounded-xl px-4 py-3', style.bg, style.border)}>
            <div className="flex items-start gap-3">
              <Megaphone size={16} className={cn('shrink-0 mt-0.5', style.icon)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary">{a.title}</span>
                  {a.pinned && <Pin size={10} className="text-text-muted" />}
                  {a.priority !== 'normal' && (
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-bold', style.bg, style.icon)}>
                      {style.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{a.message}</p>
                <p className="text-[10px] text-text-muted mt-1">
                  {a.author?.full_name} · {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              {!a.pinned && (
                <button
                  onClick={() => setDismissed(prev => new Set([...prev, a.id]))}
                  className="p-1 rounded-lg hover:bg-surface-2 text-text-muted shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {rest.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-text-muted hover:text-text-secondary flex items-center gap-1 ml-1"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Show less' : `${rest.length} more announcement${rest.length > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

export function AnnouncementComposer({ onPost }: { onPost?: () => void }) {
  const { profile } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [pinned, setPinned] = useState(false);
  const [sending, setSending] = useState(false);

  if (!profile || !isManagement(profile.role)) return null;

  const handlePost = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);

    await supabase.from('announcements').insert({
      title: title.trim(),
      message: message.trim(),
      author_id: profile.id,
      priority,
      pinned,
      target_roles: [],
    });

    setTitle('');
    setMessage('');
    setPriority('normal');
    setPinned(false);
    setOpen(false);
    setSending(false);
    onPost?.();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-cw transition-colors"
      >
        <Plus size={14} /> Post Announcement
      </button>
    );
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">New Announcement</h3>
        <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
          <X size={16} />
        </button>
      </div>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cw/50"
        />
        <textarea
          placeholder="Message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cw/50 resize-none"
        />
        <div className="flex items-center gap-3">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as AnnouncementPriority)}
            className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-cw/50"
          >
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="rounded border-border text-cw focus:ring-cw/20"
            />
            Pin
          </label>
          <div className="flex-1" />
          <button
            onClick={handlePost}
            disabled={sending || !title.trim() || !message.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-cw text-white text-xs font-bold rounded-lg hover:bg-cw-dark disabled:opacity-40 transition-colors"
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
