import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { isAdminLevel, TL_SHIFTS } from '../lib/roles';
import type { AuditRound, AuditFlag, Chatter } from '../types';
import {
  ClipboardCheck, Check, Flag, ChevronLeft, ChevronRight,
  Loader2, CheckCircle2, Circle, AlertCircle, CalendarDays, X,
} from 'lucide-react';
import ErrorState from '../components/ErrorState';

// ── Constants ────────────────────────────────────────────────

const ROUND_HOURS: Record<string, number[]> = {
  huckle: [0, 1, 2, 3, 4, 5, 6],
  danilyn: [8, 9, 10, 11, 12, 13, 14],
  ezekiel: [16, 17, 18, 19, 20, 21, 22],
};

const TL_KEYS = ['huckle', 'danilyn', 'ezekiel'] as const;

const TL_META: Record<string, { label: string; teamName: string; shiftLabel: string; colorClass: string; dotClass: string }> = {
  huckle: { label: 'Huckle', teamName: 'Team Huckle', shiftLabel: '00:00–08:00 UTC', colorClass: 'text-orange-400', dotClass: 'bg-orange-400' },
  danilyn: { label: 'Danilyn', teamName: 'Team Danilyn', shiftLabel: '08:00–16:00 UTC', colorClass: 'text-blue-400', dotClass: 'bg-blue-400' },
  ezekiel: { label: 'Ezekiel', teamName: 'Team Ezekiel', shiftLabel: '16:00–00:00 UTC', colorClass: 'text-purple-400', dotClass: 'bg-purple-400' },
};

const TOTAL_ROUNDS = 7;

// ── Helpers ──────────────────────────────────────────────────

function getTLKey(teamName: string | null): string | null {
  if (!teamName) return null;
  const lower = teamName.toLowerCase();
  if (lower.includes('huckle')) return 'huckle';
  if (lower.includes('danilyn')) return 'danilyn';
  if (lower.includes('ezekiel')) return 'ezekiel';
  return null;
}

function getShiftDate(tlKey: string): string {
  const now = new Date();
  if (tlKey === 'huckle' && now.getUTCHours() >= 23) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatUTCTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function isTLOnShift(tlKey: string, utcHour: number): boolean {
  switch (tlKey) {
    case 'huckle': return utcHour >= 23 || utcHour < 7;
    case 'danilyn': return utcHour >= 7 && utcHour < 15;
    case 'ezekiel': return utcHour >= 15 && utcHour < 23;
    default: return false;
  }
}

interface RoundInfo {
  number: number;
  hour: number;
  canStart: boolean;
  display: 'completed' | 'active' | 'overdue' | 'upcoming';
  round?: AuditRound;
}

function computeRoundInfos(
  tlKey: string,
  shiftDate: string,
  completedMap: Map<number, AuditRound>,
  now: Date,
): RoundInfo[] {
  const hours = ROUND_HOURS[tlKey] ?? [];
  return hours.map((hour, idx) => {
    const num = idx + 1;
    const completed = completedMap.get(num);
    const scheduled = new Date(`${shiftDate}T${String(hour).padStart(2, '0')}:00:00Z`);
    const hourStarted = now >= scheduled;
    const withinHour = hourStarted && (now.getTime() - scheduled.getTime() < 3_600_000);

    if (completed) return { number: num, hour, canStart: false, display: 'completed' as const, round: completed };
    if (withinHour) return { number: num, hour, canStart: true, display: 'active' as const };
    if (hourStarted) return { number: num, hour, canStart: true, display: 'overdue' as const };
    return { number: num, hour, canStart: false, display: 'upcoming' as const };
  });
}

function getExpectedRounds(tlKey: string, shiftDate: string, now: Date): number {
  const today = now.toISOString().slice(0, 10);
  if (shiftDate < today) return TOTAL_ROUNDS;
  if (shiftDate > today) return 0;
  const hours = ROUND_HOURS[tlKey] ?? [];
  return hours.filter(h => {
    const scheduled = new Date(`${shiftDate}T${String(h).padStart(2, '0')}:00:00Z`);
    return now >= scheduled;
  }).length;
}

interface ChatterReview {
  name: string;
  profileId: string | null;
  status: 'ok' | 'flagged' | null;
  model: string;
  notes: string;
}

// ── Main Component ───────────────────────────────────────────

export default function AuditRounds() {
  const { profile } = useAuthStore();
  const isAdmin = profile ? isAdminLevel(profile.role) : false;

  if (isAdmin) return <AdminView />;
  if (profile?.role === 'team_leader') return <TLView />;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <ErrorState message="You don't have access to this page." />
    </div>
  );
}

