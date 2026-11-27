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
  finalEdgeId,
  INITIAL_ID,
  initialEdgeId,
  layoutBoxes,
  type BoxLayout,
} from '@/features/story/graph-layout';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { draftNodeId, endsOf, startsOf, type Draft, type DraftNode } from './draft';
import {
  CARD_WIDTH,
  choiceDotY,
  DraftNodeCard,
  ENTRY_FROM_BOTTOM,
  NEXT_LABEL,
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

/** What the cards need from the canvas: where to report their heights, whether to offer drags. */
const CardContext = createContext<{
  readonly onHeight: (id: string, height: number) => void;
  readonly onOpen: ((id: string) => void) | undefined;
  readonly connectable: boolean;
}>({ onHeight: () => {}, onOpen: undefined, connectable: false });

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
const DotHandle = ({ dot }: { readonly dot: DotKey }) => {
  const { connectable } = use(CardContext);
  return (
    <Handle
      type='source'
      id={dotHandle(dot)}
      position={Position.Right}
      isConnectable={connectable}
      className={cn(
        'size-2.5! rounded-full! border-2! border-card! bg-muted-foreground! hover:bg-yellow-500!',
        connectable && 'cursor-crosshair',
      )}
    />
  );
};

const dotOfCard = (dot: DotKey) => <DotHandle dot={dot} />;

/** A card on the canvas: it reports its height and offers its choices' dots to drag from. */
const DraftFlowCard = ({ id, data, selected }: NodeProps<DraftFlowNode>) => {
  const far = useStore((state) => state.transform[2] < FAR_ZOOM);
  const { onHeight, onOpen, connectable } = use(CardContext);
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
        position={Position.Left}
        className='opacity-0'
        style={{ top: 'auto', bottom: ENTRY_FROM_BOTTOM }}
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
        dot={dotOfCard}
      />
    </>
  );
};

const nodeTypes = { draft: DraftFlowCard, initial: InitialDot, final: FinalDot } as const;
const edgeTypes = { route: RouteEdgeView } as const;

const edgeId = (source: string, index: number) => `${source}-${index}`;
const portId = (source: string, index: number) => `port:${source}:${index}`;
const entryId = (target: string) => `entry:${target}`;

/** The text an edge shows: the button's, or „Další“ for the plain arrow. */
const edgeText = (label: string) => (label === '' ? NEXT_LABEL : label);

/** What the layout depends on: the nodes, their heights and where their choices lead. */
const structureOf = (draft: Draft, heights: ReadonlyMap<string, number>) =>
  JSON.stringify(
    draft.nodes.map((node) => [
      node.id,
      heights.get(node.id),
      node.choices.map((choice) => [choice.to, edgeText(choice.label)]),
    ]),
  );

/**
 * Left to right, with the edges leaving at the choices' dots and entering level with the last
 * choice; a node is laid out as early as the nodes leading to it allow.
 */
const layoutDraft = (draft: Draft, heights: ReadonlyMap<string, number>) =>
  layoutBoxes({
    direction: 'RIGHT',
    options: { 'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE' },
    nodes: draft.nodes.map((node) => {
      const height = heights.get(node.id) ?? 0;
      return {
        id: node.id,
        width: CARD_WIDTH,
        height,
        ports: [
          { id: entryId(node.id), x: 0, y: height - ENTRY_FROM_BOTTOM, side: 'WEST' as const },
          ...node.choices.map((_choice, index) => {
            return {
              id: portId(node.id, index),
              x: CARD_WIDTH,
              y: choiceDotY(height, node.choices.length, index),
              side: 'EAST' as const,
            };
          }),
        ],
      };
    }),
    edges: draft.nodes.flatMap((node) =>
      node.choices.map((choice, index) => ({
        id: edgeId(node.id, index),
        source: node.id,
        target: choice.to,
        sourcePort: portId(node.id, index),
        targetPort: entryId(choice.to),
        label: edgeText(choice.label),
      })),
    ),
    initial: startsOf(draft).map((node) => node.id),
    final: endsOf(draft).map((node) => node.id),
  });

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

/**
 * The draft with a choice of `source` leading to `target`: the choice `dot`, or a new plain one.
 * Without a `target` a new empty node is added for it.
 */
const linked = (
  draft: Draft,
  source: string,
  dot: DotKey,
  target: string | undefined,
): { readonly draft: Draft; readonly target: string } => {
  const taken = new Set(draft.nodes.map((node) => node.id));
  const to = target ?? draftNodeId('', taken);
  const nodes = draft.nodes.map((node) => {
    if (node.id !== source) {
      return node;
    }

    if (dot === 'new') {
      return { ...node, choices: [...node.choices, { label: '', to }] };
    }

    return {
      ...node,
      choices: node.choices.map((choice, index) => {
        if (index !== dot) {
          return choice;
        }

        return { ...choice, to };
      }),
    };
  });
  const added: readonly DraftNode[] =
    target === undefined ? [{ id: to, summary: '', segments: [{ text: '' }], choices: [] }] : [];
  return { draft: { ...draft, nodes: [...nodes, ...added] }, target: to };
};

