import { IconArrowsMaximize } from '@tabler/icons-react';
import {
  Fragment,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { PROBLEM_TEXT, type DraftChoice, type DraftNode, type DraftSize } from './draft';
import { SegmentEditor } from './segment-editor';
import type { TagColor } from './tag-colors';

/** The card's width; its height follows the text, up to `maxHeight`. */
export const CARD_WIDTH = 320;

/** How far a card can be resized, in pixels. */
const SIZE_LIMITS = { width: [240, 800], height: [120, 2000] } as const;

/** The card's width: as the author set it, or the default one. */
export const widthOf = (node: DraftNode) => node.size?.width ?? CARD_WIDTH;

/**
 * What a dot stands for: a choice by its index, a new choice of this node (the plus in the bottom
 * right corner), or a new choice of another node into this one (the plus in the top left corner).
 */
export type DotKey = number | 'new' | 'in';

/**
 * The card's border: the dots are placed inside it, the layout counts from its outer edge, so the
 * dots move back by it to sit where the edges start.
 */
const CARD_BORDER = 1;

/** How far apart the dots in one pill are: a dot and the gap after it, in pixels. */
const SEGMENT = 17;

/** Where the dots sit on the card's bottom edge, from its left. */
export interface DotPlaces {
  /** The choices leading to one node, in one pill each, left to right, with its center. */
  readonly groups: readonly { readonly members: readonly number[]; readonly center: number }[];
  /** Where each choice's dot is, by the choice's index. */
  readonly choices: readonly number[];
  /** Where the edge to the end ring leaves an end node: the middle of its bottom edge. */
  readonly end: number;
}

/**
 * Where the dots sit: the choices leading to the same node side by side in one pill, the pills
 * spread evenly, then the plus. The pills go in `order`, the ids of the nodes they lead to, as the
 * layout chose it so the edges cross the least; without it, or for a node not in it, in the order
 * their nodes first come among the choices. The layout attaches the edges there without measuring.
 */
export const dotPlaces = (
  choices: readonly DraftChoice[],
  width = CARD_WIDTH,
  order?: readonly string[],
): DotPlaces => {
  const byTarget = new Map<string, number[]>();
  for (const [index, choice] of choices.entries()) {
    byTarget.set(choice.to, [...(byTarget.get(choice.to) ?? []), index]);
  }

  const rank = (target: string) => {
    const at = order?.indexOf(target) ?? -1;
    return at < 0 ? Number.POSITIVE_INFINITY : at;
  };

  const targets = [...byTarget.keys()].toSorted((left, right) => rank(left) - rank(right));
  // The pills alone share the edge; the plus sits in the corner, apart from them.
  const slots = byTarget.size;
  const xs = choices.map(() => 0);
  const groups = targets.map((target, slot) => {
    const members = byTarget.get(target)!;
    const center = (width * (slot + 1)) / (slots + 1);
    for (const [place, index] of members.entries()) {
      xs[index] = center + (place - (members.length - 1) / 2) * SEGMENT;
    }

    return { members, center };
  });
  return { groups, choices: xs, end: width / 2 };
};

/**
 * What a dot shows: the choice's number, trimmed to the height of its digits so it sits in the
 * middle of the circle; in a corner's circle, a small dot of the canvas's color.
 */
export const DotContent = ({ dot }: { readonly dot: DotKey }) =>
  typeof dot === 'number' ? (
    <span className='pointer-events-none [text-box:trim-both_cap_alphabetic]'>{dot + 1}</span>
  ) : (
    // Above the circle drawn behind it.
    <span className='pointer-events-none relative size-1.5 rounded-full bg-background' />
  );

/** The shape of a choice's dot and number, without its colors. */
export const DOT_SHAPE =
  'flex size-4 shrink-0 items-center justify-center font-sans text-[9px] leading-none font-semibold';

/** The colors of a choice's dot leading to no node of the draft. */
export const DOT_GREY = 'bg-muted-foreground text-card';

/**
 * The circles in the corners, to draw a new edge from: small and solid in the text's color, white
 * on the dark canvas, with a dot in the canvas's color, in a larger target to grab. Shown only
 * while the pointer is over the card or near it, or a new edge is dragged out of it; over the
 * resize handles, so its cursor wins in the corner.
 */
export const NEW_DOT_LOOK =
  "relative z-20 flex size-8 items-center justify-center rounded-full opacity-0 transition-opacity group-hover/card:opacity-100 [&.connectingfrom]:opacity-100 before:pointer-events-none before:absolute before:inset-2 before:rounded-full before:bg-foreground before:shadow-sm before:transition-[inset] before:content-[''] hover:before:inset-1.5";

/**
 * A plain dot: a choice's one in its pill, or the plus on the bottom edge at `x`; the canvas puts
 * handles there instead.
 */
const PlainDot = ({
  dot,
  x,
  color,
}: {
  readonly dot: DotKey;
  readonly x: number | undefined;
  readonly color: TagColor | undefined;
}) => (
  <span
    className={cn(
      dot === 'new' && cn(NEW_DOT_LOOK, 'absolute bottom-0 -translate-x-1/2 translate-y-1/2'),
      dot === 'in' && cn(NEW_DOT_LOOK, 'absolute top-0 -translate-x-1/2 -translate-y-1/2'),
      typeof dot === 'number' && cn(DOT_SHAPE, color?.tag ?? DOT_GREY),
    )}
    style={{
      ...(x === undefined ? {} : { left: x }),
      ...(typeof dot === 'number' ? {} : { scale: 'var(--zoom-out, 1)' }),
    }}
  >
    <DotContent dot={dot} />
  </span>
);

/**
 * The dots of the choices leading to one node, side by side in one pill on the bottom edge; a
 * single choice's pill is a circle. Over the resize handles, so their cursor does not show there.
 */
const DotPill = ({
  center,
  children,
}: {
  readonly center: number;
  readonly children: ReactNode;
}) => (
  <span
    className='absolute bottom-0 z-20 flex -translate-x-1/2 translate-y-1/2 gap-px overflow-hidden rounded-full bg-card ring-1 ring-card'
    // As large on the screen at any zoom of the canvas, which sets `--zoom-out`.
    style={{ left: center - CARD_BORDER, scale: 'var(--zoom-out, 1)' }}
  >
    {children}
  </span>
);

/** What a card can change; the canvas turns each into a change of the draft. */
export interface CardEdit {
  /** Sizes the card as the author dragged it; `undefined` lets it follow its text again. */
  readonly onResize: (size: DraftSize | undefined) => void;
}

/**
 * Inside the canvas: React Flow neither drags, pans nor takes the keys typed here, and the wheel
 * scrolls the text.
 */
const IN_CANVAS = 'nodrag nopan nokey nowheel';

/**
 * The node's id as a tag in its color, written over by hand in the detail; it takes effect when
 * the field is left or on Enter, and Esc takes it back.
 */
export const IdField = ({
  id,
  onId,
  color,
  className,
}: {
  readonly id: string;
  readonly onId: (id: string) => void;
  readonly color: TagColor | undefined;
  readonly className?: string;
}) => {
  const [typed, setTyped] = useState<string>();
  const cancelled = useRef(false);
  return (
    <input
      value={typed ?? id}
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
          onId(typed);
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
        '[field-sizing:content] max-w-full min-w-8 rounded px-1.5 font-semibold outline-none focus:ring-1 focus:ring-current',
        color?.tag ?? 'bg-muted',
        className,
      )}
    />
  );
};

