// ============================================================
// CW Hub — Type Definitions
// ============================================================

export type UserRole = 'owner' | 'admin' | 'chatter' | 'recruit';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  airtable_chatter_id: string | null;
  team_name: string | null;
  is_active: boolean;
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
  // Joined
  model?: Model;
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

export interface Schedule {
  id: string;
  chatter_id: string;
  week_start: string;
  day_of_week: number; // 0=Mon, 6=Sun
  shift: '00:00-08:00' | '08:00-16:00' | '16:00-00:00';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  chatter?: Chatter;
}

export interface ModelChatterAssignment {
  id: string;
  model_id: string;
  chatter_id: string;
  assigned_by: string | null;
  assigned_at: string;
  active: boolean;
  // Joined
  model?: Model;
  chatter?: Chatter;
}

export interface ChatterHours {
  id: string;
  chatter_id: string;
  date: string;
  hours_worked: number;
  synced_at: string;
}

export interface CsvUpload {
  id: string;
  uploaded_by: string;
  file_name: string;
  row_count: number;
  upload_type: 'model_metrics' | 'chatter_hours';
  uploaded_at: string;
}

// Module system
export type ModuleType = 'internal' | 'iframe';

export interface HubModule {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  type: ModuleType;
  path: string; // Route path for internal, URL for iframe
  roles: UserRole[];
  badge?: string | null; // 'New', 'Beta', 'Soon'
  disabled?: boolean;
  external?: boolean; // Opens in new tab instead of iframe
  dividerBefore?: boolean; // Visual separator in sidebar
}

// CSV parsing
export interface ModelMetricCSVRow {
  model_name: string;
  date: string;
  revenue: string;
  new_subs: string;
  messages_revenue: string;
  tips: string;
  refunds: string;
}

// Model Daily Stats (from Creator Reports)
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
  // Joined
  model?: Model;
}

// Traffic calculations
export type TrafficLevel = 'high' | 'medium' | 'low' | 'none';
export type TrafficTrend = 'up' | 'down' | 'stable';

export interface ModelTraffic {
  model_id: string;
  model_name: string;
  new_fans_avg: number;       // 7-day average
  active_fans: number;        // Latest day
  chatters_assigned: number;
  fans_per_chatter: number;   // new_fans_avg / chatters
  trend: TrafficTrend;
  trend_pct: number;          // % change vs previous 7 days
  level: TrafficLevel;
  team_names: string[];
}

export interface TeamTraffic {
  team_name: string;
  total_new_fans_avg: number;
  total_active_fans: number;
  chatter_count: number;
  model_count: number;
  fans_per_chatter: number;
}

// Upload types extension
export type UploadType = 'model_metrics' | 'chatter_hours' | 'creator_report';
