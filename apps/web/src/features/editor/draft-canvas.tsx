import '@xyflow/react/dist/style.css';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type FinalConnectionState,
  type Node,
  type NodeProps,
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
  type FinalFlowNode,
  type InitialFlowNode,
  type RouteEdge,
} from '@/features/story/graph-edges';
import {
  FINAL_ID,
  FINAL_SIZE,
  finalEdgeId,
  INITIAL_ID,
  INITIAL_SIZE,
  initialEdgeId,
  layoutBoxes,
  type BoxLayout,
} from '@/features/story/graph-layout';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { draftNodeId, endsOf, startsOf, type Draft, type DraftNode } from './draft';
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
  DOT_LOOK,
  DotContent,
  dotX,
  DraftNodeCard,
  NEW_DOT_LOOK,
  NEXT_LABEL,
  type CardEdit,
  type DotKey,
} from './draft-node-card';

/** Below this zoom the cards show only their summaries. */
export const FAR_ZOOM = 0.7;

/** The zoom a double-clicked node is brought to, so its text reads well. */
const CLOSE_ZOOM = 1.1;

/** Room kept around a card as high as the canvas, so it fits at the zoom of 1. */
const VIEWPORT_MARGIN = 48;

/** Length of the moves of the view, in ms. */
const MOVE_DURATION = 400;

type DraftFlowNode = Node<
  { readonly node: DraftNode; readonly start: boolean; readonly maxHeight: number },
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
}>({ onHeight: () => {}, onOpen: undefined, connectable: false, editOf: undefined });

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
const DotHandle = ({ dot, x }: { readonly dot: DotKey; readonly x: number }) => {
  const { connectable } = use(CardContext);
  return (
    <Handle
      type='source'
      id={dotHandle(dot)}
      position={Position.Bottom}
      isConnectable={connectable}
      style={{ left: x }}
      className={cn(
        // React Flow's own handle look gives way to the dot's.
        'size-4! min-h-0! min-w-0! rounded-full!',
        dot === 'new'
          ? cn(
              NEW_DOT_LOOK,
              'border-dashed! border-muted-foreground! bg-card! hover:border-yellow-500!',
            )
          : cn(DOT_LOOK, 'border-card! bg-muted-foreground! hover:bg-yellow-500!'),
        connectable && 'cursor-crosshair',
      )}
    >
      <DotContent dot={dot} />
    </Handle>
  );
};

const dotOfCard = (dot: DotKey, x: number) => <DotHandle dot={dot} x={x} />;

/** A card on the canvas: it reports its height and offers its choices' dots to drag from. */
const DraftFlowCard = ({ id, data, selected }: NodeProps<DraftFlowNode>) => {
  const far = useStore((state) => state.transform[2] < FAR_ZOOM);
  const { onHeight, onOpen, connectable, editOf } = use(CardContext);
  // Written in only close up: from afar the summary covers the card.
  const edit = selected && !far ? editOf?.(id) : undefined;
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

const nodeTypes = { draft: DraftFlowCard, initial: InitialDot, final: FinalDot } as const;
const edgeTypes = { route: RouteEdgeView } as const;

const edgeId = (source: string, index: number) => `${source}-${index}`;
const portId = (source: string, key: DotKey) => `port:${source}:${key}`;
/** Every edge enters its card at a point of its own, so the arrows never end on each other. */
const entryId = (edge: string) => `entry:${edge}`;

/** The text an edge shows: the button's, or „Další“ for the plain arrow. */
const edgeText = (label: string) => (label === '' ? NEXT_LABEL : label);

/**
 * What the layout depends on: the nodes, their heights and where their choices lead, with what
 * text. While a card is written in, only the nodes and where the choices lead: the cards stay where
 * they are as one grows, and the layout catches up once the author leaves it.
 */
const structureOf = (draft: Draft, heights: ReadonlyMap<string, number>, writing: boolean) =>
  JSON.stringify(
    draft.nodes.map((node) => {
      if (writing) {
        return [node.id, node.choices.map((choice) => choice.to)];
      }

      return [
        node.id,
        heights.get(node.id),
        node.choices.map((choice) => [choice.to, edgeText(choice.label)]),
      ];
    }),
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
              x: dotX(node.choices.length, key),
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

/** The point on the screen where a drag ended. */
const pointOf = (event: MouseEvent | TouchEvent) => {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];
    if (touch === undefined) {
      return undefined;
    }

    return { x: touch.clientX, y: touch.clientY };
  }

  return { x: event.clientX, y: event.clientY };
};

