// ============================================================
// CW Hub — Type Definitions
// ============================================================

// ── Roles ────────────────────────────────────────────────────

export type UserRole =
  | 'owner'
  | 'admin'
  | 'team_leader'
  | 'script_manager'
  | 'va'
  | 'chatter'
  | 'recruit';

// ── Core Entities ────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  airtable_chatter_id: string | null;
  team_name: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface Model {
  id: string;
  airtable_id: string;
  name: string;
  status: 'Live' | 'On Hold' | 'Dead' | 'Pending Invoice';
  page_type: string | null;
  profile_picture_url: string | null;
  niche: string[];
  traffic_sources: string[];
  client_name: string | null;
  team_names: string[];
  chatbot_active: boolean;
  scripts_url: string | null;
  details: Record<string, Record<string, unknown>>;
  synced_at: string;
}

export interface ModelChange {
  id: string;
  model_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface ModelProfileView {
  user_id: string;
  model_id: string;
  last_viewed_at: string;
}

export interface ImportantNote {
  id: string;
  model_id: string;
  note: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Chatter {
  id: string;
  airtable_id: string;
  full_name: string;
  status: string;
  airtable_role: string | null;
  team_name: string | null;
  favorite_shift: string | null;
  profile_id: string | null;
  hubstaff_user_id: number | null;
  synced_at: string;
}

// ── Schedules & Assignments ──────────────────────────────────

export type ShiftSlot = '00:00-08:00' | '08:00-16:00' | '16:00-00:00';

export interface Schedule {
  id: string;
  chatter_id: string;
  week_start: string;
  day_of_week: number; // 0=Mon, 6=Sun
  shift: ShiftSlot;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  chatter?: Chatter;
}

export interface ModelChatterAssignment {
  id: string;
  model_id: string;
  chatter_id: string;
  team_name: string | null;
  assignment_group: string | null;
  assigned_by: string | null;
  assigned_at: string;
  active: boolean;
  model?: Model;
  chatter?: Chatter;
}

// ── Assignment Groups ────────────────────────────────────────

export interface AssignmentGroup {
  id: string;
  name: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  active: boolean;
}

export interface AssignmentGroupModel {
  id: string;
  group_id: string;
  model_id: string;
  assigned_by: string | null;
  assigned_at: string;
  model?: Model;
}

export interface AssignmentGroupChatter {
  id: string;
  group_id: string;
  chatter_id: string;
  assigned_by: string | null;
  assigned_at: string;
  chatter?: Chatter;
}

export interface AssignmentGroupOverride {
  id: string;
  group_id: string;
  chatter_id: string;
  date: string;
  assigned_by: string | null;
  created_at: string;
  chatter?: Chatter;
}

// ── Assignment Presets ───────────────────────────────────────

export interface AssignmentPresetSnapshot {
  groups: { id: string; name: string; sort_order: number }[];
  models: { group_id: string; model_id: string }[];
}

export interface AssignmentPreset {
  id: string;
  name: string;
  snapshot: AssignmentPresetSnapshot;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Metrics ──────────────────────────────────────────────────

export interface ModelDailyStat {
  id: string;
  model_id: string;
  date: string;
  new_fans: number;
  active_fans: number;
  fans_renew_on: number;
  renew_pct: number;
  expired_change: number;
  total_earnings: number;
  message_earnings: number;
  subscription_earnings: number;
  tips_earnings: number;
  avg_spend_per_spender: number;
  avg_sub_length_days: number;
  of_ranking: string | null;
  following: number;
  synced_at: string;
  model?: Model;
}

export interface ChatterDailyStat {
  id: number;
  date: string;
  employee_name: string;
  team: string;
  creators: string;
  sales: number;
  ppv_sales: number;
  tips: number;
  dm_sales: number;
  mass_msg_sales: number;
  of_mass_msg_sales: number;
  messages_sent: number;
  ppvs_sent: number;
  ppvs_unlocked: number;
  character_count: number;
  golden_ratio: number;
  unlock_rate: number;
  fan_cvr: number;
  fans_chatted: number;
  fans_who_spent: number;
  avg_earnings_per_spender: number;
  response_time_scheduled: string | null;
  response_time_clocked: string | null;
  scheduled_hours: number;
  clocked_hours: number;
  sales_per_hour: number;
  messages_per_hour: number;
  fans_per_hour: number;
}

// ── Traffic / Workload ───────────────────────────────────────

export type TrafficLevel = 'high' | 'medium' | 'low' | 'none';
export type TrafficTrend = 'up' | 'down' | 'stable';
export type PageType = 'Free Page' | 'Paid Page' | 'Mixed' | null;

export const WORKLOAD_WEIGHTS: Record<string, number> = {
  'Free Page': 1.0,
  'Mixed': 0.7,
  'Paid Page': 0.4,
};

export interface ModelTraffic {
  model_id: string;
  model_name: string;
  model_status: string;
  page_type: PageType;
  new_fans_avg: number;
  active_fans: number;
  chatters_assigned: number;
  fans_per_chatter: number;
  workload: number;
  workload_pct: number;
  workload_per_chatter: number;
  trend: TrafficTrend;
  trend_pct: number;
  level: TrafficLevel;
  team_names: string[];
  earnings_per_day: number;
  tips_per_day: number;
  message_earnings_per_day: number;
  subscription_earnings_per_day: number;
  earnings_trend_pct: number;
  renew_pct: number;
  avg_spend_per_spender: number;
  avg_sub_length_days: number;
  ltv: number;
}

export interface TeamTraffic {
  team_name: string;
  total_new_fans_avg: number;
  total_active_fans: number;
  total_workload: number;
  total_workload_pct: number;
  chatter_count: number;
  model_count: number;
  fans_per_chatter: number;
  workload_per_chatter: number;
  workload_pct_per_chatter: number;
  free_count: number;
  paid_count: number;
  mixed_count: number;
}

// ── Coaching ─────────────────────────────────────────────────

export type CoachingStatus = 'pending' | 'completed' | 'skipped';

export interface CoachingRedFlag {
  kpi: string;
  value: number | string;
  threshold: number;
}

export interface CoachingTalkingPoint {
  kpi: string;
  target: string;
  actions: string[];
}

export interface CoachingGoalProgress {
  kpi: string;
  current: number;
  target: number;
  baseline: number | null;
  status: 'reached' | 'improving' | 'declined' | 'unknown';
}

export interface CoachingTask {
  id: number;
  date: string;
  chatter_name: string;
  team_tl: string;
  priority: number;
  perf_score: number | null;
  days_since_coaching: number;
  red_flags: CoachingRedFlag[];
  talking_points: CoachingTalkingPoint[];
  kpis: Record<string, number | string>;
  perf_source: string;
  active_goal: { kpi: string; target: number; baseline: number | null; date: string } | null;
  goal_progress: CoachingGoalProgress | null;
  prev_score: number | null;
  trend_arrow: string;
  trend_delta: number;
  recent_reports: { date: string; resolution: string }[];
  status: CoachingStatus;
  completed_at: string | null;
  completed_by: string | null;
}

export interface CoachingLog {
  id: number;
  task_id: number | null;
  date: string;
  chatter_name: string;
  team_tl: string;
  completed_by: string | null;
  focus_kpi: string | null;
  target_value: number | null;
  baseline_value: number | null;
  notes: string | null;
  perf_score: number | null;
  kpis: Record<string, number | string>;
  created_at: string;
}

// ── Tracker Integration (prepared — not connected yet) ───────

export type ChatterOnlineStatus = 'online' | 'on_break' | 'offline' | 'absent';

export interface ChatterHours {
  id: string;
  chatter_id: string;
  date: string;
  hours_worked: number;
  synced_at: string;
}

export interface ChatterLiveStatus {
  chatter_id: string;
  chatter_name: string;
  team_name: string | null;
  status: ChatterOnlineStatus;
  clock_in: string | null;
  elapsed_seconds: number;
  activity_pct: number | null;
  scheduled_shift: ShiftSlot | null;
}

// ── Notifications & Announcements ────────────────────────────

export type NotificationType = 'coaching' | 'schedule' | 'alert' | 'announcement' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  action_url: string | null;
  created_at: string;
}

export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  author_id: string;
  priority: AnnouncementPriority;
  target_roles: UserRole[];
  pinned: boolean;
  created_at: string;
  author?: Profile;
}

// ── Module System ────────────────────────────────────────────

export type ModuleType = 'internal';

export interface HubModule {
  id: string;
  name: string;
  icon: string;
  type: ModuleType;
  path: string;
  roles: UserRole[];
  badge?: string | null;
  disabled?: boolean;
  external?: boolean;
  dividerBefore?: boolean;
  section?: 'main' | 'coaching' | 'tools' | 'system';
}

// ── Tasks ───────────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskCategory = 'operations' | 'coaching' | 'content' | 'recruitment' | 'technical' | 'admin' | 'other';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  assignee_id: string | null;
  creator_id: string;
  team: string | null;
  due_date: string | null;
  labels: string[];
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
  creator?: Profile;
}

