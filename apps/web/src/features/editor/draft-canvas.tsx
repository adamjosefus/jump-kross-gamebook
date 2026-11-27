import '@xyflow/react/dist/style.css';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useConnection,
  useNodeId,
  useStore,
  type FinalConnectionState,
  type Node,
  type NodeProps,
  type XYPosition,
} from '@xyflow/react';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ARROW_HEAD,
  FinalDot,
  InitialDot,
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
  draftNodeId,
  endsOf,
  meanCharactersOf,
  routesTo,
  startsOf,
  type Draft,
  type DraftNode,
  type Range,
  type RoutesToEnd,
} from './draft';
import {
  linkChoice,
  moveChoice,
  removeChoice,
  removeNode,
  renameNode,
  updateNode,
} from './draft-edit';
import {
  CARD_WIDTH,
  DOT_SHAPE,
  DotContent,
  dotPlaces,
  DraftNodeCard,
  NEW_DOT_LOOK,
  NEXT_LABEL,
  type CardEdit,
  type DotKey,
} from './draft-node-card';
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
    readonly maxHeight: number;
    /** A new edge dragged now would lead here. */
    readonly dropTarget: boolean;
    readonly color: TagColor;
    /** The colors of the nodes the choices lead to. */
    readonly choiceColors: readonly (TagColor | undefined)[];
  },
  'draft'
>;

/**
 * What the cards need from the canvas: where to report their heights, whether to offer drags, and
 * what a card written in can change. The cards are told apart by their flow ids.
 */
const CardContext = createContext<{
  readonly onHeight: (key: string, height: number) => void;
  readonly onOpen: ((key: string) => void) | undefined;
  readonly connectable: boolean;
  readonly editOf: ((key: string) => CardEdit) | undefined;
  /** A click on the plus of the card `key`: a choice leading to a new node. */
  readonly onAdd: ((key: string) => void) | undefined;
}>({
  onHeight: () => {},
  onOpen: undefined,
  connectable: false,
  editOf: undefined,
  onAdd: undefined,
});

/** Handle id of a choice's dot, or of „+ volba“. */
const dotHandle = (key: DotKey) => (key === 'new' ? 'choice-new' : `choice-${key}`);

