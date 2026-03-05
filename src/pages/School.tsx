import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { SECTIONS } from '../lib/schoolData';
import { Loader2, Lock, CheckCircle2, PlayCircle, GraduationCap, Clock, BookOpen } from 'lucide-react';
import ErrorState from '../components/ErrorState';

interface ProgressRow { module_id: string; completed: boolean }
interface QuizRow { module_id: string; passed: boolean; percentage: number }
interface UnlockRow { section_id: string }

export default function School() {
  const { profile } = useAuthStore();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [pRes, qRes, uRes] = await Promise.all([
        supabase.from('progress').select('module_id, completed').eq('user_id', profile.id),
        supabase.from('quiz_results').select('module_id, passed, percentage').eq('user_id', profile.id),
        supabase.from('section_unlocks').select('section_id').eq('user_id', profile.id),
      ]);
      setProgress((pRes.data ?? []) as ProgressRow[]);
      setQuizzes((qRes.data ?? []) as QuizRow[]);
      setUnlocks((uRes.data ?? []) as UnlockRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load progress');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const completedModules = useMemo(() => new Set(progress.filter(p => p.completed).map(p => p.module_id)), [progress]);
  const passedQuizzes = useMemo(() => new Set(quizzes.filter(q => q.passed).map(q => q.module_id)), [quizzes]);
  const manualUnlocks = useMemo(() => new Set(unlocks.map(u => u.section_id)), [unlocks]);

  const isSectionUnlocked = useCallback((sectionId: string, gateQuiz: string | null, alwaysOpen?: boolean): boolean => {
    if (!gateQuiz || alwaysOpen) return true;
    if (manualUnlocks.has(sectionId)) return true;
    if (profile && ['owner', 'admin'].includes(profile.role)) return true;
    return passedQuizzes.has(gateQuiz);
  }, [passedQuizzes, manualUnlocks, profile]);

  const totalModules = SECTIONS.reduce((acc, s) => acc + s.modules.length, 0);
  const totalCompleted = SECTIONS.reduce((acc, s) => acc + s.modules.filter(m => completedModules.has(m.id)).length, 0);
  const overallPct = totalModules > 0 ? Math.round((totalCompleted / totalModules) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-cw" size={24} />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 lg:p-6"><ErrorState message={error} onRetry={fetchData} /></div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary flex items-center gap-2.5">
            <GraduationCap size={24} className="text-cw" />
            Chatting School
          </h1>
          <p className="text-text-secondary text-sm mt-1">Complete each section to unlock the next. Pass quizzes with 80% or higher.</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold text-white">{overallPct}%</div>
          <div className="text-[10px] text-text-muted uppercase">Complete</div>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full bg-cw rounded-full transition-all duration-500" style={{ width: `${overallPct}%` }} />
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {SECTIONS.map((section) => {
          const unlocked = isSectionUnlocked(section.id, section.gateQuiz, section.alwaysOpen);
          const completed = section.modules.filter(m => completedModules.has(m.id)).length;
          const total = section.modules.length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

          return (
            <div key={section.id} className={`bg-surface-1 border rounded-xl overflow-hidden transition-opacity ${unlocked ? 'border-border' : 'border-border/40 opacity-60'}`}>
              {/* Section header */}
              <div className="px-5 py-4 flex items-center gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: unlocked ? `${section.color}20` : undefined }}
                >
                  {!unlocked ? (
                    <Lock size={18} className="text-text-muted" />
                  ) : pct === 100 ? (
                    <CheckCircle2 size={20} className="text-success" />
                  ) : (
                    <BookOpen size={20} style={{ color: section.color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-bold text-white">{section.label}</h3>
                    {!unlocked && <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted font-bold">LOCKED</span>}
                    {unlocked && <span className="text-[10px] text-text-muted">{completed}/{total}</span>}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
                  {unlocked && total > 0 && (
                    <div className="mt-2.5 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: section.color }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Module list */}
              {unlocked && (
                <div className="border-t border-border/60">
                  {section.modules.map((mod, mIdx) => {
                    const done = completedModules.has(mod.id);
                    const quizPassed = passedQuizzes.has(mod.id);
                    const isGateQuiz = mod.hasQuiz && mod.quizQuestions && mod.quizQuestions.length > 0;

                    return (
                      <Link
                        key={mod.id}
                        to={`/school/${section.id}/${mod.id}`}
                        state={{ moduleData: mod }}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2/40 transition-colors border-b border-border/30 last:border-b-0 group"
                      >
                        <span className="text-[10px] text-text-muted/50 font-mono w-5 text-right shrink-0">{mIdx + 1}</span>
                        {done || quizPassed ? (
                          <CheckCircle2 size={16} className="text-success shrink-0" />
                        ) : (
                          <PlayCircle size={16} className="text-text-muted group-hover:text-white shrink-0 transition-colors" />
                        )}
                        <span className={`text-xs font-medium flex-1 ${done || quizPassed ? 'text-text-secondary' : 'text-white'}`}>
                          {mod.title}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {isGateQuiz && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${quizPassed ? 'bg-success/15 text-success' : 'bg-amber-500/15 text-amber-400'}`}>
                              {quizPassed ? 'PASSED' : 'QUIZ'}
                            </span>
                          )}
                          <span className="text-[10px] text-text-muted flex items-center gap-1">
                            <Clock size={10} />
                            {mod.duration}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