/**
 * A small button that removes something: it asks first, in a popover beside it, with the remove
 * button focused, so Enter confirms and Esc cancels.
 */
export const RemoveButton = ({
  title,
  question,
  detail,
  onConfirm,
  children,
}: {
  readonly title: string;
  readonly question: string;
  readonly detail?: string;
  readonly onConfirm: () => void;
  readonly children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          title={title}
          aria-label={title}
          className={cn(
            IN_CANVAS,
            'rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive',
            open && 'bg-muted text-destructive',
          )}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side='top'
        className='w-64 font-sans'
        // The yes is focused, so Enter removes, as in the canvas's removal dialog.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          confirm.current?.focus();
        }}
      >
        <p className='text-sm font-medium'>{question}</p>
        {detail !== undefined && <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>}
        <div className='mt-3 flex justify-end gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setOpen(false);
            }}
          >
            Zrušit
          </Button>
          <Button
            ref={confirm}
            variant='destructive'
            size='sm'
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Smazat
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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

/** Which sides a resize handle moves: the right edge, the bottom edge, or both from the corner. */
type ResizeAxis = 'x' | 'y' | 'xy';

const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.round(Math.min(max, Math.max(min, value)));

/**
 * A handle on the card's right edge, bottom edge or corner to resize it with the pointer: the card
 * follows the pointer, and the size is set when the pointer is let go. A double click lets the
 * sides it moves follow the text again.
 */
