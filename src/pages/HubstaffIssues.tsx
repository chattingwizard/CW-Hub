import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { isAdminLevel } from '../lib/roles';
import type { HubstaffIssue } from '../types';
import {
  Bug,
  Send,
  FileText,
  Loader2,
  ImagePlus,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';

const ISSUE_TYPES = [
  { value: 'not_tracking', label: 'Not tracking hours' },
  { value: 'app_not_working', label: 'App not working' },
] as const;

const ISSUE_TYPE_MAP: Record<string, string> = Object.fromEntries(
  ISSUE_TYPES.map(t => [t.value, t.label]),
);

const TEAMS = ['Team Danilyn', 'Team Huckle', 'Team Ezekiel'] as const;

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const SCREENSHOT_BUCKET = 'hubstaff-screenshots';
const PUBLIC_URL_PREFIX = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/hubstaff-screenshots\//;

function extractStoragePath(urlOrPath: string): string {
  return urlOrPath.replace(PUBLIC_URL_PREFIX, '');
}

async function resolveSignedUrls(urls: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!urls.length) return map;

  const results = await Promise.allSettled(
    urls.map(async (raw) => {
      const path = extractStoragePath(raw);
      const { data } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) map.set(raw, data.signedUrl);
    }),
  );
  void results;
  return map;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

type Tab = 'report' | 'issues';
type StatusFilter = 'all' | 'open' | 'resolved';

