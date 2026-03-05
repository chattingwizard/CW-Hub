import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export default function ErrorState({
  message = 'Something went wrong loading this page.',
  onRetry,
  compact = false,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
        <AlertCircle size={14} className="shrink-0" />
        <span className="truncate">{message}</span>
        {onRetry && (
          <button onClick={onRetry} className="ml-auto shrink-0 hover:text-white transition-colors">
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center">
        <AlertCircle size={24} className="text-danger" />
      </div>
      <div className="text-center max-w-sm">
        <p className="text-text-secondary text-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-primary text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}
