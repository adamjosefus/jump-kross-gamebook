import '@xyflow/react/dist/style.css';
import { IconPlus } from '@tabler/icons-react';
import {
  Background,
  Controls,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useConnection,
  useNodeId,
  useStore,
  useUpdateNodeInternals,
  useStoreApi,
  type ConnectionLineComponentProps,
  type FinalConnectionState,
  type Node,
  type NodeProps,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ARROW_HEAD,
  FinalDot,
  RouteEdgeView,
  type InitialFlowNode,
  type RouteEdge,
} from '@/features/story/graph-edges';
import {
  FINAL_SIZE,
  finalEdgeId,
  finalRingId,
  INITIAL_ID,
  INITIAL_SIZE,
  initialEdgeId,
  layoutBoxes,
  type BoxLayout,
} from '@/features/story/graph-layout';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

import {
  draftProblems,
  endsOf,
  meanCharactersOf,
  NEXT_LABEL,
  routesTo,
  startsOf,
  type Draft,
  type DraftNode,
  type DraftProblem,
  type Range,
  type RoutesToEnd,
} from './draft';
import { addStart, linkChoice, linkInto, removeAll, setSize, startInNew } from './draft-edit';
import {
  CARD_WIDTH,
  DOT_SHAPE,
  DotContent,
  dotPlaces,
  DraftNodeCard,
  NEW_DOT_LOOK,
  widthOf,
  type CardEdit,
  type DotKey,
} from './draft-node-card';
import { readViewport, writeViewport } from './editor-view';
import { differenceText } from './numbers';
import { tagColor, type TagColor } from './tag-colors';

/** How far the pointer may move on a dot, in pixels, and still make a click, not a drag. */
const CLICK_DISTANCE = 4;

/** Below this zoom the cards show only their summaries. */
export const FAR_ZOOM = 0.7;

/** The zoom a double-clicked node is brought to, so its text reads well. */
const CLOSE_ZOOM = 1.1;

/** Room kept around a card as high as the canvas, so it fits at the zoom of 1. */
const VIEWPORT_MARGIN = 48;

/** Length of the moves of the view, in ms. */
const MOVE_DURATION = 400;

type DraftFlowNode = Node<
  {
    readonly node: DraftNode;
    readonly start: boolean;
    /** What is wrong with the node; nothing for a node in order. */
    readonly problems: readonly DraftProblem[];
    readonly maxHeight: number;
    /** A new edge dragged now would lead here. */
    readonly dropTarget: boolean;
    readonly color: TagColor;
    /** The colors of the nodes the choices lead to. */
    readonly choiceColors: readonly (TagColor | undefined)[];
    /** The nodes the choices lead to, in the order of the dots the layout chose. */
    readonly targetOrder: readonly string[] | undefined;
  },
  'draft'
>;

/**
 * What the cards need from the canvas: where to report their heights, whether to offer drags, and
 * what a card can change, its size. The cards are told apart by their flow ids.
 */
const CardContext = createContext<{
  readonly onHeight: (key: string, height: number) => void;
  readonly connectable: boolean;
  readonly editOf: ((key: string) => CardEdit) | undefined;
  /** A click on the plus of the card `key`: a choice leading to a new node. */
  readonly onAdd: ((key: string) => void) | undefined;
  /** A click on the top plus of the card `key`: a new node with a choice leading here. */
  readonly onAddInto: ((key: string) => void) | undefined;
  /** A click on the start dot while it points nowhere: a new node the story begins at. */
  readonly onStartNew: (() => void) | undefined;
}>({
  onHeight: () => {},
  onStartNew: undefined,
  connectable: false,
  editOf: undefined,
  onAdd: undefined,
  onAddInto: undefined,
});

/** Handle id of a choice's dot, or of a plus. */
const dotHandle = (key: DotKey) => `choice-${key}`;

/** The handle of the start dot, to drag the start's arrow from. */
const START_HANDLE = 'start';

/** The choice a handle stands for, the inverse of `dotHandle`. */
const dotOf = (handle: string | null | undefined): DotKey | undefined => {
  if (handle === 'choice-new') {
    return 'new';
  }

  if (handle === 'choice-in') {
    return 'in';
  }

  if (handle === null || handle === undefined || !handle.startsWith('choice-')) {
    return undefined;
  }

  const index = Number(handle.slice('choice-'.length));
  if (!Number.isInteger(index)) {
    return undefined;
  }

  return index;
};

/**
 * A dot on the card's edge as a handle. Only a plus starts a new edge, when the canvas lets the
 * draft change: the one on the bottom edge a choice of this node, the one on the top edge a choice
 * of another node into this one. A choice's dot only marks where its edge leaves.
 */
const DotHandle = ({
  dot,
  x,
  color,
}: {
  readonly dot: DotKey;
  readonly x: number | undefined;
  readonly color: TagColor | undefined;
}) => {
  const { connectable, onAdd, onAddInto } = use(CardContext);
  const key = useNodeId();
  const plus = typeof dot !== 'number';
  const onClick = dot === 'new' ? onAdd : onAddInto;
  return (
    <Handle
      type='source'
      id={dotHandle(dot)}
      position={dot === 'in' ? Position.Top : Position.Bottom}
      isConnectable={connectable && plus}
      style={{
        ...(x === undefined ? {} : { left: x }),
        // A plus keeps its size on the screen at any zoom, as its pill does for a choice's dot.
        ...(plus ? { scale: 'var(--zoom-out, 1)' } : {}),
      }}
      {...(plus && onClick !== undefined && key !== null
        ? {
            title:
              dot === 'new'
                ? 'Přidat volbu: klikněte, nebo táhněte na uzel'
                : 'Přidat volbu sem: klikněte, nebo táhněte na uzel, odkud má vést',
            onClick: () => {
              onClick(key);
            },
          }
        : {})}
      className={cn(
        // React Flow's own handle look gives way to the dot's.
        'min-h-0! min-w-0!',
        plus
          ? cn(
              NEW_DOT_LOOK,
              'size-8! rounded-full! border-0! bg-transparent!',
              // Placed by `translate`, not React Flow's `transform`, so the scale keeps it there.
              '-translate-x-1/2 transform-none!',
              dot === 'in' ? '-translate-y-1/2' : 'translate-y-1/2',
            )
          : cn(
              // A square in its pill, which rounds the ends, not placed by React Flow.
              DOT_SHAPE,
              'static! size-5! transform-none! cursor-default! rounded-none! border-0!',
              // In the color of the node the choice leads to, as that node's id tag.
              color?.dot ?? 'bg-muted! text-muted-foreground!',
            ),
        connectable && plus && 'cursor-crosshair',
      )}
    >
      <DotContent dot={dot} />
    </Handle>
  );
};

const dotOfCard = (dot: DotKey, x: number | undefined, color: TagColor | undefined) => (
  <DotHandle dot={dot} x={x} color={color} />
);

