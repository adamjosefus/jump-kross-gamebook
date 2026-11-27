import { IconAlertTriangle } from '@tabler/icons-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import {
  PROBLEM_HINT,
  PROBLEM_TEXT,
  type DraftChoice,
  type DraftNode,
  type DraftProblem,
  type DraftSize,
} from './draft';
import { SegmentEditor } from './segment-editor';
import type { TagColor } from './tag-colors';

/** The card's width; its height follows the text, up to `maxHeight`. */
export const CARD_WIDTH = 320;

/**
 * The largest the summary grows from afar, in the canvas's pixels; a card that follows its text is
 * at least as high as the summary at this size, so from afar it shows whole.
 */
const FAR_SUMMARY_MAX = 36;

/** In place of a summary not written yet: a faint dash, not a word to read. */
const NO_SUMMARY = '—';

/** The summary as it covers the card from afar; the same in the room kept for it. */
const FAR_SUMMARY = 'p-5 leading-tight font-normal wrap-break-word hyphens-auto';

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
const SEGMENT = 21;

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
  'flex size-5 shrink-0 items-center justify-center font-sans text-2xs leading-none font-semibold';

/** The colors of a choice's dot leading to no node of the draft. */
export const DOT_GREY = 'bg-muted text-muted-foreground';

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
 * A small button that removes something: it asks first, in a popover beside it, with the remove
 * button focused, so Enter confirms and Esc cancels.
 */
