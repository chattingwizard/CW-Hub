import { Link } from 'react-router-dom';
import { Info, ChevronRight, Users, Shield, ClipboardCheck, BarChart3, Bell, CheckCircle2 } from 'lucide-react';

const STEPS = [
  { icon: <BarChart3 size={16} />, title: 'Queue Generated Automatically', desc: 'Every day at 11:00 PM UTC, the system analyzes all chatters\' performance, checks who needs coaching, and creates a prioritized queue for each Team Leader.' },
  { icon: <ClipboardCheck size={16} />, title: 'TL Opens the Hub → Coaching Queue', desc: 'When the TL starts their shift, they go to the Coaching Queue page. They see their chatters listed by priority — who needs coaching the most is at the top.' },
  { icon: <Users size={16} />, title: 'TL Does the Coaching Call', desc: 'Each chatter shows: performance score, red flag KPIs, specific talking points (what to discuss), and any active goals. The TL clicks on a chatter to see all the details they need for the call.' },
  { icon: <CheckCircle2 size={16} />, title: 'TL Marks It Done', desc: 'After the coaching call, the TL clicks the checkmark, fills in a quick form (Focus KPI, Target, Notes), and marks it complete. Takes 10 seconds.' },
  { icon: <Shield size={16} />, title: 'Management Monitors in Real-Time', desc: 'The Coaching Overview page shows completion rates for all TLs, live. No waiting for end-of-shift reports.' },
  { icon: <Bell size={16} />, title: 'Missed Coaching → Slack Alert', desc: 'If a TL ends their shift with coaching sessions still pending, an automatic alert is sent to #0-management-chatter. This is the only Slack notification now.' },
];

const BEFORE = [
  'Coaching instructions sent via Slack messages',
  'TLs received a text wall before each shift',
  'No way to track if coaching was actually done',
  'Compliance checked manually at end of shift',
];
const AFTER = [
  'Coaching queue lives inside the CW Hub',
  'Clean checklist with priorities per TL',
  'Checkmarks to mark coaching as done',
  'Automatic compliance tracking in real-time',
  'Management can monitor everything live',
];

export default function CoachingWorkflow() {
  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2.5">
          <Info size={22} className="text-cw" />
          Coaching Workflow Guide
        </h1>
        <p className="text-text-secondary text-sm mt-1">How the coaching system works — step by step</p>
      </div>

      {/* What Changed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-danger" /> Before
          </h3>
          <ul className="space-y-2">
            {BEFORE.map((item, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-danger/50 mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-success" /> Now
          </h3>
          <ul className="space-y-2">
            {AFTER.map((item, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-success/50 mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Flow Steps */}
      <div className="bg-surface-1 border border-border rounded-xl p-5">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-5">Daily Flow</h3>
        <div className="space-y-0">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-cw/15 border border-cw/30 flex items-center justify-center text-cw text-xs font-bold shrink-0">
                  {i + 1}
                </div>
                {i < STEPS.length - 1 && <div className="w-px flex-1 bg-border min-h-[16px]" />}
              </div>
              <div className="pb-5 flex-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="text-cw">{step.icon}</span>
                  {step.title}
                </h4>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Who Sees What */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-surface-1 border-l-2 border-l-cw border border-border rounded-xl p-5">
          <h4 className="text-sm font-bold text-white mb-2">Team Leaders</h4>
          <p className="text-xs text-text-muted leading-relaxed">
            <strong className="text-white">Coaching Queue</strong> — personal checklist for the day.
            Chatters sorted by priority, KPIs, red flags, talking points, checkmarks to mark complete, progress bar.
          </p>
        </div>
        <div className="bg-surface-1 border-l-2 border-l-purple-400 border border-border rounded-xl p-5">
          <h4 className="text-sm font-bold text-white mb-2">Management</h4>
          <p className="text-xs text-text-muted leading-relaxed">
            <strong className="text-white">Coaching Overview</strong> — bird's eye view of all teams.
            Completion rate per TL, which chatters were coached vs missed, red flag counts.
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-surface-1 border border-cw/20 rounded-xl p-5">
        <h3 className="text-xs font-bold text-cw uppercase tracking-wider mb-3">Quick Links</h3>
        <div className="space-y-2">
          <Link to="/coaching-queue" className="flex items-center justify-between px-3 py-2.5 bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors">
            <span className="text-xs font-medium text-white flex items-center gap-2"><ClipboardCheck size={14} className="text-cw" /> Coaching Queue</span>
            <ChevronRight size={14} className="text-text-muted" />
          </Link>
          <Link to="/coaching-overview" className="flex items-center justify-between px-3 py-2.5 bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors">
            <span className="text-xs font-medium text-white flex items-center gap-2"><Shield size={14} className="text-purple-400" /> Coaching Overview</span>
            <ChevronRight size={14} className="text-text-muted" />
          </Link>
          <Link to="/coaching-analytics" className="flex items-center justify-between px-3 py-2.5 bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors">
            <span className="text-xs font-medium text-white flex items-center gap-2"><BarChart3 size={14} className="text-amber-400" /> Coaching Analytics</span>
            <ChevronRight size={14} className="text-text-muted" />
          </Link>
        </div>
      </div>
    </div>
  );
}
