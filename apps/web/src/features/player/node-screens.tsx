import type { PlayerScreen, PlayerView } from '@gamebook/api';
import type { Theme } from '@gamebook/core';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { useState, type ComponentProps } from 'react';

import { SlideButton } from '@/components/slide-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { CameraGate } from './camera-access';
import { ScanScreen } from './qr-scanner';
import { StoryText } from './story-text/story-text';
import { useRecentVisit } from './visits';

type PlayerNode = NonNullable<PlayerView['node']>;

/** Box around the text; its typography comes from `StoryText`. */
const THEME_BOX: Record<Theme, string> = {
  default: '',
  intro: '',
  letter:
    'rounded-lg border bg-amber-50 p-6 text-amber-950 shadow-sm dark:bg-amber-950/30 dark:text-amber-50',
  night: 'rounded-lg bg-slate-950 p-6 text-slate-100 ring-1 ring-slate-800',
};

/** A screen's text, shown very quickly when the screen was visited a moment ago. */
const VisitedStoryText = ({
  block,
  ...props
}: ComponentProps<typeof StoryText> & { block: string }) => (
  <StoryText {...props} fast={useRecentVisit(block)} />
);

/**
 * Paging starts on the first screen; the choices get a random order, kept for the whole visit so
 * polling does not reshuffle them.
 */
const freshPaging = (node: PlayerNode, step: number, index: number) => ({
  node: node.id,
  step,
  index,
  /** Screens whose text has been shown in full; going back to one shows it at once. */
  seen: [] as readonly number[],
  ranks: Object.fromEntries(node.choices.map((choice) => [choice.index, Math.random()])),
});

/**
 * One screen at a time, paged locally with „Další“; every move starts from the first screen
 * (or `initialIndex`, for a reload). The
 * last screen offers the choices, or is the scanner when the node waits for a QR code.
 */
export const NodeScreens = ({
  node,
  step,
  visitScope,
  busy,
  onCode,
  onPick,
  initialIndex = 0,
  onIndexChange,
  requireCamera = false,
  manualEntry = false,
}: {
  node: PlayerNode;
  step: number;
  /** Whose visits count for the fast text, so they do not carry over to another team. */
  visitScope: string;
  busy: boolean;
  /** Screen to open the node on, e.g. kept in the URL across a reload. */
  initialIndex?: number;
  /** Called when the player pages, to keep the screen in the URL. */
  onIndexChange?: (index: number) => void;
  /** The scan screen waits for camera access and offers no way around it (the login scan). */
  requireCamera?: boolean;
  /** The scan screen also takes a typed code (the admin's test run; players can only scan). */
  manualEntry?: boolean;
  /** A QR code read on the scan screen. */
  onCode: (code: string) => void;
  onPick: (choice: { index: number; label: string }) => void;
}) => {
  // A node left by scanning has one more screen after its blocks: the scanner.
  const count = node.screens.length + (node.scan ? 1 : 0);
  const [paging, setPaging] = useState(() => freshPaging(node, step, initialIndex));
  if (paging.node !== node.id || paging.step !== step)
    setPaging(freshPaging(node, step, initialIndex));
  const index = Math.max(Math.min(paging.index, count - 1), 0);
  const go = (to: number) => {
    setPaging({ ...paging, index: to });
    onIndexChange?.(to);
  };
  const screen: PlayerScreen | undefined = node.screens[index];
  const theme = screen?.theme ?? 'default';
  const last = index >= count - 1;
  const scanning = node.scan && index === node.screens.length;
  const shown = screen === undefined || paging.seen.includes(index);
  const scanScreen = (
    <ScanScreen
      onCode={onCode}
      busy={busy}
      manualEntry={manualEntry}
      {...(index > 0 ? { onBack: () => go(index - 1) } : {})}
    />
  );
  const choices = node.choices.toSorted(
    (a, b) => (paging.ranks[a.index] ?? 0) - (paging.ranks[b.index] ?? 0),
  );

  return (
    <article
      key={`${node.id}-${step}-${index}`}
      className='screen-fade-in flex flex-1 flex-col gap-6'
    >
      {index > 0 && (
        <Button
          variant='ghost'
          size='sm'
          className='-mt-2 -ml-3 self-start text-muted-foreground'
          onClick={() => go(index - 1)}
        >
          <ChevronLeft /> Zpět
        </Button>
      )}
      {scanning && (requireCamera ? <CameraGate>{scanScreen}</CameraGate> : scanScreen)}
      {/* The block sits in the middle of the space between the top and the buttons. */}
      {screen !== undefined && (
        <div className='flex flex-1 flex-col justify-center'>
          <VisitedStoryText
            block={`${visitScope}/${node.id}/${index}`}
            content={screen.content}
            theme={theme}
            align={theme === 'intro' || node.type === 'end' ? 'center' : 'left'}
            className={THEME_BOX[theme]}
            instant={shown}
            onRevealed={() => {
              if (!shown) setPaging((now) => ({ ...now, seen: [...now.seen, index] }));
            }}
          />
        </div>
      )}

      {/* Buttons wait for the whole text, so nobody goes on before reading it. They keep their
          room meanwhile, so the text does not move when they appear. */}
      <div
        className={cn(
          'mt-auto flex flex-col gap-3',
          shown ? 'animate-in duration-500 fade-in' : 'invisible',
        )}
      >
        {!last ? (
          <Button size='lg' className='h-14 text-base' onClick={() => go(index + 1)}>
            Další <ChevronRight />
          </Button>
        ) : scanning ? null : node.type === 'end' ? (
          <p className='flex items-center justify-center gap-2 text-sm text-muted-foreground'>
            <Flag className='size-4' /> Konec hry
          </p>
        ) : (
          choices.map((choice) => (
            <SlideButton key={choice.index} onConfirm={() => onPick(choice)} disabled={busy}>
              {choice.label}
            </SlideButton>
          ))
        )}
      </div>
    </article>
  );
};
