import type { PlayerSegment, PlayerView } from '@gamebook/api';
import { IconArrowRight, IconFlag } from '@tabler/icons-react';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';

import { ActionButton, PLAYER_ICON_BUTTON_SIZE } from '@/components/action-button';
import { SlideButton } from '@/components/slide-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { CameraGate } from './camera-access';
import { PlayerFrame } from './player-frame';
import { ScanScreen, type ScanOutcome } from './qr-scanner';
import { SEGMENT_SVG, OPTICAL_CENTER, THEME_BOX, THEME_PAGE } from './segment-look';
import { StoryText } from './story-text/story-text';
import { useRecentVisit } from './visits';

type PlayerNode = NonNullable<PlayerView['node']>;

/** A segment's text, shown very quickly when the segment was visited a moment ago. */
const VisitedStoryText = ({
  visit,
  ...props
}: ComponentProps<typeof StoryText> & { readonly visit: string }) => (
  <StoryText {...props} fast={useRecentVisit(visit)} />
);

/** How long the buttons stay disabled after they appear, so a tap meant for the text or the
 * previous segment's button does not land on them. */
const BUTTONS_ENABLE_MS = 500;

/**
 * The segment's buttons: hidden until the whole text is shown, then they fade in and are disabled
 * for a moment. Hidden, they keep their space, so the text does not move when they appear. Lives
 * inside the segment's keyed element, so every segment starts hidden again.
 */
const ScreenButtons = ({
  shown,
  children,
}: {
  readonly shown: boolean;
  readonly children: (enabled: boolean) => ReactNode;
}) => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!shown) {
      return undefined;
    }

    const timer = setTimeout(() => setEnabled(true), BUTTONS_ENABLE_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return (
    <div
      className={cn(
        'mt-auto flex flex-col gap-3',
        shown ? 'animate-in duration-300 fade-in' : 'invisible',
      )}
      aria-hidden={!shown}
    >
      {children(shown && enabled)}
    </div>
  );
};

interface Paging {
  readonly node: PlayerNode['id'];
  readonly revision: number;
  readonly index: number;
  /** Screens whose text has been shown in full; going back to one shows it at once. */
  readonly seen: readonly number[];
  /** The random order of the choices, by their index. */
  readonly ranks: Readonly<Record<string, number>>;
}

/** FNV-1a, 32 bits: a small, even spread of the text's characters, the same wherever it runs. */
const hash = (text: string) => {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0)!;
    value = Math.imul(value, 0x01000193) >>> 0;
  }

  return value;
};

/**
 * Paging starts on the first segment; the choices get an order that looks random but is the same on
 * every device of the team at this revision, so teammates can talk about „the second button“, and
 * polling does not reshuffle it.
 */
const freshPaging = (
  node: PlayerNode,
  revision: number,
  index: number,
  visitScope: string,
): Paging => ({
  node: node.id,
  revision,
  index,
  seen: [],
  ranks: Object.fromEntries(
    node.choices.map((choice) => [
      choice.index,
      hash(`${visitScope}/${node.id}/${revision}/${choice.index}`),
    ]),
  ),
});

/**
 * One segment at a time, paged locally with „Další“; every move starts from the first segment
 * (or `initialIndex`, for a reload). The
 * last segment offers the choices, or is the scanner when the node waits for a QR code.
 */