/** A card on the canvas: it reports its height and offers its choices' dots to drag from. */
const DraftFlowCard = ({ id, data, selected }: NodeProps<DraftFlowNode>) => {
  const far = useStore((state) => state.transform[2] < FAR_ZOOM);
  const { onHeight, connectable, editOf } = use(CardContext);
  // Only its size changes on the canvas; the node is written in the detail.
  const edit = editOf?.(id);
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = card.current;
    if (element === null) {
      return undefined;
    }

    // `offsetHeight` is the height before the canvas's zoom, the one the layout needs. Read at
    // once too: the observer reports only with the next frame, which a hidden page may not get.
    onHeight(id, element.offsetHeight);
    const observer = new ResizeObserver(() => {
      onHeight(id, element.offsetHeight);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [id, onHeight]);

  // React Flow knows where the dots are only from its last measuring of the card, which comes with
  // a change of its size. A choice added, removed or led elsewhere changes the dots but not the
  // size, and an edge from a dot it does not know is not drawn at all; so the dots are measured
  // again whenever they change.
  const updateNodeInternals = useUpdateNodeInternals();
  const dots = JSON.stringify([
    data.node.choices.map((choice) => choice.to),
    data.targetOrder,
    data.node.size,
  ]);
  /** The dots as React Flow measured them last. */
  const measuredDots = useRef<string>(undefined);
  useLayoutEffect(() => {
    if (measuredDots.current === dots) {
      return;
    }

    measuredDots.current = dots;
    updateNodeInternals(id);
  }, [id, dots, updateNodeInternals]);

  return (
    <>
      <Handle
        type='target'
        position={Position.Top}
        className='opacity-0'
        isConnectable={connectable}
      />
      <DraftNodeCard
        ref={card}
        node={data.node}
        start={data.start}
        problems={data.problems}
        color={data.color}
        choiceColors={data.choiceColors}
        dropTarget={data.dropTarget}
        {...(data.targetOrder === undefined ? {} : { targetOrder: data.targetOrder })}
        far={far}
        selected={selected}
        maxHeight={data.maxHeight}
        {...(edit === undefined ? {} : { edit })}
        dot={dotOfCard}
      />
    </>
  );
};

/** A number of a range: one when the ways do not differ, else the shortest and the longest. */
const rangeText = ({ min, max }: Range) => {
  const number = (value: number) => value.toLocaleString('cs-CZ');
  return min === max ? number(min) : `${number(min)}–${number(max)}`;
};

/** The Czech word after a number, e.g. „1 uzel“, „3 uzly“, „5 uzlů“. */
const counted = (count: number, one: string, few: string, many: string) => {
  if (count === 1) {
    return one;
  }

  return count >= 2 && count <= 4 ? few : many;
};

/**
 * How much the numbers under the end rings resist the zoom: 0 zooms them with the canvas, 1 keeps
 * them as large on the screen at any zoom. At 0.75 they are 8 px high at the zoom of 0.3 against
 * 11 px at 1, and 13 px at 2.
 */
const LABEL_ZOOM_RESISTANCE = 0.75;

type EndFlowNode = Node<
  {
    readonly routes: RoutesToEnd | undefined;
    /** How many more characters the ways here have than the ways to all the ends on average. */
    readonly difference: number | undefined;
  },
  'final'
>;

/**
 * An end ring with how long the ways to the end are: in nodes, and in text to read against the
 * average way, so a much longer or shorter way stands out.
 */
const EndRing = ({ data: { routes, difference } }: NodeProps<EndFlowNode>) => {
  // The numbers keep most of their size while zooming: they shrink and grow only a little with the
  // canvas, so they stay legible from afar and do not loom close up.
  const scale = useStore((state) => state.transform[2] ** -LABEL_ZOOM_RESISTANCE);
  return (
    <>
      <FinalDot />
      {routes !== undefined && (
        <div
          className='absolute top-full left-1/2 mt-1.5 -translate-x-1/2 text-center text-2xs leading-tight whitespace-nowrap text-muted-foreground'
          style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
        >
          <div>
            {rangeText(routes.steps)} {counted(routes.steps.max, 'uzel', 'uzly', 'uzlů')}
          </div>
          {difference !== undefined && (
            <div
              title='O kolik znaků textu segmentů je cesta do tohoto konce delší než průměrná cesta do všech konců.'
              className={cn(
                // Longer than the average in green, shorter in red; no difference stays grey.
                Math.round(difference) > 0 && 'text-green-600 dark:text-green-400',
                Math.round(difference) < 0 && 'text-red-600 dark:text-red-400',
              )}
            >
              {differenceText(difference)} znaků
            </div>
          )}
        </div>
      )}
    </>
  );
};

/**
 * The start dot, where the story begins, as a handle: its arrows are dragged out of it onto the
 * nodes to begin at. One arrow is right; none or more are a problem the editor shows.
 */
const StartDot = () => {
  const { connectable, onStartNew } = use(CardContext);
  return (
    // As large as the layout made room for; the handle fills it and is the dot itself.
    <div className='relative' style={{ width: INITIAL_SIZE, height: INITIAL_SIZE }}>
      <Handle
        type='source'
        id={START_HANDLE}
        position={Position.Bottom}
        isConnectable={connectable}
        title={
          connectable
            ? 'Začátek příběhu: táhněte na uzel, kde začíná, nebo do prázdna pro nový uzel'
            : 'Začátek příběhu'
        }
        // Pointing nowhere yet, a click makes the node the story begins at.
        {...(onStartNew === undefined ? {} : { onClick: onStartNew })}
        className={cn(
          'inset-0! size-full! min-h-0! min-w-0! transform-none! rounded-full! border-0! bg-foreground!',
          // A larger target than the dot itself.
          "before:absolute before:-inset-2 before:rounded-full before:content-['']",
          connectable && 'cursor-crosshair hover:ring-4 hover:ring-foreground/30',
        )}
      />
    </div>
  );
};

const nodeTypes = { draft: DraftFlowCard, initial: StartDot, final: EndRing } as const;

/** Whether the edge being dragged points at a card it can be dropped on. */
const OverCardContext = createContext(false);

/**
 * The hint of a new node at the end of an edge being dragged, in screen pixels: its square box,
 * its gap from the pointer, and where its text ends, so the text and the plus after it, about 74
 * pixels together, sit in the middle.
 */
const NEW_NODE_HINT = { width: 96, height: 96, gap: 6, textEnd: 21 } as const;

/** The pill under the pointer that says how to call the drag off, in screen pixels. */
const CANCEL_HINT = { width: 172, height: 20 } as const;

/** The edge being dragged and its hint: the light blue a card it can be dropped on is outlined in. */
const DRAG_COLOR = 'var(--color-sky-500)';

/**
 * The edge being dragged out of a dot. Out of a plus and over no card it ends at a dashed box: let
 * go there, it draws out a new node, below for a choice of this node, above for one into it. Under
 * the pointer it says how to call the drag off. Its hints keep their size on the screen at any
 * zoom.
 */
const DragLine = ({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  fromHandle,
}: ConnectionLineComponentProps) => {
  const overCard = use(OverCardContext);
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  const dot = dotOf(fromHandle.id);
  // From the start dot too: dropped off a card, the story begins at a new node.
  const hint = (dot === 'new' || dot === 'in' || fromHandle.id === START_HANDLE) && !overCard;
  const { width, height, gap } = NEW_NODE_HINT;
  // The new node of a choice comes below the pointer, the node of a choice into this one above.
  const top = dot === 'in' ? -height - gap : gap;
  // How to call the drag off, under the pointer, or under the box when the box is there.
  const cancelAt = hint && dot === 'new' ? top + height + gap : gap;
  return (
    <g>
      <path
        d={path}
        fill='none'
        className='react-flow__connection-path'
        style={{ stroke: DRAG_COLOR }}
      />
      <g
        className='pointer-events-none'
        style={{ transform: `translate(${toX}px, ${toY}px) scale(var(--zoom-out, 1))` }}
      >
        {/* On a pill of its own, so it reads over the canvas and over a card alike. */}
        <rect
          x={-CANCEL_HINT.width / 2}
          y={cancelAt}
          width={CANCEL_HINT.width}
          height={CANCEL_HINT.height}
          rx={CANCEL_HINT.height / 2}
          fill='var(--popover)'
          stroke='var(--border)'
        />
        <text
          x={0}
          y={cancelAt + CANCEL_HINT.height / 2}
          textAnchor='middle'
          dominantBaseline='central'
          fill='var(--muted-foreground)'
          className='text-2xs'
        >
          Esc nebo pravé tlačítko zruší
        </text>
      </g>
      {hint && (
        <g
          className='pointer-events-none'
          style={{ transform: `translate(${toX}px, ${toY}px) scale(var(--zoom-out, 1))` }}
        >
          <rect
            x={-width / 2}
            y={top}
            width={width}
            height={height}
            rx={8}
            fill='var(--card)'
            stroke={DRAG_COLOR}
            strokeDasharray='4 3'
          />
          {/* The text and the plus after it, together in the middle of the box. */}
          <text
            x={NEW_NODE_HINT.textEnd}
            y={top + height / 2}
            textAnchor='end'
            dominantBaseline='central'
            fill={DRAG_COLOR}
            className='text-xs'
          >
            Nový uzel
          </text>
          <IconPlus
            x={NEW_NODE_HINT.textEnd + 4}
            y={top + height / 2 - 6}
            width={12}
            height={12}
            color={DRAG_COLOR}
            stroke={2.25}
          />
        </g>
      )}
    </g>
  );
};

const edgeTypes = { route: RouteEdgeView } as const;

const edgeId = (source: string, index: number) => `${source}-${index}`;

/** The cards and edges selected, by flow id. */
interface Selection {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
}

const NO_SELECTION: Selection = { nodes: [], edges: [] };

/** The list with `item` added, or taken away when it is there. */
const toggled = (items: readonly string[], item: string): readonly string[] =>
  items.includes(item)
    ? items.filter((other) => {
        return other !== item;
      })
    : [...items, item];

/** What a selectable edge stands for: a choice by its card and index, or the start's arrow. */
type EdgePick =
  | { readonly kind: 'choice'; readonly source: string; readonly index: number }
  | { readonly kind: 'start'; readonly target: string };

/** What the edge `id` stands for; none for the ends' edges, which cannot be selected. */
/**
 * What of the selection still points at the same thing after the draft changed from `before` to
 * `after`, as by an undo or a node removed in the detail: the selection is by position, and a
 * position may hold another node now. A node just drawn out, at a position empty before, stays.
 */
const keptSelection = (selection: Selection, before: Draft, after: Draft): Selection => {
  const sameNode = (key: string) => {
    const was = before.nodes[indexOf(key)];
    const is = after.nodes[indexOf(key)];
    return is !== undefined && (was === undefined || was.id === is.id);
  };

  const nodes = selection.nodes.filter(sameNode);
  const edges = selection.edges.filter((edge) => {
    const pick = pickOfEdge(edge);
    if (pick === undefined) {
      return false;
    }

    if (pick.kind === 'start') {
      const node = after.nodes[indexOf(pick.target)];
      return (
        sameNode(pick.target) &&
        node !== undefined &&
        startsOf(after).some((start) => {
          return start.id === node.id;
        })
      );
    }

    const was = before.nodes[indexOf(pick.source)]?.choices[pick.index];
    const is = after.nodes[indexOf(pick.source)]?.choices[pick.index];
    return sameNode(pick.source) && is !== undefined && was?.to === is.to;
  });
  if (nodes.length === selection.nodes.length && edges.length === selection.edges.length) {
    return selection;
  }

  return { nodes, edges };
};

const pickOfEdge = (id: string): EdgePick | undefined => {
  const choice = /^(n\d+)-(\d+)$/.exec(id);
  if (choice !== null) {
    return { kind: 'choice', source: choice[1]!, index: Number(choice[2]) };
  }

  const start = /^(n\d+)$/.exec(id.slice(initialEdgeId('').length));
  if (id.startsWith(initialEdgeId('')) && start !== null) {
    return { kind: 'start', target: start[1]! };
  }

  return undefined;
};

/**
 * The line around the selected card, `outline-offset` of 3 and a width of 1 screen pixel off its
 * ring of 1: the arrows into the card clear a gap in it, as large on the screen at any zoom.
 */
const SELECTED_CARD_LINE = {
  distance: 3.5,
  gap: 9,
  width: 3,
  scale: 'var(--zoom-out, 1)',
} as const;

/** Above the nodes, the selected one too, so an arrow is drawn over the line around its card. */
const INTO_SELECTED_Z_INDEX = 1001;

/**
 * The card a raised edge leaves, above that edge, so the edge goes under its dots as any edge
 * does and no line shows through them.
 */
const RAISED_SOURCE_Z_INDEX = 1002;

/** The labels of the raised edges, above the edges themselves, so no line strikes them through. */
const RAISED_LABEL_Z_INDEX = 1003;

/**
 * The selected edge: in the text's color like the line around a selected card, white on the dark
 * canvas; twice as thick, over the other edges.
 */
const SELECTED_COLOR = 'var(--foreground)';
const SELECTED_STROKE = 'calc(2 * var(--xy-edge-stroke-width, 1))';
const SELECTED_EDGE_Z_INDEX = 1000;
const portId = (source: string, key: DotKey) => `port:${source}:${key}`;
/** Every edge enters its card at a point of its own, so the arrows never end on each other. */
const entryId = (edge: string) => `entry:${edge}`;

/** The text an edge shows: the button's, or „Další“ for the plain arrow. */
const edgeText = (label: string) => (label === '' ? NEXT_LABEL : label);

/** What the layout depends on: the nodes, their heights, and where and with what text they lead. */
const structureOf = (draft: Draft, heights: ReadonlyMap<string, number>) =>
  JSON.stringify([
    draft.starts,
    draft.nodes.map((node) => [
      node.id,
      widthOf(node),
      heights.get(node.id),
      node.choices.map((choice) => [choice.to, edgeText(choice.label)]),
    ]),
  ]);

/** The flow id of the node at `index`: by position, so a node keeps its card while renamed. */
const keyOf = (index: number) => `n${index}`;

/** The index of the node with the flow id `key`. */
const indexOf = (key: string) => Number(key.slice(1));

/**
 * Where a choice to no node of the draft leads in the keyed draft: nowhere, though it keeps its
 * place among the choices, so its edge id and dot stay those of its index.
 */
const NOWHERE = '';

/** The draft with the flow ids for node ids; a choice to no node leads `NOWHERE`. */
const keyedDraft = (draft: Draft): Draft => {
  const keys = new Map(draft.nodes.map((node, index) => [node.id, keyOf(index)]));
  return {
    ...draft,
    starts: startsOf(draft).map((node) => keys.get(node.id)!),
    nodes: draft.nodes.map((node, index) => {
      return {
        ...node,
        id: keyOf(index),
        choices: node.choices.map((choice) => {
          return { ...choice, to: keys.get(choice.to) ?? NOWHERE };
        }),
      };
    }),
  };
};

/** Whether an element takes text, so the canvas leaves clicks and keys in it alone. */
const isWritable = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    'input:not([readonly]), textarea:not([readonly]), [contenteditable]:not([contenteditable="false"])',
  ) !== null;