export interface DraftCanvasProps {
  readonly draft: Draft;
  /** Without it the draft is only shown: no edges can be drawn out. */
  readonly onChange?: (draft: Draft) => void;
  /** Opens a node in the focus mode. */
  readonly onOpen?: (id: string) => void;
  readonly className?: string;
}

const Canvas = ({ draft, onChange, onOpen, className }: DraftCanvasProps) => {
  const { resolved } = useTheme();
  const flow = useReactFlow();
  const canvasHeight = useStore((state) => state.height);
  const maxHeight = Math.max(200, canvasHeight - 2 * VIEWPORT_MARGIN);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [laidOut, setLaidOut] = useState<{ readonly key: string; readonly layout: BoxLayout }>();
  /** The node clicked last; the nodes are not changed by React Flow, so it is kept here. */
  const [selected, setSelected] = useState<string>();
  /** A node to bring to the middle once it is laid out, e.g. one just drawn out. */
  const pending = useRef<string>(undefined);

  const onHeight = useCallback((id: string, height: number) => {
    setHeights((current) => {
      if (current.get(id) === height) {
        return current;
      }

      return new Map([...current, [id, height]]);
    });
  }, []);
  const cards = useMemo(
    () => ({ onHeight, onOpen, connectable: onChange !== undefined }),
    [onHeight, onOpen, onChange],
  );

  const measured = draft.nodes.every((node) => {
    return heights.has(node.id);
  });
  const structure = useMemo(() => structureOf(draft, heights), [draft, heights]);
  /** What the layout is made of; it waits for the structure only, not for the texts. */
  const latest = useRef({ draft, heights });

  useEffect(() => {
    latest.current = { draft, heights };
  }, [draft, heights]);

  useEffect(() => {
    if (!measured) {
      return undefined;
    }

    // Flipped by the cleanup so a layout finishing after the draft changed is not applied.
    let current = true;
    void layoutDraft(latest.current.draft, latest.current.heights).then((layout) => {
      if (current) {
        setLaidOut({ key: structure, layout });
      }
    });
    return () => {
      current = false;
    };
  }, [structure, measured]);

  const center = useCallback(
    (id: string, zoom?: number) => {
      const position = laidOut?.layout.nodes.get(id);
      const height = heights.get(id);
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
      void flow.fitView();
    }
  }, [shown, flow]);

  useEffect(() => {
    const id = pending.current;
    if (id !== undefined && laidOut?.layout.nodes.has(id) === true) {
      pending.current = undefined;
      center(id, Math.max(flow.getZoom(), FAR_ZOOM));
    }
  }, [laidOut, center, flow]);

  // ReactFlow's `nodes` and `edges` props take mutable arrays; the memos are never changed here.
  const nodes = useMemo<(DraftFlowNode | InitialFlowNode | FinalFlowNode)[]>(() => {
    const position = (id: string) => laidOut?.layout.nodes.get(id) ?? { x: 0, y: 0 };
    const starts = new Set(startsOf(draft).map((node) => node.id));
    return [
      ...draft.nodes.map((node): DraftFlowNode => ({
        id: node.id,
        type: 'draft',
        position: position(node.id),
        selected: node.id === selected,
        data: { node, start: starts.has(node.id), maxHeight },
      })),
      {
        id: INITIAL_ID,
        type: 'initial',
        position: position(INITIAL_ID),
        data: {},
        selectable: false,
      },
      ...(endsOf(draft).length > 0
        ? [
            {
              id: FINAL_ID,
              type: 'final' as const,
              position: position(FINAL_ID),
              data: {},
              selectable: false,
            },
          ]
        : []),
    ];
  }, [draft, laidOut, selected, maxHeight]);

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
      ...startsOf(draft).map((node) => plain(initialEdgeId(node.id), INITIAL_ID, node.id)),
      ...draft.nodes.flatMap((node) =>
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
      ...endsOf(draft).map((node) => ({
        ...plain(finalEdgeId(node.id), node.id, FINAL_ID),
        sourceHandle: dotHandle('new'),
      })),
    ];
  }, [draft, laidOut]);

  /** A drag from a dot: dropped on a node it leads there, elsewhere it draws out a new node. */
  const onConnectEnd = (event: MouseEvent | TouchEvent, connection: FinalConnectionState) => {
    const source = connection.fromNode?.id;
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
    const target = draft.nodes.some((node) => {
      return node.id === over;
    })
      ? over
      : undefined;
    const next = linked(draft, source, dot, target);
    onChange(next.draft);
    setSelected(next.target);
    pending.current = next.target;
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
            if (node.type === 'draft') {
              setSelected(node.id);
              center(node.id);
            }
          }}
          onNodeDoubleClick={(_event, node) => {
            if (node.type === 'draft') {
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
 * The draft as a graph laid out by ELK from left to right. Each card is as high as its text, up to
 * the canvas's height; zoomed out, it shows only its summary. A click brings a node to the middle,
 * a double click closer too; a choice's dot dragged onto a node leads there, and dragged elsewhere
 * draws out a new node.
 */
export const DraftCanvas = (props: DraftCanvasProps) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);
