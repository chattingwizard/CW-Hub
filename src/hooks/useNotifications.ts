import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Notification } from '../types';

function requestBrowserPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showBrowserNotification(notif: Notification) {
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRl9vT19teleFFTAAABBQAAAGRhdGE+T09P' +
      'AAEAAQD//wAA//8AAP//AAD//wAA//8AAQABAP//AAD//wAA');
    
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1100;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.4);
    }, 150);

    if ('Notification' in window && Notification.permission === 'granted') {
      new window.Notification(notif.title, {
        body: notif.message,
        icon: '/cw-icon.png',
        tag: notif.id,
      });
    }
  } catch {
    // Audio/notification not supported
  }
}

export function useNotifications() {
  const { profile } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialLoadDone = useRef(false);

  const fetchNotifs = useCallback(async () => {
    if (!profile) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30);

    const notifs = (data ?? []) as Notification[];
    setNotifications(notifs);
    setUnreadCount(notifs.filter(n => !n.read).length);
    setLoading(false);
    initialLoadDone.current = true;
  }, [profile]);

  useEffect(() => {
    fetchNotifs();
    requestBrowserPermission();

    if (!profile) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          setUnreadCount(prev => prev + 1);
          if (initialLoadDone.current) {
            showBrowserNotification(newNotif);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchNotifs, profile]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!profile) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [profile]);

  return { notifications, unreadCount, loading, markAsRead, markAllRead, refresh: fetchNotifs };
}