const ResizeHandle = ({
  axis,
  card,
  size,
  onLive,
  onResize,
}: {
  readonly axis: ResizeAxis;
  readonly card: RefObject<HTMLDivElement | null>;
  readonly size: DraftSize | undefined;
  readonly onLive: (size: DraftSize | undefined) => void;
  readonly onResize: (size: DraftSize | undefined) => void;
}) => {
  /** Where the drag began, the card's size then, and how much the canvas is zoomed. */
  const start = useRef<{ x: number; y: number; width: number; height: number; scale: number }>(
    undefined,
  );
  const live = useRef<DraftSize>(undefined);
  const moved = (event: PointerEvent<HTMLSpanElement>): DraftSize | undefined => {
    const from = start.current;
    if (from === undefined) {
      return undefined;
    }

    return {
      ...size,
      ...(axis === 'y'
        ? {}
        : { width: clamp(from.width + (event.clientX - from.x) / from.scale, SIZE_LIMITS.width) }),
      ...(axis === 'x'
        ? {}
        : {
            height: clamp(from.height + (event.clientY - from.y) / from.scale, SIZE_LIMITS.height),
          }),
    };
  };

  return (
    <span
      aria-hidden
      className={cn(
        IN_CANVAS,
        'absolute z-10 touch-none',
        axis === 'x' && 'top-0 right-0 h-full w-2 translate-x-1/2 cursor-ew-resize',
        axis === 'y' && 'bottom-0 left-0 h-2 w-full translate-y-1/2 cursor-ns-resize',
        axis === 'xy' && 'right-0 bottom-0 size-3 translate-1/2 cursor-nwse-resize',
      )}
      onPointerDown={(event) => {
        const element = card.current;
        if (element === null) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = {
          x: event.clientX,
          y: event.clientY,
          width: element.offsetWidth,
          height: element.offsetHeight,
          scale: element.getBoundingClientRect().width / element.offsetWidth,
        };
      }}
      onPointerMove={(event) => {
        const next = moved(event);
        if (next !== undefined) {
          live.current = next;
          onLive(next);
        }
      }}
      onPointerUp={() => {
        const next = live.current;
        start.current = undefined;
        live.current = undefined;
        onLive(undefined);
        if (next !== undefined) {
          onResize(next);
        }
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        const { width, height } = size ?? {};
        const kept = {
          ...(axis === 'y' && width !== undefined ? { width } : {}),
          ...(axis === 'x' && height !== undefined ? { height } : {}),
        };
        onResize(Object.keys(kept).length === 0 ? undefined : kept);
      }}
    />
  );
};

