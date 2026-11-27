import { IconArrowRight, IconArrowsMaximize, IconNote, IconPlus } from '@tabler/icons-react';
import type { ReactNode, Ref } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { DraftChoice, DraftNode } from './draft';

/** The card's width; its height follows the text, up to `maxHeight`. */
export const CARD_WIDTH = 320;

/** How the plain arrow is named on the card and the edges. */
export const NEXT_LABEL = 'Další';

/**
 * Heights of the rows at the bottom of the card, in pixels, so the layout knows where a choice's
 * dot is without measuring it: the choices, then „+ volba“, then the padding and the border.
 */
const CHOICE_ROW = 28;
const ADD_ROW = 24;
const FOOTER_PADDING = 8;
const BORDER = 1;

/** Where a choice's dot is from the card's top, for a card `height` high with `count` choices. */
export const choiceDotY = (height: number, count: number, index: number) =>
  height - BORDER - FOOTER_PADDING - ADD_ROW - (count - index) * CHOICE_ROW + CHOICE_ROW / 2;

/**
 * Where the arrows into the card end, from its bottom: level with its last choice. A choice leads
 * straight on when the cards' choices line up, so the layout does not drift down layer by layer.
 */
export const ENTRY_FROM_BOTTOM = BORDER + FOOTER_PADDING + ADD_ROW + CHOICE_ROW / 2;

/** What a dot stands for: a choice by its index, or a new choice. */
export type DotKey = number | 'new';

/** A plain dot on the card's right edge; the canvas puts a handle to drag from there instead. */
const PlainDot = () => (
  <span className='absolute top-1/2 -right-1 size-2 -translate-y-1/2 rounded-full bg-muted-foreground' />
);

/** A choice as a button the players see: its text, or the plain arrow. */
const ChoiceRow = ({ choice, dot }: { readonly choice: DraftChoice; readonly dot: ReactNode }) => (
  <div className='relative flex items-center pr-4 pl-3' style={{ height: CHOICE_ROW }}>
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
    {dot}
  </div>
);

export interface DraftNodeCardProps {
  readonly node: DraftNode;
  /** Zoomed out: only the summary, large; the card keeps its size. */
  readonly far?: boolean;
  readonly selected?: boolean;
  /** No other node leads here. */
  readonly start?: boolean;
  /** The text scrolls inside the card above this height. */
  readonly maxHeight?: number;
  /** Shows a button to open the node in the focus mode. */
  readonly onOpen?: () => void;
  /** The dot of a choice, or of a new one; a plain dot by default. */
  readonly dot?: (key: DotKey) => ReactNode;
  readonly ref?: Ref<HTMLDivElement>;
  readonly className?: string;
}

/**
 * A node of the draft on the canvas, as high as its text. Close up: its id, summary, segments and
 * choices as buttons, each with a dot its edge starts from; from afar the summary covers it, so
 * the whole story reads as a list of events. The two cross-fade while zooming.
 */
export const DraftNodeCard = ({
  node,
  far = false,
  selected = false,
  start = false,
  maxHeight,
  onOpen,
  dot = () => <PlainDot />,
  ref,
  className,
}: DraftNodeCardProps) => {
  const end = node.choices.length === 0;
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex flex-col rounded-lg border bg-card text-card-foreground shadow-xs',
        selected && 'outline-2 outline-offset-2 outline-yellow-500',
        className,
      )}
      style={{ width: CARD_WIDTH, ...(maxHeight === undefined ? {} : { maxHeight }) }}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col transition-opacity duration-300',
          far && 'opacity-0',
        )}
      >
        <div className='flex h-6 items-center gap-2 px-3 pt-2 font-mono text-[11px] text-muted-foreground'>
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
          {onOpen !== undefined && (
            <button
              type='button'
              title='Otevřít v režimu soustředění'
              className='nodrag -mr-1 rounded p-0.5 hover:bg-muted hover:text-foreground'
              onClick={onOpen}
            >
              <IconArrowsMaximize className='size-3.5' />
            </button>
          )}
        </div>
        <p className='px-3 pt-1 text-sm leading-snug font-medium'>
          {node.summary === '' ? (
            <span className='text-muted-foreground'>Bez shrnutí</span>
          ) : (
            node.summary
          )}
        </p>
        {/* Scrolls when the card would be taller than the viewport; with the wheel once selected. */}
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3 font-mono text-[11px] leading-relaxed',
            selected && 'nowheel',
          )}
        >
          {node.segments.map((segment, index) => (
            // The segments have no ids; their order is all there is.
            <div key={index}>
              <div className='flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground'>
                <span className='rounded-full border px-1.5 font-sans leading-4'>
                  {segment.theme ?? 'default'}
                </span>
                <span className='h-px flex-1 bg-border' />
              </div>
              {segment.note !== undefined && (
                <p className='whitespace-pre-wrap text-muted-foreground italic'>{segment.note}</p>
              )}
              <p className='whitespace-pre-wrap'>{segment.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div
        className='shrink-0 rounded-b-lg border-t bg-muted/40'
        style={{ paddingBottom: FOOTER_PADDING }}
      >
        {node.choices.map((choice, index) => (
          <ChoiceRow key={index} choice={choice} dot={dot(index)} />
        ))}
        <div
          className='relative flex items-center gap-1 pl-3 text-[11px] text-muted-foreground'
          style={{ height: ADD_ROW }}
        >
          <IconPlus className='size-3' />
          volba
          {dot('new')}
        </div>
      </div>
      {/* From afar the summary covers the card; the choices' dots stay where the edges start. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-card p-5 transition-opacity duration-300',
          !far && 'opacity-0',
        )}
      >
        <p className='text-[28px] leading-tight font-semibold'>
          {node.summary === '' ? (
            <span className='text-muted-foreground'>Bez shrnutí</span>
          ) : (
            node.summary
          )}
        </p>
      </div>
    </div>
  );
};
