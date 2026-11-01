import type { PlayerScreen, PlayerView } from '@gamebook/api';
import type { Theme } from '@gamebook/core';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { useState } from 'react';

import { SlideButton } from '@/components/slide-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ScanPrompt } from './qr-scanner';
import { StoryText } from './story-text/story-text';

type PlayerNode = NonNullable<PlayerView['node']>;

const THEME_SCREEN: Record<Theme, string> = {
  default: '',
  intro: 'justify-center text-center',
  letter: '',
  night: '',
};

/** Box around the text; its typography comes from `StoryText`. */
const THEME_BOX: Record<Theme, string> = {
  default: '',
  intro: '',
  letter:
    'rounded-lg border bg-amber-50 p-6 text-amber-950 shadow-sm dark:bg-amber-950/30 dark:text-amber-50',
  night: 'rounded-lg bg-slate-950 p-6 text-slate-100 ring-1 ring-slate-800',
};

/**
 * Paging starts on the first screen; the choices get a random order, kept for the whole visit so
 * polling does not reshuffle them.
 */
const freshPaging = (node: PlayerNode, step: number) => ({
  node: node.id,
  step,
  index: 0,
  ranks: Object.fromEntries(node.choices.map((choice) => [choice.index, Math.random()])),
});

/**
 * One screen at a time, paged locally with „Další“; every move starts from the first screen. The
 * last screen offers the choices, or is the scanner when the node waits for a QR code.
 */
export const NodeScreens = ({
  node,
  step,
  busy,
  onCode,
  onPick,
}: {
  node: PlayerNode;
  step: number;
  busy: boolean;
  /** A QR code read on the scan screen. */
  onCode: (code: string) => void;
  onPick: (choice: { index: number; label: string }) => void;
}) => {
  // A node left by scanning has one more screen after its blocks: the scanner.
  const count = node.screens.length + (node.scan ? 1 : 0);
  const [paging, setPaging] = useState(() => freshPaging(node, step));
  if (paging.node !== node.id || paging.step !== step) setPaging(freshPaging(node, step));
  const index = Math.min(paging.index, count - 1);
  const go = (to: number) => setPaging({ ...paging, index: to });
  const screen: PlayerScreen | undefined = node.screens[index];
  const theme = screen?.theme ?? 'default';
  const last = index >= count - 1;
  const scanning = node.scan && index === node.screens.length;
  const choices = node.choices.toSorted(
    (a, b) => (paging.ranks[a.index] ?? 0) - (paging.ranks[b.index] ?? 0),
  );

  return (
    <article
      key={`${node.id}-${step}-${index}`}
      className={cn(
        'flex flex-1 animate-in flex-col gap-6 duration-300 fade-in slide-in-from-bottom-2',
        THEME_SCREEN[theme],
      )}
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
      {scanning && <ScanPrompt onCode={onCode} busy={busy} />}
      {screen !== undefined && (
        <StoryText
          content={screen.content}
          theme={theme}
          align={theme === 'intro' || node.type === 'end' ? 'center' : 'left'}
          className={THEME_BOX[theme]}
        />
      )}

      <div className='mt-auto flex flex-col gap-3'>
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
