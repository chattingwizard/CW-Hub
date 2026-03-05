import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { Camera } from 'lucide-react';

interface Props {
  url?: string | null;
  name?: string;
  size?: number;
  editable?: boolean;
  className?: string;
}

export default function UserAvatar({ url, name, size = 28, editable = false, className = '' }: Props) {
  const [imgError, setImgError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile, refreshProfile } = useAuthStore();

  const initials = (name ?? '?').charAt(0).toUpperCase();
  const px = `${size}px`;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${profile.id}/avatar.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id);
      if (updateErr) throw updateErr;

      await refreshProfile();
      setImgError(false);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: px, height: px }}>
      {url && !imgError ? (
        <img
          src={url}
          alt={name ?? 'Avatar'}
          className="w-full h-full rounded-full object-cover ring-1 ring-cw/20"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full rounded-full bg-cw/15 flex items-center justify-center ring-1 ring-cw/20">
          <span className="text-cw font-bold" style={{ fontSize: `${Math.max(size * 0.38, 9)}px` }}>
            {initials}
          </span>
        </div>
      )}
      {editable && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-surface-2 border border-border flex items-center justify-center hover:bg-surface-3 transition-colors"
          >
            {uploading ? (
              <div className="w-2.5 h-2.5 border border-cw/30 border-t-cw rounded-full animate-spin" />
            ) : (
              <Camera size={10} className="text-text-muted" />
            )}
          </button>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} className="hidden" />
        </>
      )}
    </div>
  );
}