/** The choice a handle stands for, the inverse of `dotHandle`. */
const dotOf = (handle: string | null | undefined): DotKey | undefined => {
  if (handle === 'choice-new') {
    return 'new';
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

/** A choice's dot as a handle to drag a new edge from, when the canvas lets the draft change. */
const DotHandle = ({
  dot,
  x,
  color,
}: {
  readonly dot: DotKey;
  readonly x: number | undefined;
  readonly color: TagColor | undefined;
}) => {
  const { connectable, onAdd } = use(CardContext);
  const key = useNodeId();
  return (
    <Handle
      type='source'
      id={dotHandle(dot)}
      position={Position.Bottom}
      isConnectable={connectable}
      style={x === undefined ? {} : { left: x }}
      {...(dot === 'new' && onAdd !== undefined && key !== null
        ? {
            title: 'Přidat volbu: klikněte, nebo táhněte na uzel',
            onClick: () => {
              onAdd(key);
            },
          }
        : {})}
      className={cn(
        // React Flow's own handle look gives way to the dot's.
        'min-h-0! min-w-0!',
        dot === 'new'
          ? cn(NEW_DOT_LOOK, 'size-6! rounded-full! border-border! bg-card!')
          : cn(
              // A square in its pill, which rounds the ends, not placed by React Flow.
              DOT_SHAPE,
              'static! size-4! transform-none! rounded-none! border-0! hover:brightness-110',
              // In the color of the node the choice leads to, as that node's id tag.
              color?.dot ?? 'bg-muted-foreground! text-card!',
            ),
        connectable && 'cursor-crosshair',
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
  const { onHeight, onOpen, connectable, editOf } = use(CardContext);
  // Written in right away; from afar the summary covers the card and takes the clicks.
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
        color={data.color}
        choiceColors={data.choiceColors}
        dropTarget={data.dropTarget}
        far={far}
        selected={selected}
        maxHeight={data.maxHeight}
        {...(onOpen === undefined
          ? {}
          : {
              onOpen: () => {
                onOpen(id);
              },
            })}
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

/** The Czech word after a number, e.g. „1 krok“, „3 kroky“, „5 kroků“. */
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
          className='absolute top-full left-1/2 mt-1.5 -translate-x-1/2 text-center text-[11px] leading-tight whitespace-nowrap text-muted-foreground'
          style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
        >
          <div>
            {rangeText(routes.steps)} {counted(routes.steps.max, 'krok', 'kroky', 'kroků')}
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

const nodeTypes = { draft: DraftFlowCard, initial: InitialDot, final: EndRing } as const;
const edgeTypes = { route: RouteEdgeView } as const;

const edgeId = (source: string, index: number) => `${source}-${index}`;
const portId = (source: string, key: DotKey) => `port:${source}:${key}`;
/** Every edge enters its card at a point of its own, so the arrows never end on each other. */
const entryId = (edge: string) => `entry:${edge}`;

/** The text an edge shows: the button's, or „Další“ for the plain arrow. */
const edgeText = (label: string) => (label === '' ? NEXT_LABEL : label);

/** What the layout depends on: the nodes, their heights, and where and with what text they lead. */
const structureOf = (draft: Draft, heights: ReadonlyMap<string, number>) =>
  JSON.stringify(
    draft.nodes.map((node) => [
      node.id,
      heights.get(node.id),
      node.choices.map((choice) => [choice.to, edgeText(choice.label)]),
    ]),
  );

/** The flow id of the node at `index`: by position, so a node keeps its card while renamed. */
const keyOf = (index: number) => `n${index}`;

/** The index of the node with the flow id `key`. */
const indexOf = (key: string) => Number(key.slice(1));

/** The draft with the flow ids for node ids; a choice to no node leads nowhere and is left out. */
const keyedDraft = (draft: Draft): Draft => {
  const keys = new Map(draft.nodes.map((node, index) => [node.id, keyOf(index)]));
  return {
    ...draft,
    nodes: draft.nodes.map((node, index) => {
      return {
        ...node,
        id: keyOf(index),
        choices: node.choices.flatMap((choice) => {
          const to = keys.get(choice.to);
          if (to === undefined) {
            return [];
          }

          return [{ ...choice, to }];
        }),
      };
    }),
  };
};

/** The node without its note when the note is empty. */
const withNote = (node: DraftNode, note: string): DraftNode => {
  if (note !== '') {
    return { ...node, note };
  }

  return { id: node.id, summary: node.summary, segments: node.segments, choices: node.choices };
};

/** Whether an element takes text, so the canvas leaves clicks and keys in it alone. */
const isWritable = (target: EventTarget | null) =>
  target instanceof Element && target.closest('input, textarea, [contenteditable]') !== null;

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
      into.set(choice.to, [...(into.get(choice.to) ?? []), edgeId(node.id, index)]);
    }
  }

  return into;
};

/** Where the edges into a card enter its top, from the left: side by side around its middle. */
const entryXs = (count: number): readonly number[] => {
  const gap = Math.min(ENTRY_GAP, (CARD_WIDTH - 2 * ENTRY_GAP) / Math.max(1, count - 1));
  return Array.from({ length: count }, (_, index) => {
    return CARD_WIDTH / 2 + (index - (count - 1) / 2) * gap;
  });
};

/**
 * Top to bottom, with the edges leaving at the choices' dots on the bottom edge and entering the
 * next card's top edge, each at a point of its own; `into` gives their order from the left. A
 * node is laid out as early as the nodes leading to it allow.
 */
const layoutPass = (
  draft: Draft,
  heights: ReadonlyMap<string, number>,
  into: ReadonlyMap<string, readonly string[]>,
) =>
  layoutBoxes({
    direction: 'DOWN',
    options: { 'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE' },
    nodes: draft.nodes.map((node) => {
      const height = heights.get(node.id) ?? 0;
      const entries = into.get(node.id) ?? [];
      const places = dotPlaces(node.choices);
      const xs = entryXs(entries.length);
      return {
        id: node.id,
        width: CARD_WIDTH,
        height,
        ports: [
          ...entries.map((edge, index) => {
            return { id: entryId(edge), x: xs[index]!, y: 0, side: 'NORTH' as const };
          }),
          // The dot of „+ volba“ too: the edge to the end ring leaves an end node there.
          ...[...node.choices.keys(), 'new' as const].map((key) => {
            return {
              id: portId(node.id, key),
              x: key === 'new' ? places.add : places.choices[key]!,
              y: height,
              side: 'SOUTH' as const,
            };
          }),
        ],
      };
    }),
    edges: draft.nodes.flatMap((node) =>
      node.choices.map((choice, index) => {
        const id = edgeId(node.id, index);
        return {
          id,
          source: node.id,
          target: choice.to,
          sourcePort: portId(node.id, index),
          targetPort: entryId(id),
          label: edgeText(choice.label),
        };
      }),
    ),
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
 * the first time, from the left, so they do not cross right above the card.
 */
const layoutDraft = async (draft: Draft, heights: ReadonlyMap<string, number>) => {
  const into = incomingEdges(draft);
  const first = await layoutPass(draft, heights, into);
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
  return layoutPass(draft, heights, sorted);
};

export interface DraftCanvasProps {
  readonly draft: Draft;
  /**
   * Without it the draft is only shown. `field` names what was typed into, so that the keystrokes
   * into one field can make one step of the history.
   */
  readonly onChange?: (draft: Draft, field?: string) => void;
  /** Opens a node in the focus mode. */
  readonly onOpen?: (id: string) => void;
  readonly className?: string;
}

const Canvas = ({ draft, onChange, onOpen, className }: DraftCanvasProps) => {
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
  const canvasHeight = useStore((state) => state.height);
  const maxHeight = Math.max(200, canvasHeight - 2 * VIEWPORT_MARGIN);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [laidOut, setLaidOut] = useState<{ readonly key: string; readonly layout: BoxLayout }>();
  /** The card clicked last; the nodes are not changed by React Flow, so it is kept here. */
  const [selected, setSelected] = useState<string>();
  /** The card being brought to the middle, till when, and how close. */
  const centering = useRef<{ readonly key: string; readonly until: number; readonly zoom: number }>(
    undefined,
  );
  /** A card to bring to the middle once it is laid out, e.g. one just drawn out. */
  const pending = useRef<string>(undefined);
  /** The ids that still follow their node's summary: of new nodes, till the summary is left. */
  const [following, setFollowing] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        draft.nodes.flatMap((node) => {
          return node.summary === '' ? [node.id] : [];
        }),
      ),
  );

  const keyed = useMemo(() => keyedDraft(draft), [draft]);
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

  /** The changes of the card `key` as changes of the draft. */
  const editOf = (key: string): CardEdit => {
    const change = (next: Draft, field?: string) => {
      onChange?.(next, field === undefined ? undefined : `${key}:${field}`);
    };

    const id = draft.nodes[indexOf(key)]?.id ?? '';
    const others = new Set(
      draft.nodes.flatMap((node) => {
        return node.id === id ? [] : [node.id];
      }),
    );
    const stopFollowing = (...ids: readonly string[]) => {
      setFollowing((current) => {
        return new Set([...current].filter((followed) => !ids.includes(followed)));
      });
    };

    return {
      onSummary: (summary) => {
        const next = updateNode(draft, id, (node) => ({ ...node, summary }));
        if (!following.has(id)) {
          change(next, 'summary');
          return;
        }

        const derived = draftNodeId(summary, others);
        setFollowing((current) => {
          return new Set([...current].map((followed) => (followed === id ? derived : followed)));
        });
        change(renameNode(next, id, derived), 'summary');
      },
      onSummaryDone: () => {
        stopFollowing(id);
      },
      onId: (typed) => {
        const renamed = draftNodeId(typed, others);
        stopFollowing(id, renamed);
        change(renameNode(draft, id, renamed));
      },
      onNote: (note) => {
        change(
          updateNode(draft, id, (node) => withNote(node, note)),
          'note',
        );
      },
      onSegments: (segments) => {
        change(
          updateNode(draft, id, (node) => ({ ...node, segments })),
          'segments',
        );
      },
      onLabel: (index, label) => {
        change(
          updateNode(draft, id, (node) => ({
            ...node,
            choices: node.choices.map((choice, at) =>
              at === index ? { ...choice, label } : choice,
            ),
          })),
          `choice:${index}`,
        );
      },
      onMove: (index, offset) => {
        change(moveChoice(draft, id, index, offset));
      },
      onRemoveChoice: (index) => {
        change(removeChoice(draft, id, index));
      },
      onRemove: () => {
        setSelected(undefined);
        change(removeNode(draft, id));
      },
    };
  };

  const cards = {
    onHeight,
    onOpen:
      onOpen === undefined
        ? undefined
        : (key: string) => {
            const node = draft.nodes[indexOf(key)];
            if (node !== undefined) {
              onOpen(node.id);
            }
          },
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
    void layoutDraft(latest.current.keyed, latest.current.heights).then((layout) => {
      if (current) {
        setLaidOut({ key: structure, layout });
      }
    });
    return () => {
      current = false;
    };
  }, [structure, measured]);

  /** The card at a point of the canvas, if any: where a dragged edge points or is dropped. */
  const keyAt = useCallback(
    (point: XYPosition) =>
      [...(laidOut?.layout.nodes ?? [])].find(([key, position]) => {
        const height = heights.get(key);
        return (
          height !== undefined &&
          point.x >= position.x &&
          point.x <= position.x + CARD_WIDTH &&
          point.y >= position.y &&
          point.y <= position.y + height
        );
      })?.[0],
    [heights, laidOut],
  );
  const dropTarget = dragging === undefined ? undefined : keyAt(dragging);
  /** The card outlined last in the drag going on, where the edge is dropped. */
  const lastTarget = useRef<string>(undefined);

  useEffect(() => {
    if (dragging !== undefined) {
      lastTarget.current = dropTarget;
    }
  }, [dragging, dropTarget]);

  const center = useCallback(
    (key: string, zoom?: number) => {
      const position = laidOut?.layout.nodes.get(key);
      const height = heights.get(key);
      if (position === undefined || height === undefined) {
        return;
      }

      centering.current = { key, until: Date.now() + MOVE_DURATION, zoom: zoom ?? flow.getZoom() };
      void flow.setCenter(position.x + CARD_WIDTH / 2, position.y + height / 2, {
        zoom: zoom ?? flow.getZoom(),
        duration: MOVE_DURATION,
      });
    },
    [flow, heights, laidOut],
  );

  /** The layout shown before the last one, to see how far the selected card moved. */
  const previous = useRef<BoxLayout>(undefined);

  // A card that grows, as it opens to write in or takes a new choice, lays the graph out anew, so
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

  // The first layout fits the whole draft in; later ones keep the view where the author is.
  const shown = laidOut !== undefined;
  useEffect(() => {
    if (shown) {
      // No closer than the cards' own size: a draft of one node would fill the screen.
      void flow.fitView({ maxZoom: 1 });
    }
  }, [shown, flow]);

  useEffect(() => {
    const key = pending.current;
    if (key !== undefined && laidOut?.layout.nodes.has(key) === true) {
      pending.current = undefined;
      center(key, Math.max(flow.getZoom(), FAR_ZOOM));
    }
  }, [laidOut, center, flow]);

  // ReactFlow's `nodes` and `edges` props take mutable arrays; the memos are never changed here.
  const nodes = useMemo<(DraftFlowNode | InitialFlowNode | EndFlowNode)[]>(() => {
    const position = (key: string) => laidOut?.layout.nodes.get(key) ?? { x: 0, y: 0 };
    const starts = new Set(startsOf(keyed).map((node) => node.id));
    const indexById = new Map(draft.nodes.map((node, index) => [node.id, index]));
    return [
      ...draft.nodes.map((node, index): DraftFlowNode => {
        const key = keyOf(index);
        const height = heights.get(key);
        return {
          id: key,
          type: 'draft',
          position: position(key),
          // The size measured here: React Flow keeps a node it knows the size of visible while
          // the node changes, so a field in it keeps the focus; without it, it hides the node
          // till it measures the node again.
          ...(height === undefined ? {} : { measured: { width: CARD_WIDTH, height } }),
          selected: key === selected,
          data: {
            node,
            start: starts.has(key),
            maxHeight,
            dropTarget: key === dropTarget,
            color: tagColor(index),
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
  }, [draft, keyed, routes, differences, laidOut, selected, maxHeight, heights, dropTarget]);

  const edges = useMemo<RouteEdge[]>(() => {
    const route = (id: string) => laidOut?.layout.edges.get(id);
    const plain = (id: string, source: string, target: string): RouteEdge => ({
      id,
      type: 'route',
      source,
      target,
      markerEnd: ARROW_HEAD,
      data: { points: route(id)?.points ?? [], dimmed: false },
    });
    return [
      ...startsOf(keyed).map((node) => plain(initialEdgeId(node.id), INITIAL_ID, node.id)),
      ...keyed.nodes.flatMap((node) =>
        node.choices.map((choice, index): RouteEdge => {
          const id = edgeId(node.id, index);
          const label = route(id)?.label;
          return {
            ...plain(id, node.id, choice.to),
            sourceHandle: dotHandle(index),
            data: {
              points: route(id)?.points ?? [],
              text: edgeText(choice.label),
              ...(label === undefined ? {} : { label }),
              // The plain arrow is no decision, so its label stays in the background.
              ...(choice.label === '' ? { color: 'var(--muted-foreground)' } : {}),
              dimmed: false,
            },
          };
        }),
      ),
      ...endsOf(keyed).map((node) => ({
        ...plain(finalEdgeId(node.id), node.id, finalRingId(node.id)),
        sourceHandle: dotHandle('new'),
      })),
    ];
  }, [keyed, laidOut]);

  /**
   * Leads a choice of `source` to `target`, or to a new node without one, and brings that node to
   * the middle, selected.
   */
  const link = (source: string, dot: DotKey, target: string | undefined) => {
    if (onChange === undefined) {
      return;
    }

    const next = linkChoice(draft, source, dot, target);
    if (target === undefined) {
      setFollowing((current) => new Set([...current, next.target]));
    }

    const key = keyOf(
      next.draft.nodes.findIndex((node) => {
        return node.id === next.target;
      }),
    );
    onChange(next.draft);
    setSelected(key);
    pending.current = key;
  };

  /** A drag from a dot: dropped on a node it leads there, elsewhere it draws out a new node. */
  const onConnectEnd = (_event: MouseEvent | TouchEvent, connection: FinalConnectionState) => {
    const from = connection.fromNode?.id;
    const source = from === undefined ? undefined : draft.nodes[indexOf(from)]?.id;
    const dot = dotOf(connection.fromHandle?.id);
    if (source === undefined || dot === undefined) {
      return;
    }

    // The card outlined last while dragging; React Flow's final `to` is not always the last one.
    const over = connection.toNode?.id ?? lastTarget.current;
    link(source, dot, over === undefined ? undefined : draft.nodes[indexOf(over)]?.id);
  };

  return (
    <CardContext value={cards}>
      <div
        ref={wrapper}
        className={cn(
          'story-graph size-full transition-opacity duration-200',
          laidOut === undefined && 'opacity-0',
          className,
        )}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_event, node) => {
            // A click into the card being written in only places the cursor.
            if (node.type === 'draft' && node.id !== selected) {
              setSelected(node.id);
              center(node.id);
            }
          }}
          onNodeDoubleClick={(event, node) => {
            // A double click into a text selects a word there.
            if (node.type === 'draft' && !isWritable(event.target)) {
              setSelected(node.id);
              center(node.id, CLOSE_ZOOM);
            }
          }}
          onPaneClick={() => {
            setSelected(undefined);
          }}
          onConnectEnd={onConnectEnd}
          // A click on a dot is no way to connect, and a move this small still a click: on the
          // plus it adds a choice.
          connectOnClick={false}
          connectionDragThreshold={CLICK_DISTANCE}
          colorMode={resolved}
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={onChange !== undefined}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </CardContext>
  );
};

/**
 * The draft as a graph laid out by ELK from top to bottom. Each card is as high as its text, up to
 * the canvas's height; zoomed out, it shows only its summary. A click brings a node to the middle
 * and opens it to write in, a double click brings it closer too; a choice's dot dragged onto a node
 * leads there, and dragged elsewhere draws out a new node.
 */
export const DraftCanvas = (props: DraftCanvasProps) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);
