import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { getWeekKey } from '../../lib/scoreUtils';
import type { ScoreEventType, ScoreEvent, Chatter } from '../../types';
import { Plus, Clock, Trash2 } from 'lucide-react';

interface Props {
  weekKey: string;
  eventTypes: ScoreEventType[];
  chatters: Chatter[];
}

export default function ScoreLogEvent({ weekKey, eventTypes, chatters }: Props) {
  const { profile } = useAuthStore();
  const [selectedChatter, setSelectedChatter] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedEventType, setSelectedEventType] = useState<ScoreEventType | null>(null);
  const [customPoints, setCustomPoints] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recentEvents, setRecentEvents] = useState<(ScoreEvent & { chatter?: Chatter; event_type?: ScoreEventType })[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const positiveTypes = eventTypes.filter(t => t.category === 'positive' && t.is_active);
  const negativeTypes = eventTypes.filter(t => t.category === 'negative' && t.is_active);
  const customType = eventTypes.find(t => t.category === 'custom' && t.is_active);

  const previewPoints = selectedEventType
    ? selectedEventType.category === 'custom'
      ? customPoints
      : selectedEventType.points
    : 0;

  useEffect(() => {
    loadRecentEvents();
  }, [weekKey]);

  async function loadRecentEvents() {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('score_events')
      .select('*, chatter:chatters(*), event_type:score_event_types(*)')
      .eq('week', weekKey)
      .order('created_at', { ascending: false })
      .limit(20);
    setRecentEvents(data || []);
    setLoadingRecent(false);
  }

  async function handleSubmit() {
    if (!selectedChatter || !selectedEventType || !profile) return;
    setSubmitting(true);
    try {
      const points = selectedEventType.category === 'custom' ? customPoints : selectedEventType.points;
      const eventWeek = getWeekKey(new Date(selectedDate));

      const { error } = await supabase.from('score_events').insert({
        chatter_id: selectedChatter,
        submitted_by: profile.id,
        date: selectedDate,
        event_type_id: selectedEventType.id,
        points,
        custom_points: selectedEventType.category === 'custom' ? customPoints : null,
        notes: notes || null,
        week: eventWeek,
      });

      if (error) throw error;

      setSelectedChatter('');
      setSelectedEventType(null);
      setCustomPoints(0);
      setNotes('');
      loadRecentEvents();
    } catch (err) {
      console.error('Error logging event:', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(eventId: string) {
    const { error } = await supabase.from('score_events').delete().eq('id', eventId);
    if (!error) loadRecentEvents();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Log form */}
      <div className="bg-surface-1 rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Log Score Event</h3>

        {/* Chatter select */}
        <div className="mb-4">
          <label className="text-xs text-text-muted mb-1.5 block">Chatter</label>
          <select
            value={selectedChatter}
            onChange={e => setSelectedChatter(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Select chatter...</option>
            {chatters.map(c => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.team_name ? `(${c.team_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="text-xs text-text-muted mb-1.5 block">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
          />
        </div>

        {/* Event types grid */}
        <div className="mb-4">
          <label className="text-xs text-text-muted mb-1.5 block">Event Type</label>
          <div className="grid grid-cols-2 gap-3">
            {/* Positive */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/70 mb-1.5">Positive</p>
              <div className="space-y-1">
                {positiveTypes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedEventType(t)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                      selectedEventType?.id === t.id
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-surface-2 text-text-secondary border-border hover:border-emerald-500/20'
                    }`}
                  >
                    <span>{t.name}</span>
                    <span className="float-right text-emerald-400">+{t.points}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Negative */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/70 mb-1.5">Negative</p>
              <div className="space-y-1">
                {negativeTypes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedEventType(t)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                      selectedEventType?.id === t.id
                        ? 'bg-red-500/15 text-red-400 border-red-500/30'
                        : 'bg-surface-2 text-text-secondary border-border hover:border-red-500/20'
                    }`}
                  >
                    <span>{t.name}</span>
                    <span className="float-right text-red-400">{t.points}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom type */}
          {customType && (
            <button
              onClick={() => setSelectedEventType(customType)}
              className={`w-full mt-2 text-left px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                selectedEventType?.id === customType.id
                  ? 'bg-cw/15 text-cw border-cw/30'
                  : 'bg-surface-2 text-text-secondary border-border hover:border-cw/20'
              }`}
            >
              Others (Custom Points)
            </button>
          )}
        </div>

        {/* Custom points input */}
        {selectedEventType?.category === 'custom' && (
          <div className="mb-4">
            <label className="text-xs text-text-muted mb-1.5 block">Custom Points</label>
            <input
              type="number"
              value={customPoints}
              onChange={e => setCustomPoints(parseInt(e.target.value) || 0)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
              placeholder="Enter points (negative or positive)"
            />
          </div>
        )}

        {/* Notes */}
        <div className="mb-4">
          <label className="text-xs text-text-muted mb-1.5 block">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary resize-none"
            placeholder="Add context..."
          />
        </div>

        {/* Preview + Submit */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="text-sm">
            <span className="text-text-muted">Points: </span>
            <span className={`font-bold ${previewPoints > 0 ? 'text-emerald-400' : previewPoints < 0 ? 'text-red-400' : 'text-text-secondary'}`}>
              {previewPoints > 0 ? '+' : ''}{previewPoints}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!selectedChatter || !selectedEventType || submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cw text-white text-sm font-medium hover:bg-cw/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Plus size={14} />
            {submitting ? 'Logging...' : 'Log Event'}
          </button>
        </div>
      </div>

      {/* Right: Recent events */}
      <div className="bg-surface-1 rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Clock size={14} className="text-text-muted" />
          Recent Events This Week
        </h3>

        {loadingRecent ? (
          <div className="text-sm text-text-muted text-center py-8">Loading...</div>
        ) : recentEvents.length === 0 ? (
          <div className="text-sm text-text-muted text-center py-8">No events logged this week</div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {recentEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-2 border border-border">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  ev.points > 0 ? 'bg-emerald-500/15 text-emerald-400' : ev.points < 0 ? 'bg-red-500/15 text-red-400' : 'bg-zinc-500/15 text-zinc-400'
                }`}>
                  {ev.points > 0 ? '+' : ''}{ev.points}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">
                    {ev.chatter?.full_name ?? 'Unknown'}
                  </p>
                  <p className="text-[10px] text-text-muted truncate">
                    {ev.event_type?.name ?? 'Event'} · {ev.date}
                    {ev.notes ? ` · ${ev.notes}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(ev.id)}
                  className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors shrink-0"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