// ── TL View ──────────────────────────────────────────────────

function TLView() {
  const { profile } = useAuthStore();
  const tlKey = getTLKey(profile?.team_name ?? null);
  const meta = tlKey ? TL_META[tlKey] : undefined;
  const shiftDate = tlKey ? getShiftDate(tlKey) : '';

  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [rounds, setRounds] = useState<AuditRound[]>([]);
  const [flags, setFlags] = useState<AuditFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [roundStartedAt, setRoundStartedAt] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ChatterReview[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    if (!tlKey || !meta) return;
    setError(null);
    try {
      const [chattersRes, roundsRes] = await Promise.all([
        supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter').eq('team_name', meta.teamName).order('full_name'),
        supabase.from('audit_rounds').select('*').eq('tl_name', tlKey).eq('shift_date', shiftDate),
      ]);
      if (chattersRes.error) throw new Error(chattersRes.error.message);
      if (roundsRes.error) throw new Error(roundsRes.error.message);
      setChatters(chattersRes.data ?? []);
      setRounds(roundsRes.data ?? []);

      const roundIds = (roundsRes.data ?? []).map(r => r.id);
      if (roundIds.length > 0) {
        const { data: flagsData } = await supabase.from('audit_flags').select('*').in('round_id', roundIds);
        setFlags(flagsData ?? []);
      } else {
        setFlags([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tlKey, meta, shiftDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const completedMap = useMemo(() => {
    const m = new Map<number, AuditRound>();
    for (const r of rounds) m.set(r.round_number, r);
    return m;
  }, [rounds]);

  const roundInfos = useMemo(
    () => tlKey ? computeRoundInfos(tlKey, shiftDate, completedMap, now) : [],
    [tlKey, shiftDate, completedMap, now],
  );

  const completedCount = rounds.length;
  const expectedCount = tlKey ? getExpectedRounds(tlKey, shiftDate, now) : 0;

  const startRound = (roundNum: number) => {
    setActiveRound(roundNum);
    setRoundStartedAt(new Date().toISOString());
    setReviews(chatters.map(c => ({ name: c.full_name, profileId: c.profile_id, status: null, model: '', notes: '' })));
    setSuccessMsg(null);
  };

  const cancelRound = () => {
    setActiveRound(null);
    setRoundStartedAt(null);
    setReviews([]);
  };

  const updateReview = (idx: number, update: Partial<ChatterReview>) => {
    setReviews(prev => prev.map((r, i) => i === idx ? { ...r, ...update } : r));
  };

  const allReviewed = reviews.every(r => r.status !== null);
  const flaggedReviews = reviews.filter(r => r.status === 'flagged');
  const flaggedWithoutNotes = flaggedReviews.some(r => r.notes.trim() === '');

  const submitRound = async () => {
    if (!profile || !tlKey || activeRound === null) return;
    setSubmitting(true);
    try {
      const { data: roundData, error: roundErr } = await supabase
        .from('audit_rounds')
        .insert({
          tl_user_id: profile.id,
          tl_name: tlKey,
          shift_date: shiftDate,
          round_number: activeRound,
          started_at: roundStartedAt ?? new Date().toISOString(),
          completed_at: new Date().toISOString(),
          chatters_reviewed: reviews.length,
          issues_found: flaggedReviews.length,
        })
        .select('id')
        .single();

      if (roundErr) throw new Error(roundErr.message);
      const roundId = roundData!.id as number;

      if (flaggedReviews.length > 0) {
        const { error: flagErr } = await supabase.from('audit_flags').insert(
          flaggedReviews.map(f => ({
            round_id: roundId,
            chatter_name: f.name,
            model_account: f.model.trim() || null,
            notes: f.notes.trim(),
          })),
        );
        if (flagErr) throw new Error(flagErr.message);

        for (const f of flaggedReviews) {
          if (f.profileId) {
            await supabase.from('notifications').insert({
              user_id: f.profileId,
              type: 'alert' as const,
              title: 'Audit Flag',
              message: `Flagged by ${profile.full_name} during audit round: ${f.notes.trim()}`,
              action_url: null,
            });
          }
        }
      }

      setSuccessMsg(`Round ${activeRound} completed — ${reviews.length} chatters reviewed, ${flaggedReviews.length} flagged`);
      setActiveRound(null);
      setRoundStartedAt(null);
      setReviews([]);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save round');
    } finally {
      setSubmitting(false);
    }
  };

  if (!tlKey || !meta) {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <ErrorState message="Your profile is not linked to a TL team. Contact admin." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-cw" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cw/10 flex items-center justify-center">
          <ClipboardCheck size={20} className="text-cw" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Audit Rounds</h1>
          <p className="text-sm text-text-secondary">
            {meta.teamName} — Chatter shift {meta.shiftLabel}
          </p>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} compact />}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Progress bar */}
      <div className="bg-surface-1 rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">
            Rounds completed: {completedCount}/{TOTAL_ROUNDS}
          </span>
          <span className="text-xs text-text-secondary">
            {formatDateLabel(shiftDate)}
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-cw transition-all duration-500"
            style={{ width: `${(completedCount / TOTAL_ROUNDS) * 100}%` }}
          />
        </div>
        {expectedCount > completedCount && (
          <p className="text-xs text-amber-400">
            {expectedCount - completedCount} round{expectedCount - completedCount > 1 ? 's' : ''} overdue
          </p>
        )}
      </div>

      {/* Active round form */}
      {activeRound !== null ? (
        <div className="bg-surface-1 rounded-xl border border-cw/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-cw/5 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">
              Round {activeRound} — Review your chatters
            </h2>
            <button onClick={cancelRound} className="p-1 rounded hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="divide-y divide-border">
            {reviews.map((review, idx) => (
              <div key={review.name} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text-primary truncate">{review.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => updateReview(idx, { status: 'ok', model: '', notes: '' })}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        review.status === 'ok'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-surface-2 text-text-secondary hover:text-text-primary border border-transparent'
                      }`}
                    >
                      <Check size={14} />
                      OK
                    </button>
                    <button
                      onClick={() => updateReview(idx, { status: 'flagged' })}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        review.status === 'flagged'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-surface-2 text-text-secondary hover:text-text-primary border border-transparent'
                      }`}
                    >
                      <Flag size={14} />
                      Flag
                    </button>
                  </div>
                </div>

                {review.status === 'flagged' && (
                  <div className="flex flex-col sm:flex-row gap-2 pl-0 sm:pl-2">
                    <input
                      type="text"
                      placeholder="Model / account (optional)"
                      value={review.model}
                      onChange={e => updateReview(idx, { model: e.target.value })}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-cw/50"
                    />
                    <input
                      type="text"
                      placeholder="What happened? (required)"
                      value={review.notes}
                      onChange={e => updateReview(idx, { notes: e.target.value })}
                      className="flex-[2] px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-cw/50"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-4 py-3 bg-surface-0/50 border-t border-border">
            <div className="text-xs text-text-secondary">
              {reviews.filter(r => r.status === 'ok').length} OK · {flaggedReviews.length} flagged · {reviews.filter(r => r.status === null).length} pending
            </div>
            <button
              onClick={submitRound}
              disabled={!allReviewed || flaggedWithoutNotes || submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cw text-white text-sm font-medium hover:bg-cw/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Complete Round
            </button>
          </div>
        </div>
      ) : (
        /* Round list */
        <div className="space-y-2">
          {roundInfos.map(info => {
            const roundFlags = flags.filter(f => f.round_id === info.round?.id);
            return (
              <div
                key={info.number}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  info.display === 'completed' ? 'bg-surface-1 border-emerald-500/20' :
                  info.display === 'active' ? 'bg-surface-1 border-cw/30' :
                  info.display === 'overdue' ? 'bg-surface-1 border-amber-500/20' :
                  'bg-surface-1/50 border-border'
                }`}
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {info.display === 'completed' && <CheckCircle2 size={20} className="text-emerald-400" />}
                  {info.display === 'active' && <Circle size={20} className="text-cw" />}
                  {info.display === 'overdue' && <AlertCircle size={20} className="text-amber-400" />}
                  {info.display === 'upcoming' && <Circle size={20} className="text-zinc-600" />}
                </div>

                {/* Round info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${info.display === 'upcoming' ? 'text-text-secondary' : 'text-text-primary'}`}>
                      Round {info.number}
                    </span>
                    <span className="text-xs text-text-secondary">{formatHour(info.hour)} UTC</span>
                  </div>
                  {info.round && (
                    <p className="text-xs text-text-secondary mt-0.5">
                      Completed at {formatUTCTime(info.round.completed_at!)} —{' '}
                      {info.round.chatters_reviewed} reviewed, {info.round.issues_found} flagged
                      {roundFlags.length > 0 && (
                        <span className="text-red-400"> ({roundFlags.map(f => f.chatter_name).join(', ')})</span>
                      )}
                    </p>
                  )}
                  {info.display === 'overdue' && (
                    <p className="text-xs text-amber-400 mt-0.5">Overdue</p>
                  )}
                </div>

                {/* Action */}
                {info.canStart && (
                  <button
                    onClick={() => startRound(info.number)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-cw/10 text-cw text-xs font-medium hover:bg-cw/20 transition-colors"
                  >
                    Start
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Admin View ───────────────────────────────────────────────

function AdminView() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [rounds, setRounds] = useState<AuditRound[]>([]);
  const [flags, setFlags] = useState<AuditFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: roundsData, error: rErr } = await supabase
        .from('audit_rounds')
        .select('*')
        .eq('shift_date', selectedDate)
        .order('tl_name')
        .order('round_number');
      if (rErr) throw new Error(rErr.message);
      setRounds(roundsData ?? []);

      const ids = (roundsData ?? []).map(r => r.id);
      if (ids.length > 0) {
        const { data: flagsData } = await supabase.from('audit_flags').select('*').in('round_id', ids).order('created_at', { ascending: false });
        setFlags(flagsData ?? []);
      } else {
        setFlags([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const prevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };
  const nextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const today = new Date().toISOString().slice(0, 10);
    if (d.toISOString().slice(0, 10) <= today) {
      setSelectedDate(d.toISOString().slice(0, 10));
    }
  };

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);
  const utcHour = now.getUTCHours();

  const roundsByTL = useMemo(() => {
    const m: Record<string, AuditRound[]> = {};
    for (const key of TL_KEYS) m[key] = [];
    for (const r of rounds) {
      const arr = m[r.tl_name];
      if (arr) arr.push(r);
    }
    return m;
  }, [rounds]);

  const roundIdToTL = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rounds) m.set(r.id, r.tl_name);
    return m;
  }, [rounds]);

  const roundIdToNum = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rounds) m.set(r.id, r.round_number);
    return m;
  }, [rounds]);

  const totalFlags = flags.length;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cw/10 flex items-center justify-center">
            <ClipboardCheck size={20} className="text-cw" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Audit Rounds</h1>
            <p className="text-sm text-text-secondary">TL compliance & chatter flags</p>
          </div>
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-1 border border-border min-w-[200px] justify-center">
            <CalendarDays size={14} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">{formatDateLabel(selectedDate)}</span>
          </div>
          <button
            onClick={nextDay}
            disabled={isToday}
            className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} compact />}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-cw" />
        </div>
      ) : (
        <>
          {/* TL compliance cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TL_KEYS.map(tlKey => {
              const meta = TL_META[tlKey]!;
              const tlRounds = roundsByTL[tlKey] ?? [];
              const completed = tlRounds.length;
              const expected = getExpectedRounds(tlKey, selectedDate, now);
              const issues = tlRounds.reduce((sum, r) => sum + r.issues_found, 0);
              const missed = Math.max(0, expected - completed);
              const onShift = isToday && isTLOnShift(tlKey, utcHour);
              const pct = TOTAL_ROUNDS > 0 ? (completed / TOTAL_ROUNDS) * 100 : 0;

              return (
                <div key={tlKey} className="bg-surface-1 rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
                      <span className={`text-sm font-semibold ${meta.colorClass}`}>{meta.label}</span>
                    </div>
                    {isToday && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        onShift ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-500/15 text-zinc-400'
                      }`}>
                        {onShift ? 'On shift' : 'Off shift'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-text-secondary">{meta.shiftLabel}</p>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">Rounds</span>
                      <span className="font-medium text-text-primary">{completed}/{TOTAL_ROUNDS}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          completed >= TOTAL_ROUNDS ? 'bg-emerald-400' :
                          completed >= expected ? 'bg-cw' :
                          'bg-amber-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className={issues > 0 ? 'text-red-400' : 'text-text-secondary'}>
                      {issues > 0 ? `${issues} issue${issues > 1 ? 's' : ''} reported` : 'No issues'}
                    </span>
                    {missed > 0 && (
                      <span className="text-amber-400">
                        {missed} missed
                      </span>
                    )}
                  </div>

                  {/* Mini timeline: show round numbers */}
                  <div className="flex items-center gap-1 pt-1">
                    {Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
                      const roundNum = i + 1;
                      const isComplete = tlRounds.some(r => r.round_number === roundNum);
                      const hours = ROUND_HOURS[tlKey] ?? [];
                      const roundHour = hours[i] ?? 0;
                      const scheduled = new Date(`${selectedDate}T${String(roundHour).padStart(2, '0')}:00:00Z`);
                      const isPast = now >= scheduled;

                      return (
                        <div
                          key={roundNum}
                          title={`Round ${roundNum} (${formatHour(roundHour)})${isComplete ? ' — completed' : isPast ? ' — missed' : ''}`}
                          className={`w-full h-1.5 rounded-sm ${
                            isComplete ? 'bg-emerald-400' :
                            isPast ? 'bg-amber-400/40' :
                            'bg-surface-3'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Flags table */}
          <div className="bg-surface-1 rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Flags {totalFlags > 0 && <span className="text-red-400 font-normal">({totalFlags})</span>}
              </h2>
            </div>

            {flags.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-text-secondary">
                No flags reported for this date
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-secondary border-b border-border">
                      <th className="text-left px-4 py-2 font-medium">Time</th>
                      <th className="text-left px-4 py-2 font-medium">TL</th>
                      <th className="text-left px-4 py-2 font-medium">Round</th>
                      <th className="text-left px-4 py-2 font-medium">Chatter</th>
                      <th className="text-left px-4 py-2 font-medium">Model</th>
                      <th className="text-left px-4 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {flags.map(flag => {
                      const tl = roundIdToTL.get(flag.round_id) ?? '?';
                      const roundNum = roundIdToNum.get(flag.round_id) ?? 0;
                      const meta = TL_META[tl];
                      return (
                        <tr key={flag.id} className="hover:bg-surface-2/50 transition-colors">
                          <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap">{formatUTCTime(flag.created_at)}</td>
                          <td className="px-4 py-2.5">
                            <span className={meta?.colorClass ?? 'text-text-primary'}>{meta?.label ?? tl}</span>
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary">#{roundNum}</td>
                          <td className="px-4 py-2.5 text-text-primary font-medium">{flag.chatter_name}</td>
                          <td className="px-4 py-2.5 text-text-secondary">{flag.model_account || '—'}</td>
                          <td className="px-4 py-2.5 text-text-secondary max-w-xs truncate">{flag.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
