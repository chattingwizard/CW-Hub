import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { Loader2, Lock, CheckCircle2, PlayCircle, GraduationCap } from 'lucide-react';
import ErrorState from '../components/ErrorState';

interface SectionDef {
  id: string;
  label: string;
  description: string;
  gateQuiz: string | null;
  modules: ModuleDef[];
}

interface ModuleDef {
  id: string;
  title: string;
  videoUrl: string | null;
  hasQuiz: boolean;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'foundations', label: 'Foundations', description: 'Core concepts and mindset for chatting success.',
    gateQuiz: null,
    modules: [
      { id: 'f-01', title: 'Welcome to CW', videoUrl: 'f-01.mp4', hasQuiz: false },
      { id: 'f-01-cw', title: 'CW Culture', videoUrl: 'f-01-cw.mp4', hasQuiz: false },
      { id: 'f-02', title: 'What is OF Chatting?', videoUrl: 'f-02.mp4', hasQuiz: false },
      { id: 'f-03', title: 'The Fan Psychology', videoUrl: 'f-03.mp4', hasQuiz: false },
      { id: 'f-04', title: 'Communication Basics', videoUrl: 'f-04.mp4', hasQuiz: false },
      { id: 'f-05', title: 'Building Rapport', videoUrl: 'f-05.mp4', hasQuiz: false },
      { id: 'f-06', title: 'Selling Without Selling', videoUrl: 'f-06.mp4', hasQuiz: false },
      { id: 'f-07', title: 'Sexting Fundamentals', videoUrl: 'f-07.mp4', hasQuiz: false },
      { id: 'f-08', title: 'PPV Strategy', videoUrl: 'f-08.mp4', hasQuiz: false },
      { id: 'f-09', title: 'KPIs That Matter', videoUrl: 'f-09.mp4', hasQuiz: false },
    ],
  },
  {
    id: 'tools', label: 'Tools & Scripts', description: 'Master the tools and scripts you\'ll use daily.',
    gateQuiz: 't-1',
    modules: [
      { id: 't-1', title: 'Tools Review Quiz', videoUrl: null, hasQuiz: true },
      { id: 't-02', title: 'Infloww Platform', videoUrl: 't-02-infloww-walkthrough.mp4', hasQuiz: false },
      { id: 't-03', title: 'Smart Messages', videoUrl: 't-03-scripts-and-sequences.mp4', hasQuiz: false },
      { id: 't-04', title: 'Script Framework', videoUrl: 't-04-model-personas.mp4', hasQuiz: false },
      { id: 't-05', title: 'Objection Handling', videoUrl: 't-05-journey-overview.mp4', hasQuiz: false },
      { id: 't-06', title: 'Mass Messages', videoUrl: 't-06-the-48-hour-rule.mp4', hasQuiz: false },
    ],
  },
  {
    id: 'journey', label: 'The Journey', description: 'The complete fan journey from first message to aftercare.',
    gateQuiz: 'j-1',
    modules: [
      { id: 'j-1', title: 'Journey Review Quiz', videoUrl: null, hasQuiz: true },
      { id: 'j-02', title: 'Rapport Phase', videoUrl: 'j-02-rapport-and-teasing-bridge.mp4', hasQuiz: false },
      { id: 'j-03', title: 'Teasing Bridge', videoUrl: 'j-03-sexting-and-ppv-drops.mp4', hasQuiz: false },
      { id: 'j-04', title: 'Sexting Phases', videoUrl: 'j-04-aftercare-and-reengagement.mp4', hasQuiz: false },
      { id: 'j-05', title: 'PPV Delivery', videoUrl: 'j-05-branch-rules-and-nr-waves.mp4', hasQuiz: false },
      { id: 'j-06', title: 'Aftercare & Re-engagement', videoUrl: 'j-06-fan-assessment-and-prioritization.mp4', hasQuiz: false },
    ],
  },
  {
    id: 'advanced', label: 'Advanced', description: 'Advanced techniques for experienced chatters.',
    gateQuiz: 'a-1',
    modules: [
      { id: 'a-1', title: 'Advanced Review Quiz', videoUrl: null, hasQuiz: true },
      { id: 'a-02', title: 'Fan Retention', videoUrl: 'a-02-top-10-objection-scripts.mp4', hasQuiz: false },
      { id: 'a-03', title: 'Upselling Mastery', videoUrl: 'a-03-custom-content-sales.mp4', hasQuiz: false },
      { id: 'a-04', title: 'Difficult Fans', videoUrl: 'a-04-multitasking.mp4', hasQuiz: false },
      { id: 'a-05', title: 'Time Management', videoUrl: 'a-05-shift-routine.mp4', hasQuiz: false },
      { id: 'a-06', title: 'Advanced Sexting', videoUrl: 'a-06-common-mistakes.mp4', hasQuiz: false },
    ],
  },
  {
    id: 'golive', label: 'Go Live', description: 'Final preparation before your first shift.',
    gateQuiz: 'g-1',
    modules: [
      { id: 'g-1', title: 'Final Review Quiz', videoUrl: null, hasQuiz: true },
    ],
  },
];

interface ProgressRow { module_id: string; completed: boolean }
interface QuizRow { module_id: string; passed: boolean }
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
        supabase.from('quiz_results').select('module_id, passed').eq('user_id', profile.id),
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

  const isSectionUnlocked = useCallback((section: SectionDef): boolean => {
    if (!section.gateQuiz) return true;
    if (manualUnlocks.has(section.id)) return true;
    if (profile && ['owner', 'admin'].includes(profile.role)) return true;
    return passedQuizzes.has(section.gateQuiz);
  }, [passedQuizzes, manualUnlocks, profile]);

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
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary">Chatting School</h1>
        <p className="text-text-secondary text-sm mt-1">Complete each section to unlock the next one.</p>
      </div>

      <div className="space-y-4">
        {SECTIONS.map((section, sIdx) => {
          const unlocked = isSectionUnlocked(section);
          const completed = section.modules.filter(m => completedModules.has(m.id)).length;
          const total = section.modules.length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

          return (
            <div key={section.id} className={`bg-surface-1 border rounded-xl overflow-hidden ${unlocked ? 'border-border' : 'border-border/50 opacity-70'}`}>
              <div className="px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${unlocked ? 'bg-cw/15' : 'bg-surface-2'}`}>
                  {unlocked ? (
                    pct === 100 ? <CheckCircle2 size={20} className="text-success" /> : <GraduationCap size={20} className="text-cw" />
                  ) : (
                    <Lock size={18} className="text-text-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{section.label}</h3>
                    <span className="text-[10px] text-text-muted">{completed}/{total}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
                  {unlocked && total > 0 && (
                    <div className="mt-2 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-cw rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>

              {unlocked && (
                <div className="border-t border-border">
                  {section.modules.map(mod => {
                    const done = completedModules.has(mod.id);
                    return (
                      <Link
                        key={mod.id}
                        to={`/school/${section.id}/${mod.id}`}
                        state={{ videoUrl: mod.videoUrl }}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/50 transition-colors border-b border-border/50 last:border-b-0"
                      >
                        {done ? (
                          <CheckCircle2 size={16} className="text-success shrink-0" />
                        ) : (
                          <PlayCircle size={16} className="text-text-muted shrink-0" />
                        )}
                        <span className={`text-xs font-medium ${done ? 'text-text-secondary' : 'text-white'}`}>{mod.title}</span>
                        {mod.hasQuiz && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold ml-auto">QUIZ</span>}
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