export default function HubstaffIssues() {
  const { profile } = useAuthStore();
  const isAdmin = profile ? isAdminLevel(profile.role) : false;

  const [activeTab, setActiveTab] = useState<Tab>('report');

  // ── Form state ──
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const now = new Date();
  const [incDay, setIncDay] = useState(now.getDate());
  const [incMonth, setIncMonth] = useState(now.getMonth() + 1);
  const [incYear, setIncYear] = useState(now.getFullYear());
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [team, setTeam] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Issues list state ──
  const [issues, setIssues] = useState<HubstaffIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [signedUrlMap, setSignedUrlMap] = useState<Map<string, string>>(new Map());

  const loadIssues = useCallback(async () => {
    if (!profile) return;
    setLoadingIssues(true);

    let query = supabase
      .from('hubstaff_issues')
      .select('*, submitter:profiles!submitted_by(full_name)')
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('submitted_by', profile.id);
    }

    const { data } = await query;

    const mapped: HubstaffIssue[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      issue_type: row.issue_type as string,
      description: row.description as string,
      incident_date: row.incident_date as string,
      time_start: row.time_start as string,
      time_end: row.time_end as string,
      team: row.team as string,
      screenshot_urls: (row.screenshot_urls as string[] | null) ?? [],
      status: row.status as 'open' | 'resolved',
      resolution_notes: (row.resolution_notes as string | null) ?? null,
      submitted_by: row.submitted_by as string,
      submitted_by_name: ((row.submitter as Record<string, unknown> | null)?.full_name as string | undefined) ?? undefined,
      resolved_by: (row.resolved_by as string | null) ?? null,
      resolved_at: (row.resolved_at as string | null) ?? null,
      created_at: row.created_at as string,
    }));

    setIssues(mapped);
    setLoadingIssues(false);

    const allScreenshots = mapped.flatMap(i => i.screenshot_urls);
    if (allScreenshots.length > 0) {
      resolveSignedUrls(allScreenshots).then(setSignedUrlMap);
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    if (activeTab === 'issues') loadIssues();
  }, [activeTab, loadIssues]);

  const filteredIssues = useMemo(() => {
    if (statusFilter === 'all') return issues;
    return issues.filter(i => i.status === statusFilter);
  }, [issues, statusFilter]);

  // ── Submit handler ──
  async function handleSubmit() {
    if (!profile || !issueType || !description.trim() || !timeStart || !timeEnd || !team) return;
    const incidentDate = `${incYear}-${String(incMonth).padStart(2, '0')}-${String(incDay).padStart(2, '0')}`;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < screenshots.length; i++) {
        const file = screenshots[i]!;
        const ext = file.name.split('.').pop() ?? 'png';
        const path = `${profile.id}/${Date.now()}_${i}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, file, { contentType: file.type });

        if (uploadErr) throw new Error(`Screenshot upload failed: ${uploadErr.message}`);

        uploadedUrls.push(path);
      }

      const { error } = await supabase.from('hubstaff_issues').insert({
        issue_type: issueType,
        description: description.trim(),
        incident_date: incidentDate,
        time_start: timeStart,
        time_end: timeEnd,
        team,
        screenshot_urls: uploadedUrls,
        submitted_by: profile.id,
      });

      if (error) throw error;

      setSubmitResult({ ok: true, msg: 'Issue reported successfully.' });
      setIssueType('');
      setDescription('');
      const resetNow = new Date();
      setIncDay(resetNow.getDate());
      setIncMonth(resetNow.getMonth() + 1);
      setIncYear(resetNow.getFullYear());
      setTimeStart('');
      setTimeEnd('');
      setTeam('');
      setScreenshots([]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit issue.';
      setSubmitResult({ ok: false, msg: message });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Resolve handler ──
  async function handleResolve(issueId: string) {
    if (!profile) return;
    setResolving(true);

    const { error } = await supabase
      .from('hubstaff_issues')
      .update({
        status: 'resolved',
        resolution_notes: resolveNotes.trim() || null,
        resolved_by: profile.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', issueId);

    if (!error) {
      setExpandedId(null);
      setResolveNotes('');
      await loadIssues();
    }
    setResolving(false);
  }

  const tabs: { id: Tab; label: string; icon: typeof Bug }[] = [
    { id: 'report', label: 'Report Issue', icon: Send },
    { id: 'issues', label: isAdmin ? 'All Reports' : 'My Reports', icon: FileText },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Bug size={22} className="text-cw" />
          Hubstaff Issues
        </h1>
        <p className="text-sm text-text-muted mt-1">Report and track Hubstaff problems</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-1 p-1 rounded-lg border border-border w-fit">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === t.id
                  ? 'bg-cw/15 text-cw'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Report Issue ── */}
      {activeTab === 'report' && (
        <div className="bg-surface-1 border border-border rounded-xl p-6 space-y-5">
          {/* Issue type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Issue Type *</label>
            <select
              value={issueType}
              onChange={e => setIssueType(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cw"
            >
              <option value="">Select issue type...</option>
              {ISSUE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Team */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Team *</label>
            <select
              value={team}
              onChange={e => setTeam(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cw"
            >
              <option value="">Select team...</option>
              {TEAMS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Date *</label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={incDay}
                onChange={e => setIncDay(Number(e.target.value))}
                className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cw"
              >
                {Array.from({ length: daysInMonth(incMonth, incYear) }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                value={incMonth}
                onChange={e => {
                  const m = Number(e.target.value);
                  setIncMonth(m);
                  const maxDay = daysInMonth(m, incYear);
                  if (incDay > maxDay) setIncDay(maxDay);
                }}
                className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cw"
              >
                {MONTHS.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
              <select
                value={incYear}
                onChange={e => {
                  const y = Number(e.target.value);
                  setIncYear(y);
                  const maxDay = daysInMonth(incMonth, y);
                  if (incDay > maxDay) setIncDay(maxDay);
                }}
                className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cw"
              >
                {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Missing hours range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary">Start time *</label>
              <select
                value={timeStart}
                onChange={e => setTimeStart(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cw"
              >
                <option value="">Select...</option>
                {TIME_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary">End time *</label>
              <select
                value={timeEnd}
                onChange={e => setTimeEnd(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cw"
              >
                <option value="">Select...</option>
                {TIME_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe the issue you experienced with Hubstaff..."
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted/50 resize-none focus:outline-none focus:ring-1 focus:ring-cw"
            />
          </div>

          {/* Screenshots */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">
              Screenshots (optional, max 4)
            </label>

            {screenshots.length > 0 && (
              <div className="space-y-1.5">
                {screenshots.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2">
                    <ImagePlus size={16} className="text-cw shrink-0" />
                    <span className="text-sm text-text-primary truncate flex-1">{file.name}</span>
                    <button
                      onClick={() => setScreenshots(prev => prev.filter((_, i) => i !== idx))}
                      className="text-text-muted hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {screenshots.length < 4 && (
              <label className="flex items-center gap-2 bg-surface-2 border border-border border-dashed rounded-lg px-3 py-3 cursor-pointer hover:border-cw/40 transition-colors">
                <ImagePlus size={16} className="text-text-muted" />
                <span className="text-sm text-text-muted">
                  {screenshots.length === 0 ? 'Click to attach a screenshot' : 'Add another screenshot'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setSubmitResult({ ok: false, msg: 'File too large. Max 5MB per image.' });
                      return;
                    }
                    setScreenshots(prev => [...prev, file]);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !issueType || !description.trim() || !timeStart || !timeEnd || !team}
            className="flex items-center gap-2 px-5 py-2 bg-cw hover:bg-cw/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-all"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>

          {/* Result message */}
          {submitResult && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                submitResult.ok
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {submitResult.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {submitResult.msg}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Issues List ── */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-1 bg-surface-1 p-1 rounded-lg border border-border w-fit">
            {(['all', 'open', 'resolved'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  statusFilter === f
                    ? 'bg-cw/15 text-cw'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                }`}
              >
                {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Resolved'}
              </button>
            ))}
          </div>

          {loadingIssues ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-cw" />
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-16 text-text-muted text-sm">
              No issues found.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredIssues.map(issue => {
                const isExpanded = expandedId === issue.id;
                return (
                  <div
                    key={issue.id}
                    className="bg-surface-1 border border-border rounded-xl overflow-hidden"
                  >
                    {/* Row */}
                    <button
                      onClick={() => {
                        setExpandedId(isExpanded ? null : issue.id);
                        setResolveNotes('');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50 transition-colors"
                    >
                      {/* Status icon */}
                      {issue.status === 'open' ? (
                        <Clock size={16} className="text-yellow-400 shrink-0" />
                      ) : (
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      )}

                      {/* Type badge */}
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-3 text-text-secondary shrink-0">
                        {ISSUE_TYPE_MAP[issue.issue_type] ?? issue.issue_type}
                      </span>

                      {/* Description preview */}
                      <span className="text-sm text-text-primary truncate flex-1">
                        {issue.description}
                      </span>

                      {/* Submitter name (admin only) */}
                      {isAdmin && issue.submitted_by_name && (
                        <span className="text-[11px] text-text-muted shrink-0 hidden sm:block">
                          {issue.submitted_by_name}
                        </span>
                      )}

                      {/* Date */}
                      <span className="text-[11px] text-text-muted shrink-0">
                        {new Date(issue.created_at).toLocaleDateString()}
                      </span>

                      {isExpanded ? (
                        <ChevronUp size={14} className="text-text-muted shrink-0" />
                      ) : (
                        <ChevronDown size={14} className="text-text-muted shrink-0" />
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-text-muted uppercase">Date</span>
                            <p className="text-sm text-text-primary">
                              {new Date(issue.incident_date + 'T00:00:00').toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-text-muted uppercase">Missing hours</span>
                            <p className="text-sm text-text-primary">
                              {issue.time_start.slice(0, 5)} – {issue.time_end.slice(0, 5)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-text-muted uppercase">Team</span>
                            <p className="text-sm text-text-primary">{issue.team}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-text-muted uppercase">Reported</span>
                            <p className="text-sm text-text-primary">
                              {new Date(issue.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-text-muted uppercase">Description</span>
                          <p className="text-sm text-text-primary whitespace-pre-wrap mt-0.5">
                            {issue.description}
                          </p>
                        </div>

                        {issue.screenshot_urls.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold text-text-muted uppercase">
                              Screenshots ({issue.screenshot_urls.length})
                            </span>
                            <div className="flex flex-col gap-1 mt-1">
                              {issue.screenshot_urls.map((raw, idx) => {
                                const href = signedUrlMap.get(raw) ?? raw;
                                return (
                                  <a
                                    key={idx}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-cw text-sm hover:underline"
                                  >
                                    <ExternalLink size={13} />
                                    Screenshot {idx + 1}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {issue.status === 'resolved' && issue.resolution_notes && (
                          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase">Resolution notes</span>
                            <p className="text-sm text-text-primary mt-0.5 whitespace-pre-wrap">
                              {issue.resolution_notes}
                            </p>
                            {issue.resolved_at && (
                              <p className="text-[11px] text-text-muted mt-1">
                                Resolved {new Date(issue.resolved_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Resolve form (admin only, open issues only) */}
                        {isAdmin && issue.status === 'open' && (
                          <div className="space-y-2 pt-2 border-t border-border">
                            <textarea
                              value={resolveNotes}
                              onChange={e => setResolveNotes(e.target.value)}
                              rows={2}
                              placeholder="Resolution notes (optional)..."
                              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted/50 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                            />
                            <button
                              onClick={() => handleResolve(issue.id)}
                              disabled={resolving}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-all"
                            >
                              {resolving ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <CheckCircle2 size={13} />
                              )}
                              Mark as Resolved
                            </button>
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
      )}
    </div>
  );
}
