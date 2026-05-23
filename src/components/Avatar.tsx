interface AvatarProps {
  photoURL?: string | null;
  displayName?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

export function Avatar({ photoURL, displayName, size = 'md' }: AvatarProps) {
  const initials =
    displayName
      ?.split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase() ?? '?';

  return (
    <div className={`${SIZE_CLASSES[size]} relative flex-shrink-0 overflow-hidden rounded-full`}>
      {photoURL ? (
        <img
          src={photoURL}
          alt={displayName ?? 'Avatar'}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-indigo-600 font-semibold text-white">
          {initials}
        </div>
      )}
    </div>
  );
}