/** Whether an event is in the room around a card, which only shows its dots sooner. */
const onHalo = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-card-halo]') !== null;

/** Room between the points where the edges enter a card; less when many lead in. */
const ENTRY_GAP = 16;

/**
 * The ids of the edges into each node: the start dot's first, then the choices' in the order of
 * the nodes and their choices.
 */
const incomingEdges = (draft: Draft) => {
  const into = new Map<string, string[]>(
    startsOf(draft).map((node) => [node.id, [initialEdgeId(node.id)]]),
  );
  for (const node of draft.nodes) {
    for (const [index, choice] of node.choices.entries()) {
      if (choice.to !== NOWHERE) {
        into.set(choice.to, [...(into.get(choice.to) ?? []), edgeId(node.id, index)]);
      }
    }
  }

  return into;
};

/** Where the edges into a card enter its top, from the left: side by side around its middle. */
const entryXs = (count: number, width: number): readonly number[] => {
  const gap = Math.min(ENTRY_GAP, (width - 2 * ENTRY_GAP) / Math.max(1, count - 1));
  return Array.from({ length: count }, (_, index) => {
    return width / 2 + (index - (count - 1) / 2) * gap;
  });
};

/** The gaps of the layout that grow with the spacing chosen, as `LAYOUT_OPTIONS` has them. */
const SPACED_GAPS = {
  'elk.spacing.nodeNode': 48,
  'elk.layered.spacing.nodeNodeBetweenLayers': 64,
  'elk.layered.spacing.edgeNodeBetweenLayers': 24,
} as const;

