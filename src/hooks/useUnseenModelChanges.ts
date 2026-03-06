import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

export function useUnseenModelChanges() {
  const { user } = useAuthStore();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }

    const [viewsRes, changesRes, notesRes] = await Promise.all([
      supabase.from('model_profile_views').select('model_id,last_viewed_at').eq('user_id', user.id),
      supabase.from('model_changes').select('model_id,field_name,changed_at').neq('field_name', 'status').order('changed_at', { ascending: false }).limit(1000),
      supabase.from('model_important_notes').select('model_id,updated_at,created_at').eq('active', true),
    ]);

    const views = viewsRes.data as { model_id: string; last_viewed_at: string }[] | null;
    const changes = changesRes.data as { model_id: string; field_name: string; changed_at: string }[] | null;
    const notes = notesRes.data as { model_id: string; updated_at: string; created_at: string }[] | null;

    const viewMap = new Map((views ?? []).map(v => [v.model_id, v.last_viewed_at]));
    const unseenModels = new Set<string>();

    for (const ch of changes ?? []) {
      const lastViewed = viewMap.get(ch.model_id);
      if (!lastViewed || new Date(ch.changed_at) > new Date(lastViewed)) {
        unseenModels.add(ch.model_id);
      }
    }

    for (const n of notes ?? []) {
      const lastViewed = viewMap.get(n.model_id);
      const noteTime = n.updated_at || n.created_at;
      if (!lastViewed || new Date(noteTime) > new Date(lastViewed)) {
        unseenModels.add(n.model_id);
      }
    }

    setCount(unseenModels.size);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { unseenCount: count, refresh };
}
