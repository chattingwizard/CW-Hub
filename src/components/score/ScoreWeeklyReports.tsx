import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { calculateWeeklyReportPoints, weekKeyToMonday } from '../../lib/scoreUtils';
import type { Chatter, ScoreConfig, ScoreWeeklyReport } from '../../types';
import { Check, Clock, Edit3, X } from 'lucide-react';

interface Props {
  weekKey: string;
  chatters: Chatter[];
  config: ScoreConfig;
  onDataChange: () => void;
}

const TEAMS = ['Team Huckle', 'Team Danilyn', 'Team Ezekiel'];
const TEAM_COLORS: Record<string, string> = {
  'Team Huckle': 'border-orange-500/30',
  'Team Danilyn': 'border-blue-500/30',
  'Team Ezekiel': 'border-purple-500/30',
};

const REPLY_TIME_BUCKETS = [
  '00:00-00:59',
  '01:00-01:29',
  '01:30-01:59',
  '02:00-02:59',
  '03:00-03:29',
  '03:30-03:59',
  '04:00+',
];

export default function ScoreWeeklyReports({ weekKey, chatters, config, onDataChange }: Props) {
  const { profile } = useAuthStore();
  const [reports, setReports] = useState<ScoreWeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChatter, setEditingChatter] = useState<Chatter | null>(null);
  const [editingReport, setEditingReport] = useState<ScoreWeeklyReport | null>(null);

  const [replyTimeBucket, setReplyTimeBucket] = useState('');
  const [noIncidence, setNoIncidence] = useState(false);
  const [allReports, setAllReports] = useState(false);
  const [reportNotes, setReportNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadReports();
  }, [weekKey]);

  async function loadReports() {
    setLoading(true);
    const { data } = await supabase
      .from('score_weekly_reports')
      .select('*')
      .eq('week', weekKey);
    setReports(data || []);
    setLoading(false);
  }

  function openModal(chatter: Chatter, existingReport?: ScoreWeeklyReport) {
    setEditingChatter(chatter);
    setEditingReport(existingReport || null);
    setReplyTimeBucket(existingReport?.reply_time_bucket || '');
    setNoIncidence(existingReport?.no_shift_incidence || false);
    setAllReports(existingReport?.all_reports_sent || false);
    setReportNotes(existingReport?.notes || '');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingChatter(null);
    setEditingReport(null);
  }

  const previewPoints = calculateWeeklyReportPoints(
    { reply_time_bucket: replyTimeBucket, no_shift_incidence: noIncidence, all_reports_sent: allReports },
    config,
  );

  async function handleSubmitReport() {
    if (!editingChatter || !profile) return;
    setSubmitting(true);
    try {
      const monday = weekKeyToMonday(weekKey);
      const weekStart = monday.toISOString().slice(0, 10);

      const payload = {
        chatter_id: editingChatter.id,
        submitted_by: profile.id,
        week_start: weekStart,
        week: weekKey,
        reply_time_bucket: replyTimeBucket || null,
        no_shift_incidence: noIncidence,
        all_reports_sent: allReports,
        weekly_points: previewPoints,
        notes: reportNotes || null,
      };

      if (editingReport) {
        await supabase
          .from('score_weekly_reports')
          .update(payload)
          .eq('id', editingReport.id);
      } else {
        await supabase.from('score_weekly_reports').insert(payload);
      }

      closeModal();
      loadReports();
      onDataChange();
    } catch (err) {
      console.error('Error submitting weekly report:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-text-muted text-center py-12">Loading weekly reports...</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TEAMS.map(teamName => {
          const teamChatters = chatters.filter(c => c.team_name === teamName);
          const borderColor = TEAM_COLORS[teamName] || 'border-border';

          return (
            <div key={teamName} className={`bg-surface-1 rounded-xl border-2 ${borderColor} p-4`}>
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                {teamName}
                <span className="text-text-muted font-normal ml-1.5 text-xs">({teamChatters.length})</span>
              </h3>

              {teamChatters.length === 0 ? (
                <p className="text-xs text-text-muted py-4 text-center">No chatters</p>
              ) : (
                <div className="space-y-1.5">
                  {teamChatters.map(chatter => {
                    const report = reports.find(r => r.chatter_id === chatter.id);
                    const submitted = !!report;

                    return (
                      <div
                        key={chatter.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2 border border-border"
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          submitted ? 'bg-emerald-500/20' : 'bg-zinc-500/20'
                        }`}>
                          {submitted
                            ? <Check size={11} className="text-emerald-400" />
                            : <Clock size={11} className="text-zinc-500" />
                          }
                        </div>
                        <span className="text-xs text-text-primary flex-1 truncate">
                          {chatter.full_name}
                        </span>
                        {submitted && (
                          <span className="text-[10px] font-bold text-emerald-400">
                            +{report!.weekly_points}
                          </span>
                        )}
                        <button
                          onClick={() => openModal(chatter, report)}
                          className={`text-[10px] px-2 py-1 rounded-md font-medium transition-all ${
                            submitted
                              ? 'bg-surface-3 text-text-muted hover:text-cw'
                              : 'bg-cw/10 text-cw hover:bg-cw/20'
                          }`}
                        >
                          {submitted ? <Edit3 size={11} /> : 'Submit'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modalOpen && editingChatter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-surface-1 border border-border rounded-xl w-full max-w-md mx-4 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {editingReport ? 'Edit' : 'Submit'} Weekly Report
                </h3>
                <p className="text-xs text-text-muted">{editingChatter.full_name}</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted">
                <X size={16} />
              </button>
            </div>

            {/* Reply time buckets */}
            <div className="mb-4">
              <label className="text-xs text-text-muted mb-2 block">Average Reply Time</label>
              <div className="grid grid-cols-2 gap-1.5">
                {REPLY_TIME_BUCKETS.map(bucket => {
                  const pts = config.reply_time_points?.[bucket] ?? 0;
                  return (
                    <button
                      key={bucket}
                      onClick={() => setReplyTimeBucket(bucket)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        replyTimeBucket === bucket
                          ? pts >= 0
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/15 text-red-400 border-red-500/30'
                          : 'bg-surface-2 text-text-secondary border-border hover:border-text-muted/30'
                      }`}
                    >
                      <span>{bucket}</span>
                      <span className={`ml-1.5 ${pts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pts > 0 ? '+' : ''}{pts}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noIncidence}
                  onChange={e => setNoIncidence(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-surface-2 text-cw accent-cw"
                />
                <span className="text-xs text-text-primary">No shift incidence</span>
                <span className="text-xs text-emerald-400 ml-auto">+{config.no_shift_incidence_pts}</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allReports}
                  onChange={e => setAllReports(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-surface-2 text-cw accent-cw"
                />
                <span className="text-xs text-text-primary">All reports sent on time</span>
                <span className="text-xs text-emerald-400 ml-auto">+{config.all_reports_sent_pts}</span>
              </label>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="text-xs text-text-muted mb-1.5 block">Notes (optional)</label>
              <textarea
                value={reportNotes}
                onChange={e => setReportNotes(e.target.value)}
                rows={2}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary resize-none"
              />
            </div>

            {/* Preview + Submit */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="text-sm">
                <span className="text-text-muted">Weekly Bonus: </span>
                <span className={`font-bold ${previewPoints > 0 ? 'text-emerald-400' : 'text-text-secondary'}`}>
                  +{previewPoints} pts
                </span>
              </div>
              <button
                onClick={handleSubmitReport}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-cw text-white text-sm font-medium hover:bg-cw/90 disabled:opacity-40 transition-all"
              >
                {submitting ? 'Saving...' : editingReport ? 'Update' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
