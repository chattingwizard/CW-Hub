import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { getDayName, SHIFT_LABELS } from '../lib/utils';
import { Clock, Calendar, CheckCircle } from 'lucide-react';
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

    // Fetch my schedule, team models, and hours
    const weekEnd = new Date(weekStart + 'T00:00:00');
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0]!;

    const [schedulesRes, modelsRes, hoursRes] = await Promise.all([
      supabase.from('schedules').select('*').eq('chatter_id', chatter.id).eq('week_start', weekStart),
      supabase.from('models').select('*').contains('team_names', [chatter.team_name ?? '']),
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
  const todaySchedule = schedules.find((s) => {
    const today = new Date();
    const dayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
    return s.day_of_week === dayIdx;
  });

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (!myChatter) {
    return (
      <div className="p-6">
        <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Account Not Linked</h2>
          <p className="text-text-secondary">
            Your account hasn't been linked to a chatter profile yet.
            Please contact your Team Leader or admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Hey {firstName}! Here's your week</h1>
        <p className="text-text-secondary text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Hours */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Hours This Week</span>
            <Clock size={18} className="text-cw" />
          </div>
          <div className="flex items-center gap-4">
            <p className="text-3xl font-bold text-white">{totalHours.toFixed(1)}h</p>
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
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-text-secondary">
                {Math.round((totalHours / 40) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Days */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Days Worked</span>
            <Calendar size={18} className="text-cw" />
          </div>
          <p className="text-3xl font-bold text-white mb-2">{daysWorked}/6</p>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const worked = weekHours.some((h) => {
                const d = new Date(h.date + 'T00:00:00');
                const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                return dayIdx === i && h.hours_worked >= 1;
              });
              return (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    worked ? 'bg-cw' : 'bg-surface-3'
                  }`}
                >
                  {worked && <CheckCircle size={12} className="text-white" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Shift */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Today's Shift</span>
            <Clock size={18} className="text-cw" />
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
              <p className="text-xs text-text-muted mt-2">No shift scheduled</p>
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
            return (
              <div
                key={i}
                className={`rounded-lg p-3 text-center ${
                  sched ? 'bg-cw/15 border border-cw/30' : 'bg-surface-2 border border-border'
                }`}
              >
                <p className={`text-xs font-medium mb-1 ${sched ? 'text-cw' : 'text-text-muted'}`}>
                  {getDayName(i)}
                </p>
                <p className={`text-xs ${sched ? 'text-white' : 'text-text-muted'}`}>
                  {sched ? sched.shift : 'OFF'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team Models */}
      <div className="bg-surface-1 border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Your Team's Models</h2>
        {models.length === 0 ? (
          <p className="text-sm text-text-muted">No models assigned to your team yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {models.filter((m) => m.status === 'Live').map((model) => (
              <div key={model.id} className="bg-surface-2 border border-border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-cw/15 flex items-center justify-center text-cw font-medium">
                    {model.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{model.name}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">
                      Live
                    </span>
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
