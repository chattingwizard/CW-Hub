import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { getDayName, SHIFT_LABELS } from '../lib/utils';
import { Clock, Calendar, CheckCircle, AlertCircle, Users as UsersIcon } from 'lucide-react';
import ModelAvatar from '../components/ModelAvatar';
import type { Schedule, Model, ChatterHours, Chatter } from '../types';

export default function ChatterDashboard() {
  const { profile } = useAuthStore();
  const [myChatter, setMyChatter] = useState<Chatter | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [weekHours, setWeekHours] = useState<ChatterHours[]>([]);
  const [loading, setLoading] = useState(true);

  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0]!;
  };

  const weekStart = getWeekStart();

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    // Get my chatter record
    const { data: chatterData } = await supabase
      .from('chatters')
      .select('*')
      .eq('profile_id', profile.id)
      .single();

    if (!chatterData) {
      setLoading(false);
      return;
    }

    const chatter = chatterData as Chatter;
    setMyChatter(chatter);

    const weekEnd = new Date(weekStart + 'T00:00:00');
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0]!;

    // Fetch schedule, team models, and hours
    const [schedulesRes, modelsRes, hoursRes] = await Promise.all([
      supabase.from('schedules').select('*').eq('chatter_id', chatter.id).eq('week_start', weekStart),
      chatter.team_name
        ? supabase.from('models').select('*').contains('team_names', [chatter.team_name])
        : Promise.resolve({ data: [] }),
      supabase.from('chatter_hours').select('*').eq('chatter_id', chatter.id).gte('date', weekStart).lte('date', weekEndStr),
    ]);

    setSchedules((schedulesRes.data ?? []) as Schedule[]);
    setModels((modelsRes.data ?? []) as Model[]);
    setWeekHours((hoursRes.data ?? []) as ChatterHours[]);
    setLoading(false);
  }, [profile, weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalHours = weekHours.reduce((sum, h) => sum + (h.hours_worked || 0), 0);
  const daysWorked = weekHours.filter((h) => h.hours_worked >= 1).length;
  const todayDayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todaySchedule = schedules.find((s) => s.day_of_week === todayDayIdx);

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-text-secondary">
          <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
          Loading your dashboard...
        </div>
      </div>
    );
  }

  if (!myChatter) {
    return (
      <div className="p-4 lg:p-6">
        <div className="bg-surface-1 border border-border rounded-xl p-8 text-center max-w-lg mx-auto mt-12">
          <div className="w-16 h-16 rounded-full bg-warning/15 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-warning" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Account Not Linked</h2>
          <p className="text-text-secondary text-sm leading-relaxed">
            Your Hub account hasn't been linked to a chatter profile yet.
            Please contact your Team Leader or Rycel to link your account.
          </p>
          <div className="mt-6 bg-surface-2 rounded-lg p-4 text-left">
            <p className="text-xs text-text-muted mb-1">Your account email:</p>
            <p className="text-sm text-white">{profile?.email}</p>
            <p className="text-xs text-text-muted mt-2 mb-1">Your name:</p>
            <p className="text-sm text-white">{profile?.full_name || 'Not set'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-text-primary">Hey {firstName}!</h1>
        <p className="text-text-secondary text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {myChatter.team_name && (
            <span className="text-cw"> &middot; {myChatter.team_name}</span>
          )}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mb-6">
        {/* Hours */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Hours This Week</span>
            <div className="w-8 h-8 rounded-lg bg-cw/10 flex items-center justify-center">
              <Clock size={16} className="text-cw" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-3xl font-bold text-white">{totalHours.toFixed(1)}<span className="text-lg text-text-muted">h</span></p>
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#252525" strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#1d9bf0" strokeWidth="3"
                  strokeDasharray={`${Math.min((totalHours / 40) * 100, 100)}, 100`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-text-secondary font-medium">
                {Math.round((totalHours / 40) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Days */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Days Worked</span>
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
              <Calendar size={16} className="text-success" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mb-3">{daysWorked}<span className="text-lg text-text-muted">/7</span></p>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const worked = weekHours.some((h) => {
                const d = new Date(h.date + 'T00:00:00');
                const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                return dayIdx === i && h.hours_worked >= 1;
              });
              const isToday = i === todayDayIdx;
              return (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium ${
                    worked ? 'bg-cw text-white' : isToday ? 'bg-surface-3 border border-cw/50 text-cw' : 'bg-surface-3 text-text-muted'
                  }`}
                  title={getDayName(i, 'long')}
                >
                  {worked ? <CheckCircle size={12} /> : getDayName(i).charAt(0)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Shift */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Today's Shift</span>
            <div className="w-8 h-8 rounded-lg bg-cw/10 flex items-center justify-center">
              <Clock size={16} className="text-cw" />
            </div>
          </div>
          {todaySchedule ? (
            <>
              <p className="text-xl font-bold text-white">{SHIFT_LABELS[todaySchedule.shift]}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs text-success">Scheduled</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-text-muted">Day Off</p>
              <p className="text-xs text-text-muted mt-2">No shift scheduled for today</p>
            </>
          )}
        </div>
      </div>

      {/* Weekly Schedule */}
      <div className="bg-surface-1 border border-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Your Schedule This Week</h2>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => {
            const sched = schedules.find((s) => s.day_of_week === i);
            const isToday = i === todayDayIdx;
            return (
              <div
                key={i}
                className={`rounded-lg p-3 text-center transition-colors ${
                  sched
                    ? isToday ? 'bg-cw/20 border-2 border-cw/50' : 'bg-cw/10 border border-cw/30'
                    : isToday ? 'bg-surface-2 border-2 border-border' : 'bg-surface-2 border border-border'
                }`}
              >
                <p className={`text-xs font-medium mb-1 ${sched ? 'text-cw' : isToday ? 'text-white' : 'text-text-muted'}`}>
                  {getDayName(i)}
                </p>
                <p className={`text-[11px] ${sched ? 'text-white' : 'text-text-muted'}`}>
                  {sched ? sched.shift : 'OFF'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team Models */}
      <div className="bg-surface-1 border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <UsersIcon size={16} className="text-cw" />
          <h2 className="text-sm font-semibold text-white">Your Team's Models</h2>
          <span className="text-xs text-text-muted">({models.filter((m) => m.status === 'Live').length} live)</span>
        </div>
        {models.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No models assigned to your team yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {models.filter((m) => m.status === 'Live').map((model) => (
              <div key={model.id} className="bg-surface-2 border border-border rounded-lg p-4 hover:border-cw/30 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <ModelAvatar name={model.name} pictureUrl={model.profile_picture_url} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{model.name}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">Live</span>
                  </div>
                </div>
                {model.niche.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {model.niche.slice(0, 2).map((n) => (
                      <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
