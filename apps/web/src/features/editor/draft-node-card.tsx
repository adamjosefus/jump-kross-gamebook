import {
  IconArrowsMaximize,
  IconGripVertical,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { Fragment, useRef, useState, type DragEvent, type ReactNode, type Ref } from 'react';

import { cn } from '@/lib/utils';

import type { DraftChoice, DraftNode, DraftSegment } from './draft';
import { SegmentEditor } from './segment-editor';
import type { TagColor } from './tag-colors';

/** The card's width; its height follows the text, up to `maxHeight`. */
export const CARD_WIDTH = 320;

/** How the plain arrow is named on the card and the edges. */
export const NEXT_LABEL = 'Další';

/** Height of a choice's row, in pixels. */
const CHOICE_ROW = 28;

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
    <IconPlus className='pointer-events-none size-3' stroke={2.5} />
  ) : (
    <span className='pointer-events-none [text-box:trim-both_cap_alphabetic]'>{dotText(dot)}</span>
  );

/** The look of a choice's dot; the canvas puts a handle with it to drag from. */
export const DOT_LOOK =
  'flex size-4 items-center justify-center rounded-full border border-card bg-muted-foreground font-sans text-[9px] leading-none font-semibold text-card';

/**
 * The dot of „+ volba“: larger than the choices' ones, light, with a dashed ring 2 px inside its
 * edge, and shown only while the pointer is over the card or a new edge is dragged out of it.
 */
export const NEW_DOT_LOOK =
  "relative flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 [&.connectingfrom]:opacity-100 before:pointer-events-none before:absolute before:inset-px before:rounded-full before:border before:border-dashed before:border-muted-foreground before:content-[''] hover:text-foreground hover:before:border-yellow-500";

/** A plain dot on the card's bottom edge. */
const PlainDot = ({
  dot,
  x,
  color,
}: {
  readonly dot: DotKey;
  readonly x: number;
  readonly color: TagColor | undefined;
}) => (
  <span
    className={cn(
      dot === 'new' ? NEW_DOT_LOOK : DOT_LOOK,
      dot !== 'new' && color?.dot,
      'absolute bottom-0 -translate-x-1/2 translate-y-1/2',
    )}
    style={{ left: x }}
  >
    <DotContent dot={dot} />
  </span>
);

/** What a card can change; the canvas turns each into a change of the draft. */
export interface CardEdit {
  readonly onSummary: (summary: string) => void;
  /** The summary field was left: the id stops following it. */
  readonly onSummaryDone: () => void;
  readonly onId: (id: string) => void;
  readonly onNote: (note: string) => void;
  readonly onSegments: (segments: readonly DraftSegment[]) => void;
  readonly onLabel: (index: number, label: string) => void;
  readonly onMove: (index: number, offset: number) => void;
  readonly onRemoveChoice: (index: number) => void;
  readonly onRemove: () => void;
}

/**
 * Inside the canvas: React Flow neither drags, pans nor takes the keys typed here, and the wheel
 * scrolls the text.
 */
const IN_CANVAS = 'nodrag nopan nokey nowheel';

/** A text field without a frame that grows with its text; read-only without `onChange`. */
const GrowingField = ({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  readonly value: string;
  readonly onChange: ((value: string) => void) | undefined;
  readonly onBlur?: (() => void) | undefined;
  readonly placeholder: string;
  readonly className?: string;
}) => (
  <textarea
    rows={1}
    value={value}
    placeholder={placeholder}
    readOnly={onChange === undefined}
    onChange={(event) => {
      onChange?.(event.target.value);
    }}
    {...(onBlur === undefined ? {} : { onBlur })}
    className={cn(
      IN_CANVAS,
      '[field-sizing:content] w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/60',
      className,
    )}
  />
);

/** The node's id, written over by hand; it takes effect when the field is left or on Enter. */
const IdField = ({
  id,
  onId,
  color,
}: {
  readonly id: string;
  readonly onId: ((id: string) => void) | undefined;
  readonly color: TagColor | undefined;
}) => {
  const [typed, setTyped] = useState<string>();
  const cancelled = useRef(false);
  return (
    <input
      value={typed ?? id}
      readOnly={onId === undefined}
      title='Id uzlu, jeho název ve skriptu'
      aria-label='Id uzlu'
      onFocus={() => {
        cancelled.current = false;
        setTyped(id);
      }}
      onChange={(event) => {
        setTyped(event.target.value);
      }}
      onBlur={() => {
        if (!cancelled.current && typed !== undefined && typed.trim() !== '' && typed !== id) {
          onId?.(typed);
        }

        setTyped(undefined);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          cancelled.current = event.key === 'Escape';
          event.currentTarget.blur();
        }
      }}
      // A tag in the node's color, as wide as the id.
      className={cn(
        IN_CANVAS,
        'mr-auto [field-sizing:content] max-w-full min-w-8 rounded px-1.5 font-semibold outline-none focus:ring-1 focus:ring-current',
        'border',
        color?.tag ?? 'border-border bg-muted',
      )}
    />
  );
};