/** The draft node under a point on the screen, if any. */
const nodeAt = (point: { readonly x: number; readonly y: number }) =>
  document
    .elementFromPoint(point.x, point.y)
    ?.closest('.react-flow__node-draft')
    ?.getAttribute('data-id') ?? undefined;

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
  const flow = useReactFlow();
  const canvasHeight = useStore((state) => state.height);
  const close = useStore((state) => state.transform[2] >= FAR_ZOOM);
  const maxHeight = Math.max(200, canvasHeight - 2 * VIEWPORT_MARGIN);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [laidOut, setLaidOut] = useState<{ readonly key: string; readonly layout: BoxLayout }>();
  /** The card clicked last; the nodes are not changed by React Flow, so it is kept here. */
  const [selected, setSelected] = useState<string>();
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
  const writing = onChange !== undefined && selected !== undefined && close;

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
      onAddChoice: () => {
        const next = linkChoice(draft, id, 'new');
        setFollowing((current) => new Set([...current, next.target]));
        change(next.draft);
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
  };

  const measured = keyed.nodes.every((node) => {
    return heights.has(node.id);
  });
  const structure = useMemo(() => structureOf(keyed, heights, writing), [keyed, heights, writing]);
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

  const center = useCallback(
    (key: string, zoom?: number) => {
      const position = laidOut?.layout.nodes.get(key);
      const height = heights.get(key);
      if (position === undefined || height === undefined) {
        return;
      }

      void flow.setCenter(position.x + CARD_WIDTH / 2, position.y + height / 2, {
        zoom: zoom ?? flow.getZoom(),
        duration: MOVE_DURATION,
      });
    },
    [flow, heights, laidOut],
  );

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
  const nodes = useMemo<(DraftFlowNode | InitialFlowNode | FinalFlowNode)[]>(() => {
    const position = (key: string) => laidOut?.layout.nodes.get(key) ?? { x: 0, y: 0 };
    const starts = new Set(startsOf(keyed).map((node) => node.id));
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
          data: { node, start: starts.has(key), maxHeight },
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
      ...(endsOf(keyed).length > 0
        ? [
            {
              id: FINAL_ID,
              type: 'final' as const,
              position: position(FINAL_ID),
              measured: { width: FINAL_SIZE, height: FINAL_SIZE },
              data: {},
              selectable: false,
            },
          ]
        : []),
    ];
  }, [draft, keyed, laidOut, selected, maxHeight, heights]);

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
        ...plain(finalEdgeId(node.id), node.id, FINAL_ID),
        sourceHandle: dotHandle('new'),
      })),
    ];
  }, [keyed, laidOut]);

  /** A drag from a dot: dropped on a node it leads there, elsewhere it draws out a new node. */
  const onConnectEnd = (event: MouseEvent | TouchEvent, connection: FinalConnectionState) => {
    const from = connection.fromNode?.id;
    const source = from === undefined ? undefined : draft.nodes[indexOf(from)]?.id;
    const dot = dotOf(connection.fromHandle?.id);
    const point = pointOf(event);
    if (
      onChange === undefined ||
      source === undefined ||
      dot === undefined ||
      point === undefined
    ) {
      return;
    }

    const over = connection.toNode?.id ?? nodeAt(point);
    const target = over === undefined ? undefined : draft.nodes[indexOf(over)]?.id;
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

  return (
    <CardContext value={cards}>
      <div
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
