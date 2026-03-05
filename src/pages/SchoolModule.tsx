import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { ArrowLeft, CheckCircle2, Loader2, PlayCircle } from 'lucide-react';

const VIDEO_BASE = 'https://bnmrdlqqzxenyqjknqhy.supabase.co/storage/v1/object/public/school-videos/';

export default function SchoolModule() {
  const { sectionId, moduleId } = useParams<{ sectionId: string; moduleId: string }>();
  const { profile } = useAuthStore();
  const location = useLocation();
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const stateVideo = (location.state as { videoUrl?: string } | null)?.videoUrl;

  useEffect(() => {
    if (!profile || !moduleId) return;
    (async () => {
      const { data } = await supabase
        .from('progress')
        .select('completed')
        .eq('user_id', profile.id)
        .eq('module_id', moduleId)
        .single();
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

  const videoUrl = stateVideo ? `${VIDEO_BASE}${stateVideo}` : (moduleId ? `${VIDEO_BASE}${moduleId}.mp4` : null);
  const isQuiz = moduleId?.endsWith('-1') && !moduleId.startsWith('f-');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-cw" size={24} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <Link to="/school" className="inline-flex items-center gap-2 text-text-muted hover:text-white text-xs">
        <ArrowLeft size={14} />
        Back to School
      </Link>

      {/* Video */}
      {videoUrl && !isQuiz && (
        <div className="bg-black rounded-xl overflow-hidden aspect-video">
          <video
            src={videoUrl}
            controls
            className="w-full h-full"
            controlsList="nodownload"
          >
            Your browser does not support video playback.
          </video>
        </div>
      )}

      {isQuiz && (
        <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
          <PlayCircle size={40} className="text-cw mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Section Review Quiz</h2>
          <p className="text-text-secondary text-sm mb-4">
            Pass this quiz with 80% or higher to unlock the next section.
          </p>
          <p className="text-text-muted text-xs">
            Quiz content will be loaded from the school database.
          </p>
        </div>
      )}

      {/* Mark as complete */}
      <div className="flex items-center justify-between bg-surface-1 border border-border rounded-xl px-5 py-4">
        <div className="flex items-center gap-3">
          {completed ? (
            <CheckCircle2 size={20} className="text-success" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-text-muted" />
          )}
          <span className={`text-sm font-medium ${completed ? 'text-success' : 'text-white'}`}>
            {completed ? 'Module completed' : 'Mark as completed'}
          </span>
        </div>
        {!completed && (
          <button
            onClick={markComplete}
            className="px-4 py-2 rounded-lg bg-cw text-white text-xs font-bold hover:bg-cw/90 transition-colors"
          >
            Complete
          </button>
        )}
      </div>
    </div>
  );
}
