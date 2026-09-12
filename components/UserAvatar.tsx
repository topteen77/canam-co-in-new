import React from 'react';

const COLORS = [
  'bg-indigo-600',
  'bg-sky-600',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-teal-600',
  'bg-blue-700',
];

export function avatarLetter(name?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw) return '?';
  const fromEmail = raw.includes('@') ? raw.split('@')[0] : raw;
  const letter = fromEmail.replace(/[^a-zA-Z0-9]/g, '').charAt(0);
  return (letter || fromEmail.charAt(0) || '?').toUpperCase();
}

function colorFor(name?: string | null): string {
  const source = String(name || '');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = source.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface UserAvatarProps {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

const UserAvatar: React.FC<UserAvatarProps> = ({ name, size = 'md', className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-flex items-center justify-center rounded-full text-white font-bold leading-none shrink-0 ${SIZE[size]} ${colorFor(name)} ${className}`}
  >
    {avatarLetter(name)}
  </span>
);

export default UserAvatar;
