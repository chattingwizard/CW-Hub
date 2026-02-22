// ============================================================
// CW Hub — Type Definitions
// ============================================================

// ── Roles ────────────────────────────────────────────────────

export type UserRole =
  | 'owner'
  | 'admin'
  | 'chatter_manager'
  | 'team_leader'
  | 'script_manager'
  | 'va'
  | 'personal_assistant'
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
  synced_at: string;
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

// ── Metrics ──────────────────────────────────────────────────

export interface ModelMetric {
  id: string;
  model_id: string;
  week_start: string;
  week_end: string;
  total_revenue: number;
  new_subs: number;
  messages_revenue: number;
  tips: number;
  refunds: number;
  warnings: string | null;
  observations: string | null;
  synced_at: string;
  model?: Model;
}

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

export interface ChatterSession {
  id: string;
  chatter_id: string;
  clock_in: string;
  clock_out: string | null;
  total_seconds: number | null;
  break_seconds: number;
  active_seconds: number | null;
  avg_activity_pct: number | null;
  status: 'active' | 'on_break' | 'completed' | 'disconnected';
  source: 'tracker' | 'manual';
}

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

// ── Uploads ──────────────────────────────────────────────────

export type UploadType = 'creator_report' | 'employee_report' | 'model_metrics' | 'chatter_hours';

export interface CsvUpload {
  id: string;
  uploaded_by: string;
  file_name: string;
  row_count: number;
  upload_type: UploadType;
  uploaded_at: string;
  uploader?: Profile;
}

// ── Module System ────────────────────────────────────────────

export type ModuleType = 'internal' | 'iframe';

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

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile;
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

// ── CSV Parsing ──────────────────────────────────────────────

export interface ModelMetricCSVRow {
  model_name: string;
  date: string;
  revenue: string;
  new_subs: string;
  messages_revenue: string;
  tips: string;
  refunds: string;
}