/** A small button of a card. */
const CardButton = ({
  title,
  onClick,
  children,
}: {
  readonly title: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) => (
  <button
    type='button'
    title={title}
    aria-label={title}
    onClick={onClick}
    className={cn(
      IN_CANVAS,
      'rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground',
    )}
  >
    {children}
  </button>
);

/**
 * Where a dragged choice would land: before the row it is over, or after it in its lower half;
 * `count` is past the last row.
 */
const dropIndex = (event: DragEvent<HTMLElement>, index: number) => {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2 ? index + 1 : index;
};

/**
 * The choices in a grid, so their texts and targets line up: a handle to drag the choice to
 * another place in the order, its number, as on the dot on the bottom edge, the text of the
 * button, where it leads, and a button to remove it.
 */
const ChoiceList = ({
  choices,
  edit,
}: {
  readonly choices: readonly DraftChoice[];
  readonly edit: CardEdit | undefined;
}) => {
  /** The choice dragged now, and where it would land. */
  const [drag, setDrag] = useState<{ readonly from: number; readonly to: number }>();
  if (choices.length === 0) {
    return null;
  }

  return (
    <div className='grid shrink-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] gap-x-1.5 rounded-b-lg border-t bg-muted/40 px-3 py-1.5'>
      {choices.map((choice, index) => (
        <div
          // The choices have no ids; their order is all there is.
          key={index}
          className={cn(
            'group/row relative col-span-5 grid grid-cols-subgrid items-center',
            drag?.from === index && 'opacity-40',
          )}
          style={{ height: CHOICE_ROW }}
          onDragOver={(event) => {
            if (drag === undefined) {
              return;
            }

            event.preventDefault();
            const to = dropIndex(event, index);
            if (to !== drag.to) {
              setDrag({ ...drag, to });
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (drag === undefined) {
              return;
            }

            // Where it lands once taken out of its place.
            const landing = drag.to > drag.from ? drag.to - 1 : drag.to;
            if (landing !== drag.from) {
              edit?.onMove(drag.from, landing - drag.from);
            }

            setDrag(undefined);
          }}
        >
          {/* A line where the dragged choice would land. */}
          {drag !== undefined && drag.to === index && (
            <span className='pointer-events-none absolute inset-x-0 top-0 h-0.5 -translate-y-1/2 rounded bg-sky-500' />
          )}
          {drag !== undefined && drag.to === index + 1 && index === choices.length - 1 && (
            <span className='pointer-events-none absolute inset-x-0 bottom-0 h-0.5 translate-y-1/2 rounded bg-sky-500' />
          )}
          {/* The handle to drag the choice by: the only thing in a card that can be dragged. */}
          <span
            data-drag-handle
            draggable={edit !== undefined && choices.length > 1}
            title={
              edit !== undefined && choices.length > 1 ? 'Přetažením změníte pořadí' : undefined
            }
            onDragStart={(event) => {
              const row = event.currentTarget.parentElement;
              if (row !== null) {
                event.dataTransfer.setDragImage(row, 8, CHOICE_ROW / 2);
              }

              event.dataTransfer.effectAllowed = 'move';
              setDrag({ from: index, to: index });
            }}
            onDragEnd={() => {
              setDrag(undefined);
            }}
            className={cn(
              IN_CANVAS,
              'flex w-3.5 justify-center text-muted-foreground',
              edit !== undefined && choices.length > 1
                ? 'cursor-grab opacity-40 group-hover/row:opacity-100 hover:text-foreground active:cursor-grabbing'
                : 'invisible',
            )}
          >
            <IconGripVertical className='size-3.5' />
          </span>
          <span className='w-3 text-center font-mono text-[10px] text-muted-foreground'>
            {dotText(index)}
          </span>
          <input
            value={choice.label}
            placeholder={NEXT_LABEL}
            readOnly={edit === undefined}
            aria-label={`Text volby ${index + 1}`}
            onChange={(event) => {
              edit?.onLabel(index, event.target.value);
            }}
            className={cn(
              IN_CANVAS,
              'min-w-0 rounded-md border bg-background px-2 py-0.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring',
            )}
          />
          <span
            title={choice.to}
            className='max-w-24 truncate font-mono text-[10px] text-muted-foreground'
          >
            → {choice.to}
          </span>
          {/* Its place is kept, so the texts stay as wide in every row. */}
          <span className='size-[18px] opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100'>
            {edit !== undefined && (
              <CardButton title='Smazat volbu' onClick={() => edit.onRemoveChoice(index)}>
                <IconX className='size-3.5' />
              </CardButton>
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

export interface DraftNodeCardProps {
  readonly node: DraftNode;
  /** Zoomed out: only the summary, large; the card keeps its size. */
  readonly far?: boolean;
  readonly selected?: boolean;
  /** A new edge dragged now would lead here: the card is outlined. */
  readonly dropTarget?: boolean;
  /** No other node leads here. */
  readonly start?: boolean;
  /** The text scrolls inside the card above this height. */
  readonly maxHeight?: number;
  /** Shows a button to open the node in the focus mode. */
  readonly onOpen?: () => void;
  /** What writing into the card changes; without it the card is only read. */
  readonly edit?: CardEdit;
  /** The dot of a choice, or of a new one, `x` from the card's left; a plain dot by default. */
  readonly dot?: (key: DotKey, x: number, color: TagColor | undefined) => ReactNode;
  /** The node's color, of its id's tag. */
  readonly color?: TagColor;
  /** The colors of the nodes the choices lead to, of their dots, in the order of the choices. */
  readonly choiceColors?: readonly (TagColor | undefined)[];
  readonly ref?: Ref<HTMLDivElement>;
  readonly className?: string;
}

/**
 * A node of the draft on the canvas, as high as its text and written in right there: its id,
 * summary, note, segments and choices, numbered like the dots on the bottom edge their edges start
 * from. It looks the same read or written in, so a click changes nothing but the cursor. From afar
 * the summary covers it, so the whole story reads as a list of events; the two cross-fade.
 */
export const DraftNodeCard = ({
  node,
  far = false,
  selected = false,
  dropTarget = false,
  start = false,
  maxHeight,
  onOpen,
  edit,
  dot = (key, x, dotColor) => <PlainDot dot={key} x={x} color={dotColor} />,
  color,
  choiceColors = [],
  ref,
  className,
}: DraftNodeCardProps) => (
  <div
    ref={ref}
    // Only the choices' handles drag: text selected in a field is not dragged to another one.
    onDragStartCapture={(event) => {
      if (!(event.target instanceof Element && event.target.closest('[data-drag-handle]'))) {
        event.preventDefault();
      }
    }}
    className={cn(
      'group/card relative flex flex-col rounded-lg border bg-card text-card-foreground shadow-xs',
      selected && 'outline-2 outline-offset-2 outline-yellow-500',
      dropTarget && 'outline-2 outline-offset-4 outline-sky-500',
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
        <IdField id={node.id} onId={edit?.onId} color={color} />
        {start && <span className='rounded bg-muted px-1'>začátek</span>}
        {node.choices.length === 0 && <span className='rounded bg-muted px-1'>konec</span>}
        {onOpen !== undefined && (
          <CardButton title='Otevřít v režimu soustředění' onClick={onOpen}>
            <IconArrowsMaximize className='size-3.5' />
          </CardButton>
        )}
        {edit !== undefined && (
          <CardButton title='Smazat uzel' onClick={edit.onRemove}>
            <IconTrash className='size-3.5' />
          </CardButton>
        )}
      </div>
      <div className='flex flex-col gap-1 px-3 pt-1'>
        <GrowingField
          value={node.summary}
          placeholder='Shrnutí: co se v uzlu stane'
          onChange={edit?.onSummary}
          onBlur={edit?.onSummaryDone}
          className='text-sm leading-snug font-medium'
        />
        {/* Always there, so writing a note does not change the card's height; its hint only
            shows over the card. */}
        <GrowingField
          value={node.note ?? ''}
          placeholder='Poznámka pro převod: podmínky, stav, QR…'
          onChange={edit?.onNote}
          className='text-xs text-muted-foreground italic placeholder:opacity-0 group-hover/card:placeholder:opacity-100 focus:placeholder:opacity-100'
        />
      </div>
      {/* Scrolls when the card would be taller than the viewport; with the wheel once selected. */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3 leading-relaxed',
          selected && 'nowheel',
        )}
      >
        <SegmentEditor
          value={node.segments}
          {...(edit === undefined ? { readOnly: true } : { onChange: edit.onSegments })}
          fontSize={11}
          className={cn(IN_CANVAS, 'min-h-6 cursor-text')}
        />
      </div>
    </div>
    <ChoiceList choices={node.choices} edit={edit} />
    {/* From afar the summary covers the card, and takes the clicks meant for the node. */}
    <div
      className={cn(
        'absolute inset-0 overflow-hidden rounded-[inherit] bg-card p-5 transition-opacity duration-300',
        !far && 'pointer-events-none opacity-0',
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
      <Fragment key={key}>
        {dot(key, dotX(node.choices.length, key), key === 'new' ? undefined : choiceColors[key])}
      </Fragment>
    ))}
  </div>
);