export const RemoveButton = ({
  title,
  question,
  detail,
  onConfirm,
  className,
  children,
}: {
  readonly title: string;
  readonly question: string;
  readonly detail?: string;
  readonly onConfirm: () => void;
  /** Of the button, over its small look. */
  readonly className?: string;
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
            className,
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

/**
 * The warning sign of a node with something wrong; its tooltip says what, and what to do about
 * it. The card names no problem otherwise.
 */
const ProblemSign = ({
  problems,
  className,
}: {
  readonly problems: readonly DraftProblem[];
  readonly className?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        role='img'
        aria-label={problems.map((problem) => PROBLEM_TEXT[problem]).join(', ')}
        className={cn('flex shrink-0 cursor-help text-destructive', className)}
      >
        <IconAlertTriangle className='size-full' />
      </span>
    </TooltipTrigger>
    <TooltipContent side='top' className='max-w-64 flex-col items-start gap-2 text-left'>
      {problems.map((problem) => (
        <span key={problem} className='flex flex-col gap-0.5'>
          <span className='font-semibold'>{PROBLEM_TEXT[problem]}</span>
          <span className='opacity-80'>{PROBLEM_HINT[problem]}</span>
        </span>
      ))}
    </TooltipContent>
  </Tooltip>
);

/**
 * Which sides a resize handle moves: one edge, or the two edges of a corner. The top left corner
 * holds the plus into the node, the bottom right one the plus out of it; the plus wins there.
 */
interface ResizeSides {
  readonly x?: 'left' | 'right';
  readonly y?: 'top' | 'bottom';
}

const RESIZE_HANDLES: readonly (ResizeSides & {
  readonly key: string;
  readonly className: string;
})[] = [
  {
    key: 'right',
    x: 'right',
    className: 'top-0 right-0 h-full w-2 translate-x-1/2 cursor-ew-resize',
  },
  {
    key: 'left',
    x: 'left',
    className: 'top-0 left-0 h-full w-2 -translate-x-1/2 cursor-ew-resize',
  },
  {
    key: 'bottom',
    y: 'bottom',
    className: 'bottom-0 left-0 h-2 w-full translate-y-1/2 cursor-ns-resize',
  },
  { key: 'top', y: 'top', className: 'top-0 left-0 h-2 w-full -translate-y-1/2 cursor-ns-resize' },
  {
    key: 'bottom-right',
    x: 'right',
    y: 'bottom',
    className: 'right-0 bottom-0 size-3 translate-1/2 cursor-nwse-resize',
  },
  {
    key: 'top-right',
    x: 'right',
    y: 'top',
    className: 'top-0 right-0 size-3 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  },
  {
    key: 'bottom-left',
    x: 'left',
    y: 'bottom',
    className: 'bottom-0 left-0 size-3 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  },
] as const;

const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.round(Math.min(max, Math.max(min, value)));

/**
 * A handle on the card's edge or corner to resize it with the pointer: the card follows the
 * pointer, and the size is set when the pointer is let go. A double click lets the sides it moves
 * follow the text again.
 */
const ResizeHandle = ({
  sides,
  className,
  card,
  size,
  onLive,
  onResize,
}: {
  readonly sides: ResizeSides;
  readonly className: string;
  readonly card: RefObject<HTMLDivElement | null>;
  readonly size: DraftSize | undefined;
  readonly onLive: (size: DraftSize | undefined) => void;
  readonly onResize: (size: DraftSize | undefined) => void;
}) => {
  /** Where the drag began, the card's size then, and how much the canvas is zoomed. */
  const start = useRef<{
    readonly pointerX: number;
    readonly pointerY: number;
    readonly width: number;
    readonly height: number;
    readonly scale: number;
  }>(undefined);
  const live = useRef<DraftSize>(undefined);
  const moved = (event: PointerEvent<HTMLSpanElement>): DraftSize | undefined => {
    const from = start.current;
    if (from === undefined) {
      return undefined;
    }

    // The pointer's way in the canvas's pixels. Pulled out by its left or top edge, the card grows
    // as much, but to the right or down: it stays where it is, as the layout keeps it, and the
    // layout places it anew when the pointer is let go.
    const along = (pointer: number, origin: number, side: 'left' | 'right' | 'top' | 'bottom') =>
      ((side === 'left' || side === 'top' ? -1 : 1) * (pointer - origin)) / from.scale;
    const width =
      sides.x === undefined
        ? undefined
        : clamp(from.width + along(event.clientX, from.pointerX, sides.x), SIZE_LIMITS.width);
    const height =
      sides.y === undefined
        ? undefined
        : clamp(from.height + along(event.clientY, from.pointerY, sides.y), SIZE_LIMITS.height);
    return {
      ...size,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    };
  };

  return (
    <span
      aria-hidden
      className={cn(IN_CANVAS, 'absolute z-10 touch-none', className)}
      onPointerDown={(event) => {
        const element = card.current;
        if (element === null) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = {
          pointerX: event.clientX,
          pointerY: event.clientY,
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
          ...(sides.x === undefined && width !== undefined ? { width } : {}),
          ...(sides.y === undefined && height !== undefined ? { height } : {}),
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
  /** What is wrong with the node, shown by a warning sign; nothing for a node in order. */
  readonly problems?: readonly DraftProblem[];
  /** The text scrolls inside the card above this height. */
  readonly maxHeight?: number;
  /** What writing into the card changes; without it the card is only read. */
  readonly edit?: CardEdit;
  /**
   * The dot of a choice, or a plus, a plain dot by default; `x` from the card's left only for the
   * plus, a choice's dot sits in its pill.
   */
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
  problems = [],
  maxHeight,
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
      // Nothing on the card drags as the browser's drag: selected text is not carried away.
      onDragStartCapture={(event) => {
        event.preventDefault();
      }}
      className={cn(
        // The border only keeps its room; the outline is a ring around it, as wide on the screen at
        // any zoom of the canvas, which sets `--line` to one screen pixel.
        'group/card relative flex flex-col rounded-lg border border-transparent bg-card/70 text-card-foreground shadow-xs ring-[length:var(--line,1px)] ring-border backdrop-blur-xs',
        selected &&
          // A thin line in the text's color: white on the dark canvas.
          'outline-[length:var(--line,1px)] outline-offset-[calc(3*var(--line,1px))] outline-foreground',
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
      {/* The close look and the room of the summary from afar in one cell: a card that follows its
        text is as high as the higher of the two. */}
      <div className='grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]'>
        <p
          aria-hidden
          lang='cs'
          className={cn('invisible overflow-hidden [grid-area:1/1]', FAR_SUMMARY)}
          style={{ fontSize: FAR_SUMMARY_MAX }}
        >
          {node.summary === '' ? NO_SUMMARY : node.summary}
        </p>
        <div
          className={cn(
            'flex min-h-0 flex-col transition-opacity duration-300 [grid-area:1/1]',
            far && 'opacity-0',
          )}
        >
          <div className='flex items-center gap-2 px-3 pt-2.5 font-mono text-2xs leading-4 text-muted-foreground'>
            <span
              title='Id uzlu, jeho název ve skriptu'
              className={cn(
                'mr-auto max-w-full truncate rounded-md px-2 py-0.5 font-semibold',
                color?.tag ?? 'bg-muted',
              )}
            >
              {node.id}
            </span>
            {start && <span className='rounded-md bg-muted px-1.5 py-0.5'>začátek</span>}
            {node.choices.length === 0 && (
              <span className='rounded-md bg-muted px-1.5 py-0.5'>konec</span>
            )}
            {problems.length > 0 && <ProblemSign problems={problems} className='size-4' />}
          </div>
          <div className='flex flex-col gap-1 px-3 pt-1'>
            <p
              className={cn(
                'text-sm leading-snug font-medium',
                node.summary === '' && 'text-foreground/20',
              )}
            >
              {node.summary === '' ? NO_SUMMARY : node.summary}
            </p>
            {node.note !== undefined && (
              <p className='text-xs whitespace-pre-line text-muted-foreground italic'>
                {node.note}
              </p>
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
      </div>
      {/* From afar the summary takes the place of the rest, faded out under it, and takes the clicks
        meant for the node. */}
      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-[inherit] transition-opacity duration-300',
          !far && 'pointer-events-none opacity-0',
        )}
      >
        {/* Larger on the screen than the zoom alone would make it: the canvas sets `--zoom-out`
          to one over the zoom, and the text grows with a part of it, up to the size the card
          keeps room for. */}
        <p
          // Czech, so a word too long for the card is split with a hyphen where Czech allows.
          lang='cs'
          className={FAR_SUMMARY}
          style={{
            fontSize: `min(calc(30px * pow(var(--zoom-out, 1), 0.4)), ${FAR_SUMMARY_MAX}px)`,
          }}
        >
          {problems.length > 0 && (
            // In the top right corner, the text flowing round it; as large as a line of the text.
            <ProblemSign problems={problems} className='float-right ml-2 size-[1.2em]' />
          )}
          {node.summary === '' ? (
            <span className='text-foreground/20'>{NO_SUMMARY}</span>
          ) : (
            node.summary
          )}
        </p>
      </div>
      {edit !== undefined &&
        RESIZE_HANDLES.map(({ key, className: place, ...sides }) => (
          <ResizeHandle
            key={key}
            sides={sides}
            className={place}
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
      {/* In the top left corner: a choice of another node into here. */}
      {dot('in', -CARD_BORDER, undefined)}
    </div>
  );
};
