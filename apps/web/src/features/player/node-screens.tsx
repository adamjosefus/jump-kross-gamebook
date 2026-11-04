import type { PlayerScreen, PlayerView } from '@gamebook/api';
import { IconArrowRight, IconFlag } from '@tabler/icons-react';
import { useState, type ComponentProps, type ReactNode } from 'react';

import { ActionButton } from '@/components/action-button';
import { SlideButton } from '@/components/slide-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { BLOCK_SVG, OPTICAL_CENTER, THEME_BOX, THEME_PAGE } from './block-look';
import { CameraGate } from './camera-access';
import { PlayerFrame } from './player-frame';
import { ScanScreen } from './qr-scanner';
import { useReadingTime } from './reading';
import { StoryText } from './story-text/story-text';
import { useRecentVisit } from './visits';

type PlayerNode = NonNullable<PlayerView['node']>;

/** A screen's text, shown very quickly when the screen was visited a moment ago. */
const VisitedStoryText = ({
  block,
  onRead,
  ...props
}: ComponentProps<typeof StoryText> & {
  readonly block: string;
  readonly onRead: ((ms: number) => void) | undefined;
}) => {
  useReadingTime(onRead);
  return <StoryText {...props} fast={useRecentVisit(block)} />;
};

interface Paging {
  readonly node: PlayerNode['id'];
  readonly step: number;
  readonly index: number;
  /** Screens whose text has been shown in full; going back to one shows it at once. */
  readonly seen: readonly number[];
  /** The random order of the choices, by their index. */
  readonly ranks: Readonly<Record<string, number>>;
}

/**
 * Paging starts on the first screen; the choices get a random order, kept for the whole visit so
 * polling does not reshuffle them.
 */
const freshPaging = (node: PlayerNode, step: number, index: number): Paging => ({
  node: node.id,
  step,
  index,
  seen: [],
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
  animated = true,
  aside,
  onRead,
}: {
  readonly node: PlayerNode;
  readonly step: number;
  /** Whose visits count for the fast text, so they do not carry over to another team. */
  readonly visitScope: string;
  readonly busy: boolean;
  /** Screen to open the node on, e.g. kept in the URL across a reload. */
  readonly initialIndex?: number;
  /** Called when the player pages, to keep the screen in the URL. */
  readonly onIndexChange?: (index: number) => void;
  /** The scan screen waits for camera access and offers no way around it (the login scan). */
  readonly requireCamera?: boolean;
  /** Off, the text is all there at once. Other animations are up to the page, by CSS. */
  readonly animated?: boolean;
  /** Shown at the right end of the navigation bar. */
  readonly aside?: ReactNode;
  /** How long a screen's text was on; a test run or the anonymous intro measures nothing. */
  readonly onRead?: (ms: number) => void;
  /** A QR code read on the scan screen. */
  readonly onCode: (code: string) => void;
  readonly onPick: (choice: { readonly index: number; readonly label: string }) => void;
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
  const nextText = screen?.next?.trim() ?? '';
  const scanning = node.scan && index === node.screens.length;
  const shown = screen === undefined || paging.seen.includes(index);
  const scanScreen = (
    <ScanScreen title={node.scanTitle} text={node.scanText} onCode={onCode} busy={busy} />
  );
  const choices = node.choices.toSorted(
    (first, second) => (paging.ranks[first.index] ?? 0) - (paging.ranks[second.index] ?? 0),
  );

  return (
    <PlayerFrame
      onBack={index > 0 ? () => go(index - 1) : undefined}
      aside={aside}
      className={screen === undefined ? undefined : THEME_PAGE[theme]}
    >
      <article
        key={`${node.id}-${step}-${index}`}
        className='screen-fade-in flex flex-1 flex-col gap-6'
      >
        {scanning && (requireCamera ? <CameraGate>{scanScreen}</CameraGate> : scanScreen)}
        {/* The block sits at the optical center of the space between the top and the buttons. */}
        {screen !== undefined && (
          <div className={cn('flex-1', OPTICAL_CENTER)}>
            <div className={THEME_BOX[theme]}>
              {screen.svg !== undefined && (
                <div className={BLOCK_SVG} dangerouslySetInnerHTML={{ __html: screen.svg }} />
              )}
              <VisitedStoryText
                block={`${visitScope}/${node.id}/${index}`}
                onRead={onRead}
                content={screen.content}
                theme={theme}
                instant={shown || !animated}
                onRevealed={() => {
                  if (!shown) setPaging((now) => ({ ...now, seen: [...now.seen, index] }));
                }}
              />
            </div>
          </div>
        )}

        {/* Buttons wait for the whole text, so nobody goes on before reading it. They keep their
          room meanwhile, so the text does not move when they appear. */}
        {!scanning && (
          <div
            className={cn(
              'mt-auto flex flex-col gap-3',
              shown ? 'animate-in duration-500 fade-in' : 'invisible',
            )}
          >
            {!last ? (
              nextText === '' ? (
                // No text in the story: only the arrow, in a circle as tall as the wide button.
                <Button
                  size='icon'
                  aria-label='Další'
                  className='size-14 self-center rounded-full'
                  onClick={() => go(index + 1)}
                >
                  <IconArrowRight className='size-5' />
                </Button>
              ) : (
                <ActionButton
                  icon={<IconArrowRight className='size-5' />}
                  onClick={() => go(index + 1)}
                >
                  {nextText}
                </ActionButton>
              )
            ) : node.type === 'end' ? (
              <p className='flex items-center justify-center gap-2'>
                <IconFlag className='size-4' /> Konec hry
              </p>
            ) : (
              choices.map((choice) => (
                <SlideButton key={choice.index} onConfirm={() => onPick(choice)} disabled={busy}>
                  {choice.label}
                </SlideButton>
              ))
            )}
          </div>
        )}
      </article>
    </PlayerFrame>
  );
};
