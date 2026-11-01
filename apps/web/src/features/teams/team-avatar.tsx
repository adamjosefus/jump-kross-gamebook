import { cn } from '@/lib/utils';

/**
 * Twenty fixed clan colors, ordered so that neighbouring ids get clearly different hues. Teams take
 * them in turn by id and the palette starts over after the twentieth.
 */
export const TEAM_COLORS = [
  '#dc2626', // red
  '#2563eb', // blue
  '#16a34a', // green
  '#ea580c', // orange
  '#7c3aed', // violet
  '#0d9488', // teal
  '#db2777', // pink
  '#65a30d', // lime
  '#4f46e5', // indigo
  '#d97706', // amber
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#059669', // emerald
  '#e11d48', // rose
  '#0284c7', // sky
  '#9333ea', // purple
  '#ca8a04', // yellow
  '#92400e', // brown
  '#1e3a8a', // navy
  '#166534', // forest
] as const;

export const teamColor = (id: number) =>
  TEAM_COLORS[(((id - 1) % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length]!;

/** Short clan label shown in avatars: K1, K2, … */
export const teamLabel = (id: number) => `K${id}`;

export interface TeamAvatarProps {
  readonly id: number;
  readonly name: string;
  readonly className?: string;
}

export const TeamAvatar = ({ id, name, className }: TeamAvatarProps) => (
  <span
    title={name}
    className={cn(
      'inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold text-white ring-2 ring-background',
      className,
    )}
    style={{ backgroundColor: teamColor(id) }}
  >
    {teamLabel(id)}
  </span>
);