export interface DraftNodeCardProps {
  readonly node: DraftNode;
  /** Zoomed out: only the summary, large; the card keeps its size. */
  readonly far?: boolean;
  readonly selected?: boolean;
  /** The nodes the choices lead to, in the order of their dots on the bottom edge. */
  readonly targetOrder?: readonly string[];
  /** A new edge dragged now would lead here: the card is outlined. */
  readonly dropTarget?: boolean;
  /** The node the story begins at. */
  readonly start?: boolean;
  /** The start points at other nodes too, which is a problem. */
  readonly startClash?: boolean;
  /** Nothing leads here, and it is not the start: it hangs loose, which is a problem. */
  readonly loose?: boolean;
  /** Something is wrong with the node: its outline is red. */
  readonly invalid?: boolean;
  /** The text scrolls inside the card above this height. */
  readonly maxHeight?: number;
  /** Shows a button to open the node in the focus mode. */
  readonly onOpen?: () => void;
  /** What writing into the card changes; without it the card is only read. */
  readonly edit?: CardEdit;
  /** The dot of a choice, or of a new one, `x` from the card's left; a plain dot by default. */
  /** `x` only for the plus: a choice's dot sits in its pill. */
  readonly dot?: (key: DotKey, x: number | undefined, color: TagColor | undefined) => ReactNode;
  /** The node's color, of its id's tag. */
  readonly color?: TagColor;
  /** The colors of the nodes the choices lead to, of their dots, in the order of the choices. */
  readonly choiceColors?: readonly (TagColor | undefined)[];
  readonly ref?: Ref<HTMLDivElement>;
  readonly className?: string;
}

/**
 * A node of the draft on the canvas, as high as its text, only shown: its id, summary, note and
 * segments; it is written in the detail. Its choices are the numbered dots on the bottom edge,
 * where their edges start, with their texts on the edges. From afar the summary covers the card,
 * so the whole story reads as a list of events; the two cross-fade.
 */
