import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { SECTIONS, videoUrl } from '../lib/schoolData';
import type { ModuleDef, QuizQuestion } from '../lib/schoolData';
import { ArrowLeft, CheckCircle2, Loader2, PlayCircle, XCircle, RotateCcw } from 'lucide-react';

export default function SchoolModule() {
  const { sectionId, moduleId } = useParams<{ sectionId: string; moduleId: string }>();
  const { profile } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const stateModule = (location.state as { moduleData?: ModuleDef } | null)?.moduleData;
  const mod: ModuleDef | undefined = stateModule ?? SECTIONS.flatMap(s => s.modules).find(m => m.id === moduleId);
  const section = SECTIONS.find(s => s.id === sectionId);

  useEffect(() => {
    if (!profile || !moduleId) return;
    (async () => {
      const { data } = await supabase
        .from('progress')
        .select('completed')
        .eq('user_id', profile.id)
        .eq('module_id', moduleId)
        .maybeSingle();
      setCompleted(!!data?.completed);
      setLoading(false);
    })();
  }, [profile, moduleId]);

  const markComplete = useCallback(async () => {
    if (!profile || !moduleId) return;
    const { error } = await supabase.from('progress').upsert({
      user_id: profile.id,
      module_id: moduleId,
      completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,module_id' });
    if (!error) setCompleted(true);
  }, [profile, moduleId]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="animate-spin text-cw" size={24} /></div>;
  }

  if (!mod) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <Link to="/school" className="inline-flex items-center gap-2 text-text-muted hover:text-white text-xs mb-4"><ArrowLeft size={14} /> Back to School</Link>
        <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
          <p className="text-text-secondary">Module not found.</p>
        </div>
      </div>
    );
  }

  const hasVideos = mod.videoFiles.length > 0;
  const isQuiz = mod.hasQuiz && mod.quizQuestions && mod.quizQuestions.length > 0;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <Link to="/school" className="inline-flex items-center gap-2 text-text-muted hover:text-white text-xs">
        <ArrowLeft size={14} />
        {section?.label ?? 'Back to School'}
      </Link>

      {/* Title */}
      <div>
        <h1 className="text-xl font-extrabold text-white">{mod.title}</h1>
        <p className="text-xs text-text-muted mt-1">{mod.duration} {section && <span style={{ color: section.color }}>— {section.label}</span>}</p>
      </div>

      {/* Videos */}
      {hasVideos && (
        <div className="space-y-3">
          {mod.videoFiles.map((file, i) => (
            <div key={file} className="bg-black rounded-xl overflow-hidden aspect-video">
              <video src={videoUrl(file)} controls className="w-full h-full" controlsList="nodownload">
                Your browser does not support video playback.
              </video>
            </div>
          ))}
        </div>
      )}

      {/* Quiz */}
      {isQuiz && <QuizComponent questions={mod.quizQuestions!} moduleId={mod.id} passingScore={mod.passingScore ?? 80} />}

      {/* No content placeholder */}
      {!hasVideos && !isQuiz && (
        <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
          <PlayCircle size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm">Review the content for this module, then mark it as completed below.</p>
        </div>
      )}

      {/* Complete button */}
      {!isQuiz && (
        <div className="flex items-center justify-between bg-surface-1 border border-border rounded-xl px-5 py-4">
          <div className="flex items-center gap-3">
            {completed ? <CheckCircle2 size={20} className="text-success" /> : <div className="w-5 h-5 rounded-full border-2 border-text-muted" />}
            <span className={`text-sm font-medium ${completed ? 'text-success' : 'text-white'}`}>
              {completed ? 'Module completed' : 'Mark as completed'}
            </span>
          </div>
          {!completed && (
            <button onClick={markComplete} className="px-4 py-2 rounded-lg bg-cw text-white text-xs font-bold hover:bg-cw/90 transition-colors">
              Complete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QuizComponent({ questions, moduleId, passingScore }: { questions: QuizQuestion[]; moduleId: string; passingScore: number }) {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [passed, setPassed] = useState(false);
  const [previousResult, setPreviousResult] = useState<{ passed: boolean; percentage: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from('quiz_results')
        .select('passed, percentage')
        .eq('user_id', profile.id)
        .eq('module_id', moduleId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setPreviousResult(data as { passed: boolean; percentage: number });
    })();
  }, [profile, moduleId]);

  const handleSelect = (qIdx: number, optIdx: number) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    let correct = 0;
    questions.forEach((q, i) => { if (answers[i] === q.correct) correct++; });
    const pct = Math.round((correct / questions.length) * 100);
    const didPass = pct >= passingScore;

    setScore(pct);
    setPassed(didPass);
    setSubmitted(true);
    setSaving(true);

    await supabase.from('quiz_results').insert({
      user_id: profile.id,
      module_id: moduleId,
      score: correct,
      percentage: pct,
      passed: didPass,
      submitted_at: new Date().toISOString(),
    });

    if (didPass) {
      await supabase.from('progress').upsert({
        user_id: profile.id,
        module_id: moduleId,
        completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,module_id' });
    }
    setSaving(false);
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    setPassed(false);
  };

  const allAnswered = Object.keys(answers).length === questions.length;

  if (previousResult?.passed && !submitted) {
    return (
      <div className="bg-surface-1 border border-success/30 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="text-success mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-1">Quiz Passed!</h3>
        <p className="text-text-secondary text-sm">You scored {previousResult.percentage}%. The next section is unlocked.</p>
        <Link to="/school" className="inline-block mt-4 px-4 py-2 rounded-lg bg-cw text-white text-xs font-bold hover:bg-cw/90">
          Back to School
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className={`bg-surface-1 border rounded-xl p-6 text-center ${passed ? 'border-success/30' : 'border-danger/30'}`}>
        {passed ? <CheckCircle2 size={40} className="text-success mx-auto mb-3" /> : <XCircle size={40} className="text-danger mx-auto mb-3" />}
        <h3 className="text-xl font-bold text-white mb-1">{passed ? 'Congratulations!' : 'Not quite yet'}</h3>
        <p className="text-text-secondary text-sm mb-1">
          You scored <span className="font-bold text-white">{score}%</span> ({passingScore}% required)
        </p>
        {passed ? (
          <>
            <p className="text-success text-xs mb-4">Next section unlocked!</p>
            <Link to="/school" className="inline-block px-4 py-2 rounded-lg bg-cw text-white text-xs font-bold hover:bg-cw/90">
              Continue
            </Link>
          </>
        ) : (
          <>
            <p className="text-text-muted text-xs mb-4">Review the material and try again.</p>
            <button onClick={handleRetry} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 text-white text-xs font-bold hover:bg-surface-3">
              <RotateCcw size={12} /> Try Again
            </button>
          </>
        )}

        {/* Show answers */}
        <div className="mt-6 text-left space-y-3">
          {questions.map((q, i) => {
            const userAnswer = answers[i];
            const isCorrect = userAnswer === q.correct;
            return (
              <div key={i} className={`rounded-lg p-3 border ${isCorrect ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'}`}>
                <p className="text-xs font-medium text-white mb-1">{i + 1}. {q.question}</p>
                <p className="text-[11px] text-text-muted">
                  Your answer: <span className={isCorrect ? 'text-success' : 'text-danger'}>{q.options[userAnswer!] ?? 'No answer'}</span>
                  {!isCorrect && <span className="text-success ml-2">Correct: {q.options[q.correct]}</span>}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Quiz — {questions.length} questions (pass: {passingScore}%)</h3>
        <span className="text-xs text-text-muted">{Object.keys(answers).length}/{questions.length} answered</span>
      </div>
      {questions.map((q, qIdx) => (
        <div key={qIdx} className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-sm font-medium text-white mb-3">{qIdx + 1}. {q.question}</p>
          <div className="space-y-1.5">
            {q.options.map((opt, oIdx) => {
              const selected = answers[qIdx] === oIdx;
              return (
                <button
                  key={oIdx}
                  onClick={() => handleSelect(qIdx, oIdx)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    selected
                      ? 'bg-cw/15 border border-cw/40 text-white'
                      : 'bg-surface-2 border border-transparent text-text-secondary hover:bg-surface-3 hover:text-white'
                  }`}
                >
                  <span className="text-text-muted mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        onClick={handleSubmit}
        disabled={!allAnswered || saving}
        className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
          allAnswered ? 'bg-cw text-white hover:bg-cw/90' : 'bg-surface-2 text-text-muted cursor-not-allowed'
        }`}
      >
        {saving ? 'Saving...' : `Submit Quiz (${Object.keys(answers).length}/${questions.length})`}
      </button>
    </div>
  );
}