/** What a layout of the draft is made with besides the draft. */
interface LayoutRequest {
  readonly heights: ReadonlyMap<string, number>;
  /** How many times the gaps grow. */
  readonly spacing: number;
}

/**
 * Top to bottom, with the edges leaving at the choices' dots on the bottom edge and entering the
 * next card's top edge, each at a point of its own; `into` gives their order from the left. A
 * node is laid out as early as the nodes leading to it allow.
 */
const layoutPass = (
  draft: Draft,
  { heights, spacing }: LayoutRequest,
  into: ReadonlyMap<string, readonly string[]>,
  out: ReadonlyMap<string, readonly string[]>,
) =>
  layoutBoxes({
    direction: 'DOWN',
    options: {
      'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE',
      ...Object.fromEntries(
        Object.entries(SPACED_GAPS).map(([option, gap]) => [option, String(gap * spacing)]),
      ),
    },
    nodes: draft.nodes.map((node) => {
      const height = heights.get(node.id) ?? 0;
      const entries = into.get(node.id) ?? [];
      const width = widthOf(node);
      const places = dotPlaces(node.choices, width, out.get(node.id));
      const xs = entryXs(entries.length, width);
      return {
        id: node.id,
        width,
        height,
        ports: [
          ...entries.map((edge, index) => {
            return { id: entryId(edge), x: xs[index]!, y: 0, side: 'NORTH' as const };
          }),
          // The edge to the end ring leaves an end node in the middle of its bottom edge.
          ...[...node.choices.keys(), 'new' as const].map((key) => {
            return {
              id: portId(node.id, key),
              x: key === 'new' ? places.end : places.choices[key]!,
              y: height,
              side: 'SOUTH' as const,
            };
          }),
        ],
      };
    }),
    edges: draft.nodes.flatMap((node) =>
      node.choices.flatMap((choice, index) => {
        if (choice.to === NOWHERE) {
          return [];
        }

        const id = edgeId(node.id, index);
        return [
          {
            id,
            source: node.id,
            target: choice.to,
            sourcePort: portId(node.id, index),
            targetPort: entryId(id),
            label: edgeText(choice.label),
            // What a choice becomes, a button or a QR code, is decided later: no icon yet.
            labelIcon: false,
          },
        ];
      }),
    ),
    // A loose node hangs with no edge in: the start dot leads only to the starts.
    initial: startsOf(draft).map((node) => node.id),
    final: endsOf(draft).map((node) => node.id),
    initialPorts: new Map(
      startsOf(draft).map((node) => [node.id, entryId(initialEdgeId(node.id))]),
    ),
    finalPorts: new Map(endsOf(draft).map((node) => [node.id, portId(node.id, 'new')])),
    // Every end has its own ring: a story can end in several places, and they need not meet.
    finalRings: 'each',
  });

/**
 * Laid out twice: the second time the edges enter each card in the order their routes came in
 * the first time, from the left, and leave it in the order their nodes lay the first time, from
 * the left, so they are short and do not cross right above or below the card. The order of the
 * choices is the story's, not the drawing's: the dots go where the edges cross the least. The
 * order of the dots comes back with the layout, by flow id, for the cards to draw them there.
 */
const layoutDraft = async (draft: Draft, request: LayoutRequest) => {
  const into = incomingEdges(draft);
  const first = await layoutPass(draft, request, into, new Map());
  // Where a route comes from sideways: the last route ends straight down into the card, so the
  // point before its last bend; its start when it has no bends.
  const comesFrom = (edge: string) => {
    const points = first.edges.get(edge)?.points ?? [];
    return points.at(-3)?.x ?? points[0]?.x ?? 0;
  };

  const sorted = new Map(
    [...into].map(([target, edges]) => {
      return [
        target,
        edges.toSorted((left, right) => {
          return comesFrom(left) - comesFrom(right);
        }),
      ] as const;
    }),
  );
  // Where a node lies across: the middle of its card.
  const across = (id: string) => {
    const node = draft.nodes.find((candidate) => {
      return candidate.id === id;
    });
    return (first.nodes.get(id)?.x ?? 0) + (node === undefined ? 0 : widthOf(node) / 2);
  };

  const out = new Map(
    draft.nodes.map((node) => {
      // A choice to no node has no place to lie in: its dot comes last.
      const targets = [
        ...new Set(
          node.choices.flatMap((choice) => {
            return choice.to === NOWHERE ? [] : [choice.to];
          }),
        ),
      ];
      return [node.id, targets.toSorted((left, right) => across(left) - across(right))] as const;
    }),
  );
  return { layout: await layoutPass(draft, request, sorted, out), out };
};

export interface DraftCanvasProps {
  readonly draft: Draft;
  /**
   * Without it the draft is only shown. `field` names what was typed into, so that the keystrokes
   * into one field can make one step of the history.
   */
  readonly onChange?: (draft: Draft, field?: string) => void;
  /** Opens a node in the detail. */
  readonly onOpen?: (id: string) => void;
  /** How many times the gaps between the cards grow; 1 by default. */
  readonly spacing?: number;
  /** The arrows as smooth curves along their routes, not with right angles. */
  readonly smoothEdges?: boolean;
  /** Keeps the zoom and the position in this browser, and starts from them. */
  readonly rememberView?: boolean;
  readonly ref?: Ref<DraftCanvasHandle>;
  readonly className?: string;
}

/** What the page around can ask of the canvas. */
export interface DraftCanvasHandle {
  /** Selects the node `id` and brings it to the middle, close enough to read. */
  readonly reveal: (id: string) => void;
}

