import { useState } from 'react';

interface ModelAvatarProps {
  name: string;
  pictureUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export default function ModelAvatar({ name, pictureUrl, size = 'sm', className = '' }: ModelAvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (pictureUrl && !imgError) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-cw/15 flex items-center justify-center text-cw font-medium shrink-0 ${className}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
