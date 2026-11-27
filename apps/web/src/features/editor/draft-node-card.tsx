import { IconArrowRight, IconArrowsMaximize, IconNote, IconPlus } from '@tabler/icons-react';
import { Fragment, type ReactNode, type Ref } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { DraftChoice, DraftNode } from './draft';

/** The card's width; its height follows the text, up to `maxHeight`. */
export const CARD_WIDTH = 320;

/** How the plain arrow is named on the card and the edges. */
export const NEXT_LABEL = 'Další';

/** Heights of the rows at the bottom of the card, in pixels: the choices, then „+ volba“. */
const CHOICE_ROW = 28;
const ADD_ROW = 24;
const FOOTER_PADDING = 8;

/** What a dot stands for: a choice by its index, or a new choice. */
export type DotKey = number | 'new';

/**
 * Where a dot sits on the card's bottom edge, from its left: the choices' dots in their order,
 * then the one of „+ volba“, spread evenly. The layout attaches the edges there without measuring.
 */
export const dotX = (count: number, key: DotKey) => {
  const slot = key === 'new' ? count : key;
  return (CARD_WIDTH * (slot + 1)) / (count + 2);
};

/** The text of a choice's dot: its number, as beside its button. */
export const dotText = (key: DotKey) => (key === 'new' ? '+' : String(key + 1));

/**
 * What a dot shows: the choice's number, trimmed to the height of its digits so it sits in the
 * middle of the circle, or a plus drawn as an icon, which centers exactly, for a new choice.
 */
export const DotContent = ({ dot }: { readonly dot: DotKey }) =>
  dot === 'new' ? (
    <IconPlus className='pointer-events-none size-2.5' stroke={3} />
  ) : (
    <span className='pointer-events-none [text-box:trim-both_cap_alphabetic]'>{dotText(dot)}</span>
  );

/** The look of a choice's dot; the canvas puts a handle with it to drag from. */
export const DOT_LOOK =
  'flex size-4 items-center justify-center rounded-full border border-card bg-muted-foreground font-sans text-[9px] leading-none font-semibold text-card';

/**
 * The dot of „+ volba“ is outlined, unlike the choices' ones, and shows only while the pointer is
 * over the card or a new edge is dragged out of it.
 */
export const NEW_DOT_LOOK =
  'flex size-4 items-center justify-center rounded-full border border-dashed border-muted-foreground bg-card text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 [&.connectingfrom]:opacity-100';

/** A plain dot on the card's bottom edge. */
const PlainDot = ({ dot, x }: { readonly dot: DotKey; readonly x: number }) => (
  <span
    className={cn(
      dot === 'new' ? NEW_DOT_LOOK : DOT_LOOK,
      'absolute bottom-0 -translate-x-1/2 translate-y-1/2',
    )}
    style={{ left: x }}
  >
    <DotContent dot={dot} />
  </span>
);

/** The number of a choice beside its button, matching its dot on the bottom edge. */
const ChoiceNumber = ({ children }: { readonly children: ReactNode }) => (
  <span className='w-3 shrink-0 text-center font-mono text-[10px] text-muted-foreground'>
    {children}
  </span>
);

/** A choice as a button the players see: its text, or the plain arrow. */
const ChoiceRow = ({ choice, index }: { readonly choice: DraftChoice; readonly index: number }) => (
  <div className='flex items-center gap-1.5 px-3' style={{ height: CHOICE_ROW }}>
    <ChoiceNumber>{dotText(index)}</ChoiceNumber>
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
  /** The dot of a choice, or of a new one, `x` from the card's left; a plain dot by default. */
  readonly dot?: (key: DotKey, x: number) => ReactNode;
  readonly ref?: Ref<HTMLDivElement>;
  readonly className?: string;
}

/**
 * A node of the draft on the canvas, as high as its text. Close up: its id, summary, segments and
 * choices as buttons, numbered like the dots on the bottom edge their edges start from; from afar
 * the summary covers it, so the whole story reads as a list of events. The two cross-fade.
 */
export const DraftNodeCard = ({
  node,
  far = false,
  selected = false,
  start = false,
  maxHeight,
  onOpen,
  dot = (key, x) => <PlainDot dot={key} x={x} />,
  ref,
  className,
}: DraftNodeCardProps) => {
  const end = node.choices.length === 0;
  return (
    <div
      ref={ref}
      className={cn(
        'group/card relative flex flex-col rounded-lg border bg-card text-card-foreground shadow-xs',
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
          <ChoiceRow key={index} choice={choice} index={index} />
        ))}
        <div
          className='flex items-center gap-1.5 px-3 text-[11px] text-muted-foreground'
          style={{ height: ADD_ROW }}
        >
          <ChoiceNumber>
            <IconPlus className='mx-auto size-3' />
          </ChoiceNumber>
          volba
        </div>
      </div>
      {/* From afar the summary covers the card. */}
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
      {/* On the bottom edge, where the edges start; over the summary too. */}
      {[...node.choices.keys(), 'new' as const].map((key) => (
        <Fragment key={key}>{dot(key, dotX(node.choices.length, key))}</Fragment>
      ))}
    </div>
  );
};
