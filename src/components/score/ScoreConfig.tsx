import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import type { ScoreConfig as ScoreConfigType, ScoreEventType } from '../../types';
import { Save, Plus, Trash2, RotateCcw } from 'lucide-react';

interface Props {
  config: ScoreConfigType;
  eventTypes: ScoreEventType[];
  onSave: () => void;
}

const REPLY_TIME_LABELS = [
  { key: '00:00-00:59', label: '< 1 min' },
  { key: '01:00-01:29', label: '1:00 – 1:29' },
  { key: '01:30-01:59', label: '1:30 – 1:59' },
  { key: '02:00-02:59', label: '2:00 – 2:59' },
  { key: '03:00-03:29', label: '3:00 – 3:29' },
  { key: '03:30-03:59', label: '3:30 – 3:59' },
  { key: '04:00+', label: '4:00+' },
];

export default function ScoreConfigPanel({ config, eventTypes, onSave }: Props) {
  const { profile } = useAuthStore();
  const [saving, setSaving] = useState(false);

  const [localTypes, setLocalTypes] = useState<(ScoreEventType & { _new?: boolean; _deleted?: boolean })[]>([]);
  const [replyPts, setReplyPts] = useState<Record<string, number>>({});
  const [incidencePts, setIncidencePts] = useState(config.no_shift_incidence_pts);
  const [reportsPts, setReportsPts] = useState(config.all_reports_sent_pts);
  const [baseScore, setBaseScore] = useState(config.base_score);
  const [tier20Threshold, setTier20Threshold] = useState(config.tier_20_threshold);
  const [tier10Threshold, setTier10Threshold] = useState(config.tier_10_threshold);
  const [tier5Threshold, setTier5Threshold] = useState(config.tier_5_threshold);
  const [warningThreshold, setWarningThreshold] = useState(config.warning_threshold);
  const [tier20Amount, setTier20Amount] = useState(config.tier_20_amount);
  const [tier10Amount, setTier10Amount] = useState(config.tier_10_amount);
  const [tier5Amount, setTier5Amount] = useState(config.tier_5_amount);

  useEffect(() => {
    setLocalTypes(eventTypes.map(t => ({ ...t })));
    setReplyPts({ ...(config.reply_time_points || {}) });
    setIncidencePts(config.no_shift_incidence_pts);
    setReportsPts(config.all_reports_sent_pts);
    setBaseScore(config.base_score);
    setTier20Threshold(config.tier_20_threshold);
    setTier10Threshold(config.tier_10_threshold);
    setTier5Threshold(config.tier_5_threshold);
    setWarningThreshold(config.warning_threshold);
    setTier20Amount(config.tier_20_amount);
    setTier10Amount(config.tier_10_amount);
    setTier5Amount(config.tier_5_amount);
  }, [config, eventTypes]);

  function updateType(id: string, field: string, value: string | number | boolean) {
    setLocalTypes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  function softDeleteType(id: string) {
    setLocalTypes(prev => prev.map(t => t.id === id ? { ...t, _deleted: !t._deleted, is_active: t._deleted ? true : false } : t));
  }

  function addNewType(category: 'positive' | 'negative') {
    setLocalTypes(prev => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: '',
        points: category === 'positive' ? 5 : -5,
        category,
        is_active: true,
        sort_order: prev.length,
        created_at: new Date().toISOString(),
        _new: true,
      },
    ]);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await supabase.from('score_config').update({
        base_score: baseScore,
        reply_time_points: replyPts,
        no_shift_incidence_pts: incidencePts,
        all_reports_sent_pts: reportsPts,
        tier_20_threshold: tier20Threshold,
        tier_10_threshold: tier10Threshold,
        tier_5_threshold: tier5Threshold,
        warning_threshold: warningThreshold,
        tier_20_amount: tier20Amount,
        tier_10_amount: tier10Amount,
        tier_5_amount: tier5Amount,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);

      for (const t of localTypes) {
        if (t._new && t.name) {
          await supabase.from('score_event_types').insert({
            name: t.name,
            points: t.points,
            category: t.category,
            is_active: t.is_active,
            sort_order: t.sort_order,
          });
        } else if (!t._new) {
          await supabase.from('score_event_types').update({
            name: t.name,
            points: t.points,
            is_active: t.is_active,
            sort_order: t.sort_order,
          }).eq('id', t.id);
        }
      }

      onSave();
    } catch (err) {
      console.error('Error saving config:', err);
    } finally {
      setSaving(false);
    }
  }

  const positiveTypes = localTypes.filter(t => t.category === 'positive');
  const negativeTypes = localTypes.filter(t => t.category === 'negative');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Event Types */}
        <div className="space-y-4">
          {/* Positive */}
          <div className="bg-surface-1 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Positive Events</h4>
              <button onClick={() => addNewType('positive')} className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                <Plus size={10} className="inline mr-0.5" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {positiveTypes.map(t => (
                <div key={t.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border ${t._deleted ? 'opacity-40 bg-surface-2 line-through' : 'bg-surface-2'}`}>
                  <input
                    value={t.name}
                    onChange={e => updateType(t.id, 'name', e.target.value)}
                    className="flex-1 bg-transparent text-xs text-text-primary outline-none"
                    placeholder="Event name..."
                  />
                  <input
                    type="number"
                    value={t.points}
                    onChange={e => updateType(t.id, 'points', parseInt(e.target.value) || 0)}
                    className="w-14 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-emerald-400 text-center"
                  />
                  <button onClick={() => softDeleteType(t.id)} className="p-1 hover:bg-red-500/10 rounded text-text-muted hover:text-red-400 transition-colors">
                    {t._deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Negative */}
          <div className="bg-surface-1 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">Negative Events</h4>
              <button onClick={() => addNewType('negative')} className="text-[10px] px-2 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                <Plus size={10} className="inline mr-0.5" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {negativeTypes.map(t => (
                <div key={t.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border ${t._deleted ? 'opacity-40 bg-surface-2 line-through' : 'bg-surface-2'}`}>
                  <input
                    value={t.name}
                    onChange={e => updateType(t.id, 'name', e.target.value)}
                    className="flex-1 bg-transparent text-xs text-text-primary outline-none"
                    placeholder="Event name..."
                  />
                  <input
                    type="number"
                    value={t.points}
                    onChange={e => updateType(t.id, 'points', parseInt(e.target.value) || 0)}
                    className="w-14 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-red-400 text-center"
                  />
                  <button onClick={() => softDeleteType(t.id)} className="p-1 hover:bg-red-500/10 rounded text-text-muted hover:text-red-400 transition-colors">
                    {t._deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Config values */}
        <div className="space-y-4">
          {/* Base Score */}
          <div className="bg-surface-1 rounded-xl border border-border p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Base Score</h4>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={baseScore}
                onChange={e => setBaseScore(parseInt(e.target.value) || 100)}
                className="w-24 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary text-center"
              />
              <span className="text-xs text-text-muted">points per week (resets Monday)</span>
            </div>
          </div>

          {/* Reply Time Points */}
          <div className="bg-surface-1 rounded-xl border border-border p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Reply Time Points</h4>
            <div className="space-y-1.5">
              {REPLY_TIME_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2">
                  <span className="text-xs text-text-secondary flex-1">{label}</span>
                  <input
                    type="number"
                    value={replyPts[key] ?? 0}
                    onChange={e => setReplyPts(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                    className="w-16 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-center text-text-primary"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Bonuses */}
          <div className="bg-surface-1 rounded-xl border border-border p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Weekly Checkbox Bonuses</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary flex-1">No shift incidence</span>
                <input
                  type="number"
                  value={incidencePts}
                  onChange={e => setIncidencePts(parseInt(e.target.value) || 0)}
                  className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-center text-text-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary flex-1">All reports sent</span>
                <input
                  type="number"
                  value={reportsPts}
                  onChange={e => setReportsPts(parseInt(e.target.value) || 0)}
                  className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-center text-text-primary"
                />
              </div>
            </div>
          </div>

          {/* Bonus Tiers */}
          <div className="bg-surface-1 rounded-xl border border-border p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Bonus Tiers</h4>
            <div className="space-y-2">
              {[
                { label: '$20 Bonus', threshold: tier20Threshold, setThreshold: setTier20Threshold, amount: tier20Amount, setAmount: setTier20Amount, color: 'text-emerald-400' },
                { label: '$10 Bonus', threshold: tier10Threshold, setThreshold: setTier10Threshold, amount: tier10Amount, setAmount: setTier10Amount, color: 'text-blue-400' },
                { label: '$5 Bonus', threshold: tier5Threshold, setThreshold: setTier5Threshold, amount: tier5Amount, setAmount: setTier5Amount, color: 'text-cyan-400' },
              ].map(tier => (
                <div key={tier.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2">
                  <span className={`text-xs font-medium w-20 ${tier.color}`}>{tier.label}</span>
                  <span className="text-[10px] text-text-muted">≥</span>
                  <input
                    type="number"
                    value={tier.threshold}
                    onChange={e => tier.setThreshold(parseInt(e.target.value) || 0)}
                    className="w-16 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-center text-text-primary"
                  />
                  <span className="text-[10px] text-text-muted">pts</span>
                  <span className="text-[10px] text-text-muted ml-auto">$</span>
                  <input
                    type="number"
                    value={tier.amount}
                    onChange={e => tier.setAmount(parseFloat(e.target.value) || 0)}
                    className="w-14 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-center text-text-primary"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2">
                <span className="text-xs font-medium w-20 text-red-400">Warning</span>
                <span className="text-[10px] text-text-muted">&lt;</span>
                <input
                  type="number"
                  value={warningThreshold}
                  onChange={e => setWarningThreshold(parseInt(e.target.value) || 0)}
                  className="w-16 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-center text-text-primary"
                />
                <span className="text-[10px] text-text-muted">pts</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cw text-white text-sm font-medium hover:bg-cw/90 disabled:opacity-40 transition-all"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