export const DraftNodeCard = ({
  node,
  far = false,
  selected = false,
  targetOrder,
  dropTarget = false,
  start = false,
  startClash = false,
  loose = false,
  invalid = false,
  maxHeight,
  onOpen,
  edit,
  dot = (key, x, dotColor) => <PlainDot dot={key} x={x} color={dotColor} />,
  color,
  choiceColors = [],
  ref,
  className,
}: DraftNodeCardProps) => {
  const own = useRef<HTMLDivElement>(null);
  /** The size while a handle is dragged, before it is set. */
  const [live, setLive] = useState<DraftSize>();
  const size = live ?? node.size;
  const width = size?.width ?? CARD_WIDTH;
  const places = dotPlaces(node.choices, width, targetOrder);
  return (
    <div
      ref={(element) => {
        own.current = element;
        if (typeof ref === 'function') {
          ref(element);
        } else if (ref !== null && ref !== undefined) {
          ref.current = element;
        }
      }}
      // Only the choices' handles drag: text selected in a field is not dragged to another one.
      onDragStartCapture={(event) => {
        if (!(event.target instanceof Element && event.target.closest('[data-drag-handle]'))) {
          event.preventDefault();
        }
      }}
      className={cn(
        // The border only keeps its room; the outline is a ring around it, as wide on the screen at
        // any zoom of the canvas, which sets `--line` to one screen pixel.
        'group/card relative flex flex-col rounded-lg border border-transparent bg-card text-card-foreground shadow-xs ring-[length:var(--line,1px)] ring-border',
        invalid && 'ring-[length:calc(2*var(--line,1px))] ring-destructive',
        selected &&
          'outline-[length:calc(2*var(--line,1px))] outline-offset-[calc(3*var(--line,1px))] outline-yellow-500',
        dropTarget &&
          'outline-[length:calc(2*var(--line,1px))] outline-offset-[calc(5*var(--line,1px))] outline-sky-500',
        className,
      )}
      style={{
        width,
        // A height set by hand holds; else the card follows its text up to `maxHeight`.
        ...(size?.height === undefined
          ? maxHeight === undefined
            ? {}
            : { maxHeight }
          : { height: size.height }),
      }}
    >
      {/* Room around the card, from the outside of its border, that counts as over it, so its
        dots and the plus show a bit sooner: 24 px on the screen, but no more than 24 px of the
        canvas, half the gap between cards, so two cards' rooms never overlap. Under the card, and
        a click there is no click on the node. */}
      <div
        data-card-halo
        aria-hidden
        className='absolute -z-10'
        style={{ inset: `calc(-1 * min(24 * var(--line, 1px), 24px) - ${CARD_BORDER}px)` }}
      />
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col transition-opacity duration-300',
          far && 'opacity-0',
        )}
      >
        <div className='flex h-6 items-center gap-2 px-3 pt-2 font-mono text-[11px] text-muted-foreground'>
          <span
            title='Id uzlu, jeho název ve skriptu'
            className={cn(
              'mr-auto max-w-full truncate rounded px-1.5 font-semibold',
              color?.tag ?? 'bg-muted',
            )}
          >
            {node.id}
          </span>
          {start && (
            <span
              title={startClash ? 'Začátek vede do víc uzlů; má vést jen do jednoho.' : undefined}
              className={cn('rounded px-1', startClash ? 'bg-destructive text-white' : 'bg-muted')}
            >
              začátek
            </span>
          )}
          {loose && (
            <span
              title='Do uzlu nevede žádná volba a není to začátek příběhu.'
              className='rounded bg-destructive px-1 text-white'
            >
              {PROBLEM_TEXT.loose.toLowerCase()}
            </span>
          )}
          {node.choices.length === 0 && <span className='rounded bg-muted px-1'>konec</span>}
          {onOpen !== undefined && (
            <CardButton title='Otevřít v detailu (Enter nebo mezerník)' onClick={onOpen}>
              <IconArrowsMaximize className='size-3.5' />
            </CardButton>
          )}
        </div>
        <div className='flex flex-col gap-1 px-3 pt-1'>
          <p
            className={cn(
              'text-sm leading-snug font-medium',
              node.summary === '' && 'text-muted-foreground/60',
            )}
          >
            {node.summary === '' ? 'Bez shrnutí' : node.summary}
          </p>
          {node.note !== undefined && (
            <p className='text-xs whitespace-pre-line text-muted-foreground italic'>{node.note}</p>
          )}
        </div>
        {/* Scrolls when the card would be taller than the viewport; with the wheel once selected. */}
        <div
          className={cn(
            // Room under the text for the dots on the bottom edge.
            'min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-5 leading-relaxed',
            selected && 'nowheel',
          )}
        >
          {/* Only read here: the node is written in the detail. */}
          <SegmentEditor
            value={node.segments}
            readOnly
            fontSize={11}
            // The themes are set in the detail; the card only shows where segments divide.
            themes={false}
            className='min-h-6'
          />
        </div>
      </div>
      {/* From afar the summary covers the card, and takes the clicks meant for the node. */}
      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-[inherit] bg-card p-5 transition-opacity duration-300',
          !far && 'pointer-events-none opacity-0',
        )}
      >
        {/* Larger on the screen than the zoom alone would make it: the canvas sets `--zoom-out`
          to one over the zoom, and the text grows with a part of it. */}
        <p
          // Czech, so a word too long for the card is split with a hyphen where Czech allows.
          lang='cs'
          className='leading-tight font-normal wrap-break-word hyphens-auto'
          style={{ fontSize: 'calc(30px * pow(var(--zoom-out, 1), 0.4))' }}
        >
          {node.summary === '' ? (
            <span className='text-muted-foreground'>Bez shrnutí</span>
          ) : (
            node.summary
          )}
        </p>
      </div>
      {edit !== undefined &&
        (['x', 'y', 'xy'] as const).map((axis) => (
          <ResizeHandle
            key={axis}
            axis={axis}
            card={own}
            size={node.size}
            onLive={setLive}
            onResize={edit.onResize}
          />
        ))}
      {/* On the bottom edge, where the edges start; over the summary too. */}
      {places.groups.map((group) => (
        <DotPill key={group.members[0]} center={group.center}>
          {group.members.map((index) => (
            <Fragment key={index}>{dot(index, undefined, choiceColors[index])}</Fragment>
          ))}
        </DotPill>
      ))}
      {/* In the corners, on the edges' sides: out of the bottom right, into the top left. */}
      {dot('new', width - CARD_BORDER, undefined)}
      {/* On the top edge, right of where the edges come in: a choice of another node into here. */}
      {dot('in', -CARD_BORDER, undefined)}
    </div>
  );
};