// ── Documents (Knowledge Base) ──────────────────────────────

export type DocCategory = 'company' | 'role_overview' | 'workflow' | 'training' | 'policy' | 'guide';

export interface Document {
  id: string;
  title: string;
  content: string;
  category: DocCategory;
  target_roles: string[];
  author_id: string | null;
  icon: string;
  sort_order: number;
  parent_id: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  author?: Profile;
}

// ── Chatter Score System ────────────────────────────────────

export interface ScoreEventType {
  id: string;
  name: string;
  points: number;
  category: 'positive' | 'negative' | 'custom';
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ScoreEvent {
  id: string;
  chatter_id: string;
  submitted_by: string;
  date: string;
  event_type_id: string;
  points: number;
  custom_points: number | null;
  notes: string | null;
  week: string;
  created_at: string;
  event_type?: ScoreEventType;
  chatter?: Chatter;
  submitter?: Profile;
}

export interface ScoreWeeklyReport {
  id: string;
  chatter_id: string;
  submitted_by: string;
  week_start: string;
  week: string;
  reply_time_bucket: string | null;
  no_shift_incidence: boolean;
  all_reports_sent: boolean;
  weekly_points: number;
  notes: string | null;
  created_at: string;
  chatter?: Chatter;
}

export interface KPIRuleTier {
  threshold: number;
  pts: number;
}

export interface KPIRule {
  t1: KPIRuleTier;
  t2: KPIRuleTier;
  t3: KPIRuleTier;
  below_pts: number;
}

export interface KPIRules {
  golden_ratio: KPIRule;
  fan_cvr: KPIRule;
  unlock_rate: KPIRule;
  reply_time: KPIRule;
}

export interface ScoreConfig {
  id: number;
  base_score: number;
  reply_time_points: Record<string, number>;
  no_shift_incidence_pts: number;
  all_reports_sent_pts: number;
  team_bonus_pts: number;
  tier_20_threshold: number;
  tier_10_threshold: number;
  tier_5_threshold: number;
  warning_threshold: number;
  tier_20_amount: number;
  tier_10_amount: number;
  tier_5_amount: number;
  silver_threshold?: number;
  silver_amount?: number;
  kpi_rules?: KPIRules;
  updated_by: string | null;
  updated_at: string;
}

export type ScoreStatus = 'diamond' | 'platinum' | 'gold' | 'silver' | 'neutral' | 'bronze';

// ── Hubstaff Issues ─────────────────────────────────────────

export interface HubstaffIssue {
  id: string;
  issue_type: string;
  description: string;
  incident_date: string;
  time_start: string;
  time_end: string;
  team: string;
  screenshot_urls: string[];
  status: 'open' | 'resolved';
  resolution_notes: string | null;
  submitted_by: string;
  submitted_by_name?: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ── Shift Reports ───────────────────────────────────────────

export interface ShiftReport {
  id: string;
  chatter_id: string;
  date: string;
  team: string;
  model_team: number;
  traffic_level: 'low' | 'moderate' | 'high';
  has_incident: boolean;
  incident_notes: string | null;
  has_cover: boolean;
  cover_notes: string | null;
  notes: string | null;
  submitted_by: string;
  created_at: string;
  chatter?: Chatter;
}

export interface ShiftReportAlert {
  id: string;
  chatter_id: string;
  chatter_name: string;
  date: string;
  shift: string;
  action: 'accepted' | 'dismissed';
  resolved_by: string;
  created_at: string;
}

export interface ChatterWeeklyScore {
  chatter_id: string;
  chatter_name: string;
  team_name: string | null;
  base_score: number;
  event_points: number;
  weekly_report_points: number;
  total: number;
  status: ScoreStatus;
  bonus_amount: number;
  events: ScoreEvent[];
  weekly_report: ScoreWeeklyReport | null;
}

// ── Audit Rounds ────────────────────────────────────────────

export interface AuditRound {
  id: number;
  tl_user_id: string;
  tl_name: string;
  shift_date: string;
  round_number: number;
  started_at: string;
  completed_at: string | null;
  chatters_reviewed: number;
  issues_found: number;
  traffic_level: 'low' | 'medium' | 'high' | null;
  has_unanswered: boolean;
  unanswered_chatters: string | null;
  unanswered_models: string | null;
  has_backlog: boolean;
  backlog_chatters: string | null;
  backlog_models: string | null;
  has_other_issues: boolean;
  other_issues_notes: string | null;
  screenshot_urls: string[];
  voice_checks: VoiceCheck[];
  created_at: string;
}

export interface VoiceCheck {
  chatter_name: string;
  responded: boolean;
}

export interface AuditFlag {
  id: number;
  round_id: number;
  chatter_name: string;
  model_account: string | null;
  notes: string;
  created_at: string;
}
