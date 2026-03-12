import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface Nomination {
  id: string;
  nominee_name: string;
  reason: string | null;
  created_at: string;
}

interface NomineeGroup {
  name: string;
  votes: number;
  reasons: string[];
}

export default function DelegateNominations() {
  const [groups, setGroups] = useState<NomineeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('delegate_nominations')
      .select('id, nominee_name, reason, created_at')
      .order('created_at', { ascending: false });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const map = new Map<string, string[]>();
    for (const row of data as Nomination[]) {
      const reasons = map.get(row.nominee_name) ?? [];
      if (row.reason) reasons.push(row.reason);
      map.set(row.nominee_name, reasons);
    }

    const grouped: NomineeGroup[] = Array.from(map.entries())
      .map(([name, reasons]) => ({
        name,
        votes: (data as Nomination[]).filter(r => r.nominee_name === name).length,
        reasons,
      }))
      .sort((a, b) => b.votes - a.votes);

    setGroups(grouped);
    setTotal((data as Nomination[]).length);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const maxVotes = groups[0]?.votes ?? 1;

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Delegate Candidates</h1>
        <p className="text-sm text-text-secondary mt-1">
          {total} candidate{total !== 1 ? 's' : ''} registered
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-2 text-text-secondary">
            <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading...</span>
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-text-secondary text-sm">
          No nominations yet.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => {
            const isExpanded = expanded === g.name;
            const barWidth = Math.max((g.votes / maxVotes) * 100, 8);

            return (
              <div key={g.name}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : g.name)}
                  className="w-full text-left rounded-xl bg-surface-1 border border-border hover:border-border-hover transition-colors"
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    <span className="text-xs font-bold text-text-secondary w-6 text-center shrink-0">
                      {i + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-white truncate">
                          {g.name}
                        </span>
                        <span className="text-xs font-medium text-cw ml-2 shrink-0 bg-cw/10 px-2 py-0.5 rounded-full">
                          Candidate
                        </span>
                      </div>
                    </div>

                    <svg
                      className={`w-4 h-4 text-text-secondary shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-1 ml-9 mr-4 mb-2">
                    {g.reasons.length === 0 ? (
                      <p className="text-xs text-text-secondary italic py-2 px-3">
                        No pitch provided.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {g.reasons.map((r, j) => (
                          <div
                            key={j}
                            className="text-sm text-text-secondary bg-surface-0 rounded-lg px-3 py-2 border border-border"
                          >
                            "{r}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