const Canvas = ({
  draft,
  onChange,
  onOpen,
  spacing = 1,
  smoothEdges = false,
  rememberView = false,
  ref,
  className,
}: DraftCanvasProps) => {
  const { resolved } = useTheme();
  const wrapper = useRef<HTMLDivElement>(null);
  // React Flow skips every wheel over a `nowheel` field, a pinch too; this hands the pinch to the
  // pane, which zooms around the fingers, while the wheel alone still scrolls the field's text.
  useEffect(() => {
    const element = wrapper.current;
    const onWheel = (event: WheelEvent) => {
      const pane = element?.querySelector('.react-flow__pane') ?? null;
      if (
        !event.ctrlKey ||
        pane === null ||
        !(event.target instanceof Element) ||
        event.target.closest('.nowheel') === null
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pane.dispatchEvent(new WheelEvent('wheel', event));
    };

    element?.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      element?.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, []);
  const flow = useReactFlow();
  const store = useStoreApi();
  // The lines keep their width on the screen at any zoom: `--line` is one screen pixel in the
  // canvas's units, for the cards' outlines, and the edges are as wide. `--zoom-out` is one over
  // the zoom, for what should shrink less than the canvas. The arrowheads follow the
  // edges' width. Set on the element, so zooming does not render the canvas again.
  useEffect(() => {
    const element = wrapper.current;
    if (element === null) {
      return undefined;
    }

    const apply = (zoom: number) => {
      element.style.setProperty('--line', `${1 / zoom}px`);
      element.style.setProperty('--zoom-out', `${1 / zoom}`);
      element.style.setProperty('--xy-edge-stroke-width', `${1 / zoom}`);
      element.style.setProperty('--xy-connectionline-stroke-width', `${1 / zoom}`);
    };

    apply(store.getState().transform[2]);
    return store.subscribe((state) => {
      apply(state.transform[2]);
    });
  }, [store]);
  const canvasHeight = useStore((state) => state.height);
  const maxHeight = Math.max(200, canvasHeight - 2 * VIEWPORT_MARGIN);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [laidOut, setLaidOut] = useState<{
    readonly key: string;
    readonly layout: BoxLayout;
    /** The nodes each card's choices lead to, in the order of its dots, by flow id. */
    readonly out: ReadonlyMap<string, readonly string[]>;
  }>();
  /**
   * The cards and edges selected, by flow id; a click selects one, Shift adds or takes away. The
   * nodes are not changed by React Flow, so it is kept here.
   */
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  /** The draft the selection was last checked against; see `keptSelection`. */
  const [selectedIn, setSelectedIn] = useState(draft);
  if (selectedIn !== draft) {
    setSelectedIn(draft);
    const kept = keptSelection(selection, selectedIn, draft);
    if (kept !== selection) {
      setSelection(kept);
    }
  }

  /** The card selected when it is the only thing selected: the one Enter opens, the view follows. */
  const selected =
    selection.nodes.length === 1 && selection.edges.length === 0 ? selection.nodes[0] : undefined;
  const selectOne = (key: string | undefined) => {
    setSelection(key === undefined ? NO_SELECTION : { nodes: [key], edges: [] });
  };

  /** The card being brought to the middle, till when, and how close. */
  const centering = useRef<{ readonly key: string; readonly until: number; readonly zoom: number }>(
    undefined,
  );
  /** A card to bring to the middle once it is laid out, e.g. one just drawn out. */
  const pending = useRef<string>(undefined);

  const keyed = useMemo(() => keyedDraft(draft), [draft]);
  /** The cards' widths, by flow id. */
  const widths = useMemo(
    () => new Map(keyed.nodes.map((node) => [node.id, widthOf(node)])),
    [keyed],
  );
  /** How long the ways to each end are; measured again only when the draft changes. */
  const routes = useMemo(
    () => new Map(endsOf(keyed).map((node) => [node.id, routesTo(keyed, node.id)])),
    [keyed],
  );
  const meanCharacters = useMemo(
    () =>
      meanCharactersOf(
        [...routes.values()].filter((route) => {
          return route !== undefined;
        }),
      ),
    [routes],
  );
  /** How much longer the ways to each end are than the average way, in characters. */
  const differences = useMemo(
    () =>
      new Map(
        [...routes].map(([key, route]) => {
          if (route === undefined || meanCharacters === undefined) {
            return [key, undefined] as const;
          }

          return [key, route.meanCharacters - meanCharacters] as const;
        }),
      ),
    [routes, meanCharacters],
  );
  /** Where a new edge being dragged out points now, on the canvas. */
  const dragging = useConnection((connection) =>
    connection.inProgress ? connection.to : undefined,
  );

  const onHeight = useCallback((key: string, height: number) => {
    setHeights((current) => {
      if (current.get(key) === height) {
        return current;
      }

      return new Map([...current, [key, height]]);
    });
  }, []);

  /**
   * What a card on the canvas can change: the order of its choices and its size. Its text is
   * written in the detail.
   */
  const editOf = (key: string): CardEdit => {
    const id = draft.nodes[indexOf(key)]?.id ?? '';
    return {
      onResize: (size) => {
        onChange?.(setSize(draft, id, size));
      },
    };
  };

  const cards = {
    onHeight,
    connectable: onChange !== undefined,
    editOf: onChange === undefined ? undefined : editOf,
    onAdd:
      onChange === undefined
        ? undefined
        : (key: string) => {
            const node = draft.nodes[indexOf(key)];
            if (node !== undefined) {
              link(node.id, 'new', undefined);
            }
          },
    onAddInto:
      onChange === undefined
        ? undefined
        : (key: string) => {
            const node = draft.nodes[indexOf(key)];
            if (node !== undefined) {
              linkIn(node.id, undefined);
            }
          },
    onStartNew: onChange === undefined || startsOf(keyed).length > 0 ? undefined : () => startNew(),
  };

  const measured = keyed.nodes.every((node) => {
    return heights.has(node.id);
  });
  const structure = useMemo(() => structureOf(keyed, heights), [keyed, heights]);
  /** What the layout is made of; it waits for the structure only, not for the texts. */
  const latest = useRef({ keyed, heights });

  useEffect(() => {
    latest.current = { keyed, heights };
  }, [keyed, heights]);

  useEffect(() => {
    if (!measured) {
      return undefined;
    }

    // Flipped by the cleanup so a layout finishing after the draft changed is not applied.
    let current = true;
    void layoutDraft(latest.current.keyed, { heights: latest.current.heights, spacing }).then(
      ({ layout, out }) => {
        if (current) {
          setLaidOut({ key: structure, layout, out });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [structure, measured, spacing]);

  /** The card at a point of the canvas, if any: where a dragged edge points or is dropped. */
  const keyAt = useCallback(
    (point: XYPosition) =>
      [...(laidOut?.layout.nodes ?? [])].find(([key, position]) => {
        const height = heights.get(key);
        return (
          height !== undefined &&
          point.x >= position.x &&
          point.x <= position.x + (widths.get(key) ?? CARD_WIDTH) &&
          point.y >= position.y &&
          point.y <= position.y + height
        );
      })?.[0],
    [heights, widths, laidOut],
  );
  /** The card a new edge is dragged out of; it is no place to drop it. */
  const draggedFrom = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : undefined,
  );
  const pointed = dragging === undefined ? undefined : keyAt(dragging);
  const dropTarget = pointed === draggedFrom ? undefined : pointed;
  /**
   * The card pointed at last in the drag going on, where the edge is dropped; the card dragged out
   * of too, so a drop there is told from a drop on the empty canvas.
   */
  const lastTarget = useRef<string>(undefined);

  useEffect(() => {
    if (dragging !== undefined) {
      lastTarget.current = pointed;
    }
  }, [dragging, pointed]);

  const center = useCallback(
    (key: string, zoom?: number) => {
      const position = laidOut?.layout.nodes.get(key);
      const height = heights.get(key);
      if (position === undefined || height === undefined) {
        return;
      }

      centering.current = { key, until: Date.now() + MOVE_DURATION, zoom: zoom ?? flow.getZoom() };
      void flow.setCenter(
        position.x + (widths.get(key) ?? CARD_WIDTH) / 2,
        position.y + height / 2,
        {
          zoom: zoom ?? flow.getZoom(),
          duration: MOVE_DURATION,
        },
      );
    },
    [flow, heights, widths, laidOut],
  );

  /** The layout shown before the last one, to see how far the selected card moved. */
  const previous = useRef<BoxLayout>(undefined);

  // A card that grows, as its text is written in the detail or it is resized, lays the graph anew, so
  // nothing hides under it. The view follows the selected card so it stays put on the screen, or,
  // still on its way to the middle, it is brought there anew.
  useLayoutEffect(() => {
    const before = previous.current;
    const after = laidOut?.layout;
    previous.current = after;
    const from = selected === undefined ? undefined : before?.nodes.get(selected);
    const to = selected === undefined ? undefined : after?.nodes.get(selected);
    if (selected === undefined || from === undefined || to === undefined || after === before) {
      return;
    }

    const moving = centering.current;
    if (moving !== undefined && moving.key === selected && Date.now() < moving.until) {
      center(selected, moving.zoom);
      return;
    }

    if (from.x === to.x && from.y === to.y) {
      return;
    }

    const { x, y, zoom } = flow.getViewport();
    void flow.setViewport({ x: x - (to.x - from.x) * zoom, y: y - (to.y - from.y) * zoom, zoom });
  }, [laidOut, selected, center, flow]);

  // The first layout shows the view kept from the last time, or fits the whole draft in; later
  // ones keep the view where the author is.
  const shown = laidOut !== undefined;
  useEffect(() => {
    if (!shown) {
      return;
    }

    const kept = rememberView ? readViewport() : undefined;
    if (kept !== undefined) {
      void flow.setViewport(kept);
      return;
    }

    // No closer than the cards' own size: a draft of one node would fill the screen.
    void flow.fitView({ maxZoom: 1 });
  }, [shown, flow, rememberView]);

  useEffect(() => {
    const key = pending.current;
    if (key !== undefined && laidOut?.layout.nodes.has(key) === true) {
      pending.current = undefined;
      center(key, Math.max(flow.getZoom(), FAR_ZOOM));
    }
  }, [laidOut, center, flow]);

  useImperativeHandle(
    ref,
    () => ({
      reveal: (id) => {
        const index = draft.nodes.findIndex((node) => {
          return node.id === id;
        });
        if (index < 0) {
          return;
        }

        const key = keyOf(index);
        selectOne(key);
        center(key, Math.max(flow.getZoom(), FAR_ZOOM));
      },
    }),
    [draft, center, flow],
  );

  // ReactFlow's `nodes` and `edges` props take mutable arrays; the memos are never changed here.
  const nodes = useMemo<(DraftFlowNode | InitialFlowNode | EndFlowNode)[]>(() => {
    const position = (key: string) => laidOut?.layout.nodes.get(key) ?? { x: 0, y: 0 };
    const starts = new Set(startsOf(keyed).map((node) => node.id));
    const problems = draftProblems(keyed);
    const problemsOf = new Map(
      problems.flatMap(({ id, problems: kinds }) => {
        return id === undefined ? [] : [[id, kinds] as const];
      }),
    );
    const indexById = new Map(draft.nodes.map((node, index) => [node.id, index]));
    /** The edges are raised when selected or leading into a selected card; see `marked`. */
    const raisesEdge = (source: string, index: number, target: string) =>
      selection.edges.includes(edgeId(source, index)) || selection.nodes.includes(target);
    return [
      ...draft.nodes.map((node, index): DraftFlowNode => {
        const key = keyOf(index);
        const height = heights.get(key);
        const raised = keyed.nodes[index]?.choices.some((choice, at) => {
          return raisesEdge(key, at, choice.to);
        });
        return {
          id: key,
          type: 'draft',
          position: position(key),
          ...(raised === true ? { zIndex: RAISED_SOURCE_Z_INDEX } : {}),
          // The size measured here: React Flow keeps a node it knows the size of visible while
          // the node changes, so a field in it keeps the focus; without it, it hides the node
          // till it measures the node again.
          ...(height === undefined ? {} : { measured: { width: widthOf(node), height } }),
          selected: selection.nodes.includes(key),
          data: {
            node,
            start: starts.has(key),
            problems: problemsOf.get(key) ?? [],
            maxHeight,
            dropTarget: key === dropTarget,
            color: tagColor(index),
            targetOrder: laidOut?.out.get(key)?.map((target) => {
              return draft.nodes[indexOf(target)]?.id ?? target;
            }),
            choiceColors: node.choices.map((choice) => {
              const target = indexById.get(choice.to);
              return target === undefined ? undefined : tagColor(target);
            }),
          },
        };
      }),
      {
        id: INITIAL_ID,
        type: 'initial',
        position: position(INITIAL_ID),
        measured: { width: INITIAL_SIZE, height: INITIAL_SIZE },
        // Over its raised edges too.
        ...(startsOf(keyed).some((node) => {
          return (
            selection.nodes.includes(node.id) || selection.edges.includes(initialEdgeId(node.id))
          );
        })
          ? { zIndex: RAISED_SOURCE_Z_INDEX }
          : {}),
        data: {},
        selectable: false,
      },
      ...endsOf(keyed).map((node): EndFlowNode => ({
        id: finalRingId(node.id),
        type: 'final',
        position: position(finalRingId(node.id)),
        measured: { width: FINAL_SIZE, height: FINAL_SIZE },
        data: {
          routes: routes.get(node.id),
          difference: differences.get(node.id),
        },
        selectable: false,
      })),
    ];
  }, [
    draft,
    keyed,
    routes,
    differences,
    laidOut,
    selection.nodes,
    selection.edges,
    maxHeight,
    heights,
    dropTarget,
  ]);

  const edges = useMemo<RouteEdge[]>(() => {
    const route = (id: string) => laidOut?.layout.edges.get(id);
    const plain = (id: string, source: string, target: string): RouteEdge => ({
      id,
      type: 'route',
      source,
      target,
      markerEnd: ARROW_HEAD,
      data: { points: route(id)?.points ?? [], dimmed: false, smooth: smoothEdges },
    });
    /** The selected edges in the text's color, and every edge into a selected card over its line. */
    const marked = (edge: RouteEdge): RouteEdge => {
      const data = edge.data ?? { points: [], dimmed: false };
      const into = selection.nodes.includes(edge.target);
      if (selection.edges.includes(edge.id)) {
        return {
          ...edge,
          markerEnd: { ...ARROW_HEAD, color: SELECTED_COLOR },
          style: { stroke: SELECTED_COLOR, strokeWidth: SELECTED_STROKE },
          zIndex: SELECTED_EDGE_Z_INDEX,
          data: { ...data, color: SELECTED_COLOR, labelZIndex: RAISED_LABEL_Z_INDEX },
        };
      }

      if (into) {
        return {
          ...edge,
          zIndex: INTO_SELECTED_Z_INDEX,
          data: {
            ...data,
            focusTarget: true,
            focusLine: SELECTED_CARD_LINE,
            labelZIndex: RAISED_LABEL_Z_INDEX,
          },
        };
      }

      return edge;
    };

    return [
      ...startsOf(keyed).map((node) => plain(initialEdgeId(node.id), INITIAL_ID, node.id)),
      ...keyed.nodes.flatMap((node) =>
        node.choices.flatMap((choice, index): RouteEdge[] => {
          // A choice to no node has its dot, but no edge.
          if (choice.to === NOWHERE) {
            return [];
          }

          const id = edgeId(node.id, index);
          const label = route(id)?.label;
          const edge: RouteEdge = {
            ...plain(id, node.id, choice.to),
            sourceHandle: dotHandle(index),
            data: {
              points: route(id)?.points ?? [],
              text: edgeText(choice.label),
              ...(label === undefined ? {} : { label }),
              // The plain arrow is no decision, so its label stays in the background.
              ...(choice.label === '' ? { color: 'var(--muted-foreground)' } : {}),
              dimmed: false,
              smooth: smoothEdges,
            },
          };
          return [edge];
        }),
      ),
      ...endsOf(keyed).map((node) => ({
        ...plain(finalEdgeId(node.id), node.id, finalRingId(node.id)),
        sourceHandle: dotHandle('new'),
      })),
    ].map(marked);
  }, [keyed, laidOut, selection, smoothEdges]);

  /** What waits for a yes to be removed: the cards and edges selected when it was asked. */
  const [removing, setRemoving] = useState<Selection>();

  /** Set when the new edge being dragged is called off, so its end changes nothing. */
  const aborted = useRef(false);
  /** Calls off the new edge being dragged: it ends as if let go, and its end is ignored. */
  const abortConnection = useCallback(() => {
    if (!store.getState().connection.inProgress) {
      return false;
    }

    aborted.current = true;
    // React Flow ends a drag on the document's `mouseup`.
    wrapper.current?.ownerDocument.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return true;
  }, [store]);

  // A right click calls off the new edge being dragged too, and shows no menu then.
  useEffect(() => {
    let menuless = false;
    const onDown = (event: MouseEvent) => {
      if (event.button === 2 && abortConnection()) {
        event.preventDefault();
        menuless = true;
      }
    };

    const onMenu = (event: MouseEvent) => {
      if (menuless) {
        event.preventDefault();
        menuless = false;
      }
    };

    window.addEventListener('mousedown', onDown, { capture: true });
    window.addEventListener('contextmenu', onMenu, { capture: true });
    return () => {
      window.removeEventListener('mousedown', onDown, { capture: true });
      window.removeEventListener('contextmenu', onMenu, { capture: true });
    };
  }, [abortConnection]);

  // Keys on the canvas. Esc calls off a new edge being dragged. On the selected card, Enter or
  // Space opens it in the detail, ⌘⌫ or Delete asks to remove it; on the selected edge, ⌘⌫ or
  // Delete removes its choice. Only on the canvas or nowhere in particular: in a text the keys
  // write, on a button Enter and Space press it, and in a dialog they are the dialog's.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && abortConnection()) {
        event.preventDefault();
        return;
      }

      const plainKey = !event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat;
      const open = (event.key === ' ' || event.key === 'Enter') && plainKey;
      const remove =
        (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) ||
        (event.key === 'Delete' && !event.metaKey && !event.ctrlKey && !event.altKey);
      if ((!open && !remove) || event.defaultPrevented) {
        return;
      }

      const target = event.target;
      const onCanvas =
        target === document.body ||
        (target instanceof Node && wrapper.current?.contains(target) === true);
      if (
        !onCanvas ||
        isWritable(target) ||
        (target instanceof Element && target.closest('button, a, [role="button"]') !== null)
      ) {
        return;
      }

      if (
        remove &&
        onChange !== undefined &&
        (selection.nodes.length > 0 || selection.edges.length > 0)
      ) {
        event.preventDefault();
        setRemoving(selection);
        return;
      }

      const node = selected === undefined ? undefined : draft.nodes[indexOf(selected)];
      if (node === undefined || selected === undefined) {
        return;
      }

      if (open && onOpen !== undefined) {
        event.preventDefault();
        onOpen(node.id);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [draft, selected, selection, onOpen, onChange, abortConnection]);

  /** The question and the change of a removal waiting for a yes. */
  const removal = (() => {
    if (removing === undefined) {
      return undefined;
    }

    const removedNodes = removing.nodes.flatMap((key) => {
      const node = draft.nodes[indexOf(key)];
      return node === undefined ? [] : [node];
    });
    const picks = removing.edges.flatMap((edge) => {
      const pick = pickOfEdge(edge);
      return pick === undefined ? [] : [pick];
    });
    const choices = picks.flatMap((pick) => {
      const node = pick.kind === 'choice' ? draft.nodes[indexOf(pick.source)] : undefined;
      const choice = pick.kind === 'choice' ? node?.choices[pick.index] : undefined;
      return node === undefined || choice === undefined || pick.kind !== 'choice'
        ? []
        : [{ node, choice, index: pick.index }];
    });
    const starts = picks.flatMap((pick) => {
      const node = pick.kind === 'start' ? draft.nodes[indexOf(pick.target)] : undefined;
      return node === undefined ? [] : [node];
    });
    const apply = () => {
      selectOne(undefined);
      onChange?.(
        removeAll(draft, {
          nodes: removedNodes.map((node) => node.id),
          choices: choices.map(({ node, index }) => ({ id: node.id, index })),
          starts: starts.map((node) => node.id),
        }),
      );
    };

    const [node] = removedNodes;
    const [choice] = choices;
    const [start] = starts;
    const count = removedNodes.length + choices.length + starts.length;
    if (count === 0) {
      return undefined;
    }

    if (count === 1 && node !== undefined) {
      return {
        question: `Smazat uzel ${node.id}?`,
        detail: 'Volby, které do něj vedou, se smažou taky. Vrátit to jde tlačítkem Zpět.',
        apply,
      };
    }

    if (count === 1 && start !== undefined) {
      return {
        question: `Smazat šipku začátku do uzlu ${start.id}?`,
        detail: 'Uzel zůstane. Vrátit to jde tlačítkem Zpět.',
        apply,
      };
    }

    if (count === 1 && choice !== undefined) {
      return {
        question: `Smazat volbu „${edgeText(choice.choice.label)}“ uzlu ${choice.node.id}?`,
        detail: `Vede do uzlu ${choice.choice.to}; ten zůstane. Vrátit to jde tlačítkem Zpět.`,
        apply,
      };
    }

    const arrows = choices.length + starts.length;
    const parts = [
      ...(removedNodes.length > 0
        ? [`${removedNodes.length} ${counted(removedNodes.length, 'uzel', 'uzly', 'uzlů')}`]
        : []),
      ...(arrows > 0 ? [`${arrows} ${counted(arrows, 'šipku', 'šipky', 'šipek')}`] : []),
    ];
    return {
      question: `Smazat ${parts.join(' a ')}?`,
      detail:
        removedNodes.length > 0
          ? 'Volby, které do smazaných uzlů vedou, se smažou taky. Vrátit to jde tlačítkem Zpět.'
          : 'Uzly zůstanou. Vrátit to jde tlačítkem Zpět.',
      apply,
    };
  })();
  // Nothing left of what was to be removed: no question waits, so no later one comes up by it.
  if (removing !== undefined && removal === undefined) {
    setRemoving(undefined);
  }

  /** The yes of the removal dialog, focused when it opens, so Enter removes. */
  const confirmRemoval = useRef<HTMLButtonElement>(null);

  /**
   * Leads a new choice of `source`, or of a new node without one, into `target`, and brings the
   * node the choice is on to the middle, selected.
   */
  const linkIn = (target: string, source: string | undefined) => {
    if (onChange === undefined) {
      return;
    }

    const next = linkInto(draft, target, source);

    const key = keyOf(
      next.draft.nodes.findIndex((node) => {
        return node.id === next.source;
      }),
    );
    onChange(next.draft);
    selectOne(key);
    pending.current = key;
  };

  /** A new node the start dot points at, brought to the middle, selected. */
  const startNew = () => {
    if (onChange === undefined) {
      return;
    }

    const next = startInNew(draft);
    const key = keyOf(next.draft.nodes.length - 1);
    onChange(next.draft);
    selectOne(key);
    pending.current = key;
  };

  const link = (source: string, dot: number | 'new', target: string | undefined) => {
    if (onChange === undefined) {
      return;
    }

    const next = linkChoice(draft, source, dot, target);

    const key = keyOf(
      next.draft.nodes.findIndex((node) => {
        return node.id === next.target;
      }),
    );
    onChange(next.draft);
    selectOne(key);
    pending.current = key;
  };

  /** A drag from a dot: dropped on a node it leads there, elsewhere it draws out a new node. */
  const onConnectEnd = (_event: MouseEvent | TouchEvent, connection: FinalConnectionState) => {
    if (aborted.current) {
      aborted.current = false;
      return;
    }

    const from = connection.fromNode?.id;
    // The card pointed at last while dragging; React Flow's final `to` is not always the last one.
    const over = connection.toNode?.id ?? lastTarget.current;
    const overNode = over === undefined ? undefined : draft.nodes[indexOf(over)]?.id;
    // The start's arrow points at a node dropped on; dropped elsewhere, at a new node.
    if (from === INITIAL_ID) {
      if (overNode === undefined) {
        startNew();
      } else if (onChange !== undefined) {
        onChange(addStart(draft, overNode));
      }

      return;
    }

    const source = from === undefined ? undefined : draft.nodes[indexOf(from)]?.id;
    const dot = dotOf(connection.fromHandle?.id);
    // A choice does not lead back into its own node: dropped there, nothing changes.
    if (source === undefined || dot === undefined || over === from) {
      return;
    }

    // From the top plus the choice leads the other way: from the node dropped on into this one.
    if (dot === 'in') {
      linkIn(source, overNode);
      return;
    }

    link(source, dot, overNode);
  };

  return (
    <CardContext value={cards}>
      <OverCardContext value={dropTarget !== undefined}>
        <div
          ref={wrapper}
          className={cn(
            // The edges' labels larger than the story graph's, to read the choices easily.
            'story-graph relative size-full transition-opacity duration-200 [--edge-label-scale:1.4]',
            laidOut === undefined && 'opacity-0',
            className,
          )}
        >
          {draft.nodes.length === 0 && onChange !== undefined && (
            // A draft with no node yet says how to begin; the start dot is all there is.
            <p className='pointer-events-none absolute inset-x-0 top-6 z-10 text-center text-sm text-muted-foreground'>
              Koncept je prázdný. Klikněte na tečku začátku, nebo z ní táhněte do prázdna, a vznikne
              první uzel.
            </p>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(event, node) => {
              // The room around a card only shows its dots sooner: a click there is on the pane.
              if (onHalo(event.target)) {
                if (!event.shiftKey) {
                  selectOne(undefined);
                }

                return;
              }

              if (node.type !== 'draft') {
                return;
              }

              // With Shift the card joins the selection, or leaves it, and the view stays.
              if (event.shiftKey) {
                setSelection((current) => ({ ...current, nodes: toggled(current.nodes, node.id) }));
                return;
              }

              if (node.id !== selected) {
                selectOne(node.id);
                center(node.id);
              }
            }}
            onNodeDoubleClick={(event, node) => {
              // Not on a dot or a plus, which have their own clicks, nor in the room around.
              const onDot =
                event.target instanceof Element &&
                event.target.closest('.react-flow__handle') !== null;
              if (node.type !== 'draft' || onDot || onHalo(event.target)) {
                return;
              }

              selectOne(node.id);
              // A double click opens the node in the detail; a canvas only shown brings it close.
              const opened = draft.nodes[indexOf(node.id)];
              if (onOpen !== undefined && opened !== undefined) {
                onOpen(opened.id);
                return;
              }

              center(node.id, CLOSE_ZOOM);
            }}
            onPaneClick={(event) => {
              if (!event.shiftKey) {
                selectOne(undefined);
              }
            }}
            onEdgeClick={(event, edge) => {
              // A choice's edge can be selected, and the start's, not an end's.
              if (pickOfEdge(edge.id) === undefined) {
                return;
              }

              setSelection((current) =>
                event.shiftKey
                  ? { ...current, edges: toggled(current.edges, edge.id) }
                  : { nodes: [], edges: [edge.id] },
              );
            }}
            onConnectEnd={onConnectEnd}
            connectionLineComponent={DragLine}
            // A click on a dot is no way to connect, and a move this small still a click: on the
            // plus it adds a choice.
            connectOnClick={false}
            isValidConnection={(connection) => connection.source !== connection.target}
            connectionDragThreshold={CLICK_DISTANCE}
            colorMode={resolved}
            minZoom={0.1}
            nodesDraggable={false}
            nodesConnectable={onChange !== undefined}
            zoomOnDoubleClick={false}
            // Space opens the selected node; the canvas pans by dragging anyway.
            panActivationKeyCode={null}
            // Shift selects more cards and edges by clicks, not by a box.
            selectionKeyCode={null}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            {...(rememberView
              ? {
                  onMoveEnd: (_event: unknown, viewport: Viewport) => {
                    writeViewport(viewport);
                  },
                }
              : {})}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
          <AlertDialog
            open={removal !== undefined}
            onOpenChange={(open) => {
              if (!open) {
                setRemoving(undefined);
              }
            }}
          >
            <AlertDialogContent
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                confirmRemoval.current?.focus();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>{removal?.question}</AlertDialogTitle>
                <AlertDialogDescription>{removal?.detail}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Zrušit</AlertDialogCancel>
                <AlertDialogAction
                  ref={confirmRemoval}
                  variant='destructive'
                  onClick={() => {
                    removal?.apply();
                  }}
                >
                  Smazat
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </OverCardContext>
    </CardContext>
  );
};

/**
 * The draft as a graph laid out by ELK from top to bottom. Each card is as high as its text, up to
 * the canvas's height; zoomed out, it shows only its summary. A click selects a node and brings it
 * to the middle, a double click, Enter or Space opens it in the detail; a drag from the circles in
 * a card's corners onto a node leads a choice there, and dragged elsewhere draws out a new node.
 */
export const DraftCanvas = (props: DraftCanvasProps) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);
