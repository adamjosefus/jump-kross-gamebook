import { IconArrowRight, IconNote, IconPlus } from '@tabler/icons-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { DraftChoice, DraftNode } from './draft';

/** The card's size; the same at every zoom, so the layout does not change while zooming. */
export const CARD_WIDTH = 300;
export const CARD_HEIGHT = 240;

/** Choices shown on the card; the rest are counted, the focus mode lists them all. */
const SHOWN_CHOICES = 4;

/** How the plain arrow is named on the card and the edges. */
export const NEXT_LABEL = 'Další';

/** A choice as a button the players see: its text, or the plain arrow. */
const ChoiceButton = ({ choice }: { readonly choice: DraftChoice }) => (
  <div className='flex items-center gap-1.5'>
    <div
      className={cn(
        'min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-0.5 text-xs',
        choice.label === '' && 'text-muted-foreground',
      )}
    >
      {choice.label === '' ? (
        <>
          {NEXT_LABEL} <IconArrowRight className='inline size-3 align-[-2px]' />
        </>
      ) : (
        choice.label
      )}
    </div>
    {/* Where a new node will be drawn out of the choice. */}
    <span className='size-2 shrink-0 rounded-full bg-muted-foreground/60' />
  </div>
);

export interface DraftNodeCardProps {
  readonly node: DraftNode;
  /** Zoomed out: only the summary, large. */
  readonly far?: boolean;
  readonly selected?: boolean;
  /** No other node leads here. */
  readonly start?: boolean;
  readonly className?: string;
}

/**
 * A node of the draft on the canvas. Close up: its id, summary, the start of its segments and its
 * choices as buttons; from afar only the summary, so the whole story reads as a list of events.
 */
export const DraftNodeCard = ({
  node,
  far = false,
  selected = false,
  start = false,
  className,
}: DraftNodeCardProps) => {
  const end = node.choices.length === 0;
  const hidden = node.choices.length - SHOWN_CHOICES;
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs',
        selected && 'outline-2 outline-offset-2 outline-yellow-500',
        className,
      )}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      {far ? (
        <p className='line-clamp-6 p-5 text-[28px] leading-tight font-semibold'>
          {node.summary === '' ? (
            <span className='text-muted-foreground'>Bez shrnutí</span>
          ) : (
            node.summary
          )}
        </p>
      ) : (
        <>
          <div className='flex items-center gap-2 px-3 pt-2.5 font-mono text-[11px] text-muted-foreground'>
            <span className='min-w-0 flex-1 truncate'>{node.id}</span>
            {start && <span className='rounded bg-muted px-1'>začátek</span>}
            {end && <span className='rounded bg-muted px-1'>konec</span>}
            {node.note !== undefined && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconNote className='size-3.5 shrink-0' aria-label='Poznámka' />
                </TooltipTrigger>
                <TooltipContent side='top' className='whitespace-pre-line'>
                  {node.note}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className='line-clamp-2 px-3 pt-0.5 text-sm leading-snug font-medium'>
            {node.summary}
          </p>
          {/* The start of the text, cut off by the card; the fade marks there is more. */}
          <div className='relative min-h-0 flex-1 overflow-hidden px-3 pt-1 font-mono text-[11px] leading-relaxed'>
            {node.segments.map((segment, index) => (
              // The segments have no ids; their order is all there is.
              <div key={index}>
                <div className='flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground'>
                  <span className='rounded-full border px-1.5 font-sans leading-4'>
                    {segment.theme ?? 'default'}
                  </span>
                  <span className='h-px flex-1 bg-border' />
                </div>
                <p className='whitespace-pre-wrap'>{segment.text}</p>
              </div>
            ))}
            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-card' />
          </div>
          <div className='flex flex-col gap-1 border-t bg-muted/40 px-3 py-2'>
            {node.choices.slice(0, SHOWN_CHOICES).map((choice, index) => (
              <ChoiceButton key={index} choice={choice} />
            ))}
            {hidden > 0 && <p className='text-[11px] text-muted-foreground'>a {hidden} další</p>}
            <div className='flex items-center gap-1 text-[11px] text-muted-foreground'>
              <IconPlus className='size-3' />
              volba
            </div>
          </div>
        </>
      )}
    </div>
  );
};
