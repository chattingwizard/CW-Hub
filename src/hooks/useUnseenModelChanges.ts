import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

export function useUnseenModelChanges() {
  const { user } = useAuthStore();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }

    const [viewsRes, changesRes] = await Promise.all([
      supabase.from('model_profile_views').select('model_id,last_viewed_at').eq('user_id', user.id),
      supabase.from('model_changes').select('model_id,changed_at').order('changed_at', { ascending: false }).limit(500),
    ]);

    const views = viewsRes.data as { model_id: string; last_viewed_at: string }[] | null;
    const changes = changesRes.data as { model_id: string; changed_at: string }[] | null;
    if (!changes) { setCount(0); return; }

    const viewMap = new Map((views ?? []).map(v => [v.model_id, v.last_viewed_at]));
    const unseenModels = new Set<string>();

    for (const ch of changes) {
      const lastViewed = viewMap.get(ch.model_id);
      if (!lastViewed || new Date(ch.changed_at) > new Date(lastViewed)) {
        unseenModels.add(ch.model_id);
      }
    }

    setCount(unseenModels.size);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-check every 5 minutes
  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { unseenCount: count, refresh };
}
