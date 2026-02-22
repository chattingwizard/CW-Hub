import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, MessageSquare, Calendar, AlertTriangle, Megaphone, Settings } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import type { NotificationType } from '../types';

const TYPE_ICONS: Record<NotificationType, { icon: typeof Bell; color: string }> = {
  coaching: { icon: MessageSquare, color: 'text-cw' },
  schedule: { icon: Calendar, color: 'text-blue-400' },
  alert: { icon: AlertTriangle, color: 'text-danger' },
  announcement: { icon: Megaphone, color: 'text-warning' },
  system: { icon: Settings, color: 'text-text-muted' },
};

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-danger text-[10px] text-white font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-bold text-text-primary text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-cw hover:text-cw-light font-medium flex items-center gap-1"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={24} className="mx-auto text-text-muted mb-2 opacity-40" />
                <p className="text-text-muted text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 15).map(n => {
                const typeInfo = TYPE_ICONS[n.type] || TYPE_ICONS.system;
                const Icon = typeInfo.icon;

                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markAsRead(n.id);
                      if (n.action_url) navigate(n.action_url);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 last:border-0',
                      n.read ? 'hover:bg-surface-2/30' : 'bg-cw/[0.03] hover:bg-cw/[0.06]'
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', n.read ? 'bg-surface-2' : 'bg-cw/10')}>
                      <Icon size={14} className={n.read ? 'text-text-muted' : typeInfo.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-sm font-medium truncate', n.read ? 'text-text-secondary' : 'text-text-primary')}>
                          {n.title}
                        </p>
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-cw shrink-0" />}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    <span className="text-[10px] text-text-muted shrink-0 mt-0.5">{formatTimeAgo(n.created_at)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