export const NodeSegments = ({
  node,
  revision,
  visitScope,
  busy,
  onCode,
  onPick,
  initialIndex = 0,
  onIndexChange,
  requireCamera = false,
  animated = true,
  aside,
  corner,
}: {
  readonly node: PlayerNode;
  readonly revision: number;
  /** Whose visits count for the fast text, so they do not carry over to another team. */
  readonly visitScope: string;
  readonly busy: boolean;
  /** The segment to open the node on, e.g. kept in the URL across a reload. */
  readonly initialIndex?: number;
  /** Called when the player pages, to keep the segment in the URL. */
  readonly onIndexChange?: (index: number) => void;
  /** The scan screen waits for camera access and offers no way around it (the login scan). */
  readonly requireCamera?: boolean;
  /** Off, the text is all there at once. Other animations are up to the page, by CSS. */
  readonly animated?: boolean;
  /** Shown at the right end of the navigation bar. */
  readonly aside?: ReactNode;
  /** Shown small in the top left corner of the first segment, where the others have „Zpět“. */
  readonly corner?: ReactNode;
  /** A QR code read on the scan screen. */
  readonly onCode: (code: string) => ScanOutcome | Promise<ScanOutcome>;
  readonly onPick: (choice: { readonly index: number; readonly label: string }) => void;
}) => {
  // A node left by scanning has one more page after its segments: the scanner.
  const count = node.segments.length + (node.scan ? 1 : 0);
  const [paging, setPaging] = useState(() => freshPaging(node, revision, initialIndex, visitScope));
  if (paging.node !== node.id || paging.revision !== revision) {
    setPaging(freshPaging(node, revision, initialIndex, visitScope));
  }

  const index = Math.max(Math.min(paging.index, count - 1), 0);
  const go = (to: number) => {
    setPaging({ ...paging, index: to });
    onIndexChange?.(to);
  };

  const segment: PlayerSegment | undefined = node.segments[index];
  const theme = segment?.theme ?? 'default';
  const last = index >= count - 1;
  const nextText = segment?.next?.trim() ?? '';
  const scanning = node.scan && index === node.segments.length;
  const shown = segment === undefined || paging.seen.includes(index);
  const scanScreen = (
    <ScanScreen title={node.scanTitle} text={node.scanText} onCode={onCode} busy={busy} />
  );
  const choices = node.choices.toSorted(
    (first, second) => (paging.ranks[first.index] ?? 0) - (paging.ranks[second.index] ?? 0),
  );

  return (
    <PlayerFrame
      onBack={index > 0 ? () => go(index - 1) : undefined}
      lead={
        corner !== undefined &&
        index === 0 && (
          <span className='font-mono text-[0.625rem] tracking-[0.2em] text-muted-foreground/35 tabular-nums'>
            {corner}
          </span>
        )
      }
      aside={aside}
      timeStops={node.timeStops}
      className={segment === undefined ? undefined : THEME_PAGE[theme]}
    >
      <article
        key={`${node.id}-${revision}-${index}`}
        className='screen-fade-in flex flex-1 flex-col gap-6'
      >
        {scanning && (requireCamera ? <CameraGate>{scanScreen}</CameraGate> : scanScreen)}
        {/* The segment sits at the optical center of the space between the top and the buttons. */}
        {segment !== undefined && (
          <div className={cn('flex-1', OPTICAL_CENTER)}>
            <div className={THEME_BOX[theme]}>
              {segment.svg !== undefined && (
                <div className={SEGMENT_SVG} dangerouslySetInnerHTML={{ __html: segment.svg }} />
              )}
              <VisitedStoryText
                visit={`${visitScope}/${node.id}/${index}`}
                content={segment.content}
                theme={theme}
                instant={shown || !animated}
                onRevealed={() => {
                  if (!shown) {
                    setPaging((now) => ({ ...now, seen: [...now.seen, index] }));
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Buttons appear only once the whole text is shown, so nobody goes on before reading it. */}
        {!scanning && (
          <ScreenButtons shown={shown}>
            {(enabled) =>
              !last ? (
                nextText === '' ? (
                  // No text in the story: only the arrow, in a circle as tall as the wide button.
                  <Button
                    size='icon'
                    aria-label='Další'
                    className={cn(PLAYER_ICON_BUTTON_SIZE, 'self-center rounded-full')}
                    disabled={!enabled}
                    onClick={() => go(index + 1)}
                  >
                    <IconArrowRight className='size-5' />
                  </Button>
                ) : (
                  <ActionButton
                    icon={<IconArrowRight className='size-5' />}
                    disabled={!enabled}
                    onClick={() => go(index + 1)}
                  >
                    {nextText}
                  </ActionButton>
                )
              ) : node.type === 'end' ? (
                <p className='flex items-center justify-center gap-2'>
                  <IconFlag className='size-4' /> Konec hry
                </p>
              ) : choices.length === 1 && choices[0]!.label === '' ? (
                // A choice without a text moves on like the arrow between segments.
                <Button
                  size='icon'
                  aria-label='Další'
                  className={cn(PLAYER_ICON_BUTTON_SIZE, 'self-center rounded-full')}
                  disabled={busy || !enabled}
                  onClick={() => onPick(choices[0]!)}
                >
                  <IconArrowRight className='size-5' />
                </Button>
              ) : (
                choices.map((choice) => (
                  <SlideButton
                    key={choice.index}
                    onConfirm={() => onPick(choice)}
                    disabled={busy || !enabled}
                  >
                    {choice.label}
                  </SlideButton>
                ))
              )
            }
          </ScreenButtons>
        )}
      </article>
    </PlayerFrame>
  );
};
