import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Model } from '../types';
import {
  ArrowLeft, Copy, Check, Download, Loader2, User, MessageSquare,
  Zap, Heart, Shield, RefreshCw, AlertTriangle, Info,
} from 'lucide-react';
import ErrorState from '../components/ErrorState';

interface JourneyStep {
  id: string;
  message: string;
  instruction: string | null;
  phase: string;
}

interface PersonalItem {
  topic: string;
  response: string;
  note: string | null;
}

interface ScriptContent {
  personality?: string;
  voice?: string;
  voice_pet_names?: string;
  voice_never?: string;
  interests?: string[];
  physical?: string;
  special_notes?: string;
  journey?: JourneyStep[];
  nr_waves?: JourneyStep[];
  personal_info?: PersonalItem[];
  positive_spin?: PersonalItem[];
  re_engagement?: JourneyStep[];
  obj_scripts?: Record<string, unknown>;
}

const PHASE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  rapport: { label: 'Rapport', icon: <User size={13} />, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  teasing: { label: 'Teasing Bridge', icon: <Zap size={13} />, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  sext: { label: 'Sexting', icon: <Heart size={13} />, color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
  ppv: { label: 'PPV Send', icon: <Download size={13} />, color: 'text-cw bg-cw/10 border-cw/20' },
  wait: { label: 'Wait', icon: <RefreshCw size={13} />, color: 'text-text-muted bg-surface-2 border-border' },
  aftercare: { label: 'Aftercare', icon: <Shield size={13} />, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-surface-3 text-text-muted hover:text-white transition-colors shrink-0">
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </button>
  );
}

export default function ModelGuide() {
  const { modelId } = useParams<{ modelId: string }>();
  const [model, setModel] = useState<Model | null>(null);
  const [script, setScript] = useState<ScriptContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'journey' | 'objections' | 'personal'>('overview');

  const fetchData = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: m, error: me } = await supabase.from('models').select('*').eq('id', modelId).single();
      if (me) throw new Error(me.message);
      setModel(m as Model);

      const { data: s } = await supabase.from('model_scripts').select('content').eq('model_id', modelId).single();
      if (s) setScript((s as { content: ScriptContent }).content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load model');
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-cw" size={24} />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorState message={error ?? 'Model not found'} onRetry={fetchData} />
      </div>
    );
  }

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'journey' as const, label: 'Journey' },
    { key: 'objections' as const, label: 'OBJ/RES' },
    { key: 'personal' as const, label: 'Personal Info' },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Link to="/scripts" className="p-2 rounded-lg hover:bg-surface-2 text-text-muted hover:text-white mt-1 shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {model.profile_picture_url ? (
            <img src={model.profile_picture_url} alt={model.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
              <span className="text-lg font-extrabold text-text-muted">{model.name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-white truncate">{model.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {model.page_type && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  model.page_type === 'Free Page' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-cw/15 text-cw'
                }`}>
                  {model.page_type}
                </span>
              )}
              {model.traffic_sources.map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-cw'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cw rounded-full" />}
          </button>
        ))}
      </div>

      {/* Content */}
      {!script ? (
        <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
          <AlertTriangle size={28} className="text-warning mx-auto mb-3" />
          <p className="text-text-secondary text-sm">Script content not yet synced for this model.</p>
          <p className="text-text-muted text-xs mt-2">Run the sync script to populate model guides.</p>
          {model.scripts_url && (
            <a href={model.scripts_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-cw text-white text-xs font-medium hover:bg-cw/90 transition-colors">
              View external guide <MessageSquare size={12} />
            </a>
          )}
        </div>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab script={script} />}
          {activeTab === 'journey' && <JourneyTab script={script} />}
          {activeTab === 'objections' && <ObjectionsTab script={script} />}
          {activeTab === 'personal' && <PersonalTab script={script} />}
        </>
      )}
    </div>
  );
}

function OverviewTab({ script }: { script: ScriptContent }) {
  return (
    <div className="space-y-4">
      {script.personality && (
        <InfoCard title="Personality" icon={<User size={14} />}>
          <p className="text-sm text-text-secondary leading-relaxed">{script.personality}</p>
        </InfoCard>
      )}
      {script.voice && (
        <InfoCard title="Voice & Tone" icon={<MessageSquare size={14} />}>
          <p className="text-sm text-text-secondary leading-relaxed">{script.voice}</p>
          {script.voice_pet_names && (
            <div className="mt-3">
              <span className="text-[10px] font-bold text-emerald-400 uppercase">Use:</span>
              <span className="text-xs text-text-secondary ml-2">{script.voice_pet_names}</span>
            </div>
          )}
          {script.voice_never && (
            <div className="mt-1">
              <span className="text-[10px] font-bold text-danger uppercase">Never:</span>
              <span className="text-xs text-text-secondary ml-2">{script.voice_never}</span>
            </div>
          )}
        </InfoCard>
      )}
      {script.interests && script.interests.length > 0 && (
        <InfoCard title="Interests" icon={<Zap size={14} />}>
          <div className="flex flex-wrap gap-1.5">
            {script.interests.map(i => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-surface-2 text-text-secondary">{i}</span>
            ))}
          </div>
        </InfoCard>
      )}
      {script.physical && (
        <InfoCard title="Physical" icon={<Info size={14} />}>
          <p className="text-sm text-text-secondary">{script.physical}</p>
        </InfoCard>
      )}
      {script.special_notes && (
        <InfoCard title="Special Notes" icon={<AlertTriangle size={14} />}>
          <p className="text-sm text-text-secondary leading-relaxed">{script.special_notes}</p>
        </InfoCard>
      )}
    </div>
  );
}

function JourneyTab({ script }: { script: ScriptContent }) {
  const journey = script.journey ?? [];
  const nrWaves = script.nr_waves ?? [];
  const reEngagement = script.re_engagement ?? [];

  const phases = ['rapport', 'teasing', 'sext', 'ppv', 'wait', 'aftercare'];
  const grouped: Record<string, JourneyStep[]> = {};
  for (const step of journey) {
    const key = step.phase;
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(step);
  }

  return (
    <div className="space-y-6">
      {phases.map(phase => {
        const steps = grouped[phase];
        if (!steps || steps.length === 0) return null;
        const cfg = PHASE_CONFIG[phase] ?? { label: phase, icon: null, color: 'text-text-muted bg-surface-2 border-border' };
        return (
          <div key={phase}>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold mb-3 ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </div>
            <div className="space-y-1.5">
              {steps.map(step => (
                <MessageRow key={step.id} step={step} />
              ))}
            </div>
          </div>
        );
      })}

      {nrWaves.length > 0 && (
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold mb-3 text-red-400 bg-red-500/10 border-red-500/20">
            <AlertTriangle size={13} />
            NR Waves (No Reply)
          </div>
          <div className="space-y-1.5">
            {nrWaves.map(step => <MessageRow key={step.id} step={step} />)}
          </div>
        </div>
      )}

      {reEngagement.length > 0 && (
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold mb-3 text-cyan-400 bg-cyan-500/10 border-cyan-500/20">
            <RefreshCw size={13} />
            Re-engagement
          </div>
          <div className="space-y-1.5">
            {reEngagement.map(step => <MessageRow key={step.id} step={step} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageRow({ step }: { step: JourneyStep }) {
  return (
    <div className="group flex items-start gap-3 bg-surface-1 border border-border rounded-lg px-4 py-3 hover:border-border/80">
      <span className="text-[10px] font-mono text-text-muted pt-0.5 w-10 shrink-0">{step.id}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-relaxed">{step.message}</p>
        {step.instruction && (
          <p className="text-[11px] text-text-muted mt-1.5 italic">{step.instruction}</p>
        )}
      </div>
      <CopyButton text={step.message} />
    </div>
  );
}

function ObjectionsTab({ script }: { script: ScriptContent }) {
  const obj = script.obj_scripts;
  if (!obj || Object.keys(obj).length === 0) {
    return (
      <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
        <Shield size={28} className="text-text-muted mx-auto mb-3" />
        <p className="text-text-secondary text-sm">No objection scripts available for this model.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(obj).map(([category, scripts]) => (
        <InfoCard key={category} title={category}>
          <pre className="text-xs text-text-secondary whitespace-pre-wrap">{JSON.stringify(scripts, null, 2)}</pre>
        </InfoCard>
      ))}
    </div>
  );
}

function PersonalTab({ script }: { script: ScriptContent }) {
  const personal = script.personal_info ?? [];
  const spin = script.positive_spin ?? [];

  return (
    <div className="space-y-6">
      {personal.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-text-primary mb-3">Personal Info Responses</h3>
          <div className="space-y-1.5">
            {personal.map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-surface-1 border border-border rounded-lg px-4 py-3">
                <span className="text-[10px] font-bold text-cw bg-cw/10 px-2 py-0.5 rounded shrink-0">{item.topic}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{item.response}</p>
                  {item.note && <p className="text-[11px] text-text-muted mt-1 italic">{item.note}</p>}
                </div>
                <CopyButton text={item.response} />
              </div>
            ))}
          </div>
        </div>
      )}

      {spin.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-text-primary mb-3">Positive Spin</h3>
          <div className="space-y-1.5">
            {spin.map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-surface-1 border border-border rounded-lg px-4 py-3">
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded shrink-0">{item.topic}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{item.response}</p>
                  {item.note && <p className="text-[11px] text-text-muted mt-1 italic">{item.note}</p>}
                </div>
                <CopyButton text={item.response} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-text-muted">{icon}</span>}
        <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}
