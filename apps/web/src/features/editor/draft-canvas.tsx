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
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';

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

import { endsOf, startsOf, type Draft, type DraftNode } from './draft';
import { CARD_HEIGHT, CARD_WIDTH, DraftNodeCard, NEXT_LABEL } from './draft-node-card';

/** Below this zoom the cards show only their summaries. */
export const FAR_ZOOM = 0.7;

/** The zoom a clicked node is brought to, so its text reads well. */
const CLOSE_ZOOM = 1.1;

type DraftFlowNode = Node<{ readonly node: DraftNode; readonly start: boolean }, 'draft'>;

/** A card on the canvas; it switches to the summary alone when the canvas is zoomed out. */
const DraftFlowCard = ({ data, selected }: NodeProps<DraftFlowNode>) => {
  const far = useStore((state) => state.transform[2] < FAR_ZOOM);
  return (
    <>
      <Handle type='target' position={Position.Top} className='opacity-0' />
      <DraftNodeCard node={data.node} start={data.start} far={far} selected={selected} />
      <Handle type='source' position={Position.Bottom} className='opacity-0' />
    </>
  );
};

const nodeTypes = { draft: DraftFlowCard, initial: InitialDot, final: FinalDot } as const;
const edgeTypes = { route: RouteEdgeView } as const;

const edgeId = (source: string, index: number) => `${source}-${index}`;

/** The text an edge shows: the button's, or „Další“ for the plain arrow. */
const edgeText = (label: string) => (label === '' ? NEXT_LABEL : label);

/** What the layout depends on: the nodes and where their choices lead, not the texts. */
const structureOf = (draft: Draft) =>
  JSON.stringify(
    draft.nodes.map((node) => [
      node.id,
      node.choices.map((choice) => [choice.to, edgeText(choice.label)]),
    ]),
  );

const layoutDraft = (draft: Draft) =>
  layoutBoxes({
    nodes: draft.nodes.map((node) => ({ id: node.id, width: CARD_WIDTH, height: CARD_HEIGHT })),
    edges: draft.nodes.flatMap((node) =>
      node.choices.map((choice, index) => ({
        id: edgeId(node.id, index),
        source: node.id,
        target: choice.to,
        label: edgeText(choice.label),
      })),
    ),
    initial: startsOf(draft).map((node) => node.id),
    final: endsOf(draft).map((node) => node.id),
  });

export interface DraftCanvasProps {
  readonly draft: Draft;
  /** Double click on a node, to open it in the focus mode. */
  readonly onOpen?: (id: string) => void;
  readonly className?: string;
}

const Canvas = ({ draft, onOpen, className }: DraftCanvasProps) => {
  const { resolved } = useTheme();
  const flow = useReactFlow();
  const structure = useMemo(() => structureOf(draft), [draft]);
  const [laidOut, setLaidOut] = useState<{ readonly key: string; readonly layout: BoxLayout }>();
  /** The node clicked last; the nodes are not changed by React Flow, so it is kept here. */
  const [selected, setSelected] = useState<string>();

  /** The draft the layout is made of; the layout waits for its structure only, not its texts. */
  const latest = useRef(draft);

  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  useEffect(() => {
    // Flipped by the cleanup so a layout finishing after the draft changed is not applied.
    let current = true;
    void layoutDraft(latest.current).then((layout) => {
      if (current) {
        setLaidOut({ key: structure, layout });
      }
    });
    return () => {
      current = false;
    };
  }, [structure]);

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
        data: { node, start: starts.has(node.id) },
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
  }, [draft, laidOut, selected]);

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
      ...endsOf(draft).map((node) => plain(finalEdgeId(node.id), node.id, FINAL_ID)),
    ];
  }, [draft, laidOut]);

  return (
    <div className={cn('story-graph size-full', className)}>
      {laidOut?.key === structure && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_event, node) => {
            if (node.type !== 'draft') {
              return;
            }

            setSelected(node.id);
            void flow.setCenter(
              node.position.x + CARD_WIDTH / 2,
              node.position.y + CARD_HEIGHT / 2,
              { zoom: Math.max(flow.getZoom(), CLOSE_ZOOM), duration: 400 },
            );
          }}
          onPaneClick={() => {
            setSelected(undefined);
          }}
          onNodeDoubleClick={(_event, node) => {
            if (node.type === 'draft') {
              onOpen?.(node.id);
            }
          }}
          colorMode={resolved}
          fitView
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  );
};

/**
 * The draft as a graph laid out by ELK, the same way as the story's graph. Zoomed out, the cards
 * show only their summaries; a click brings a node to the middle, close enough to read.
 */
export const DraftCanvas = (props: DraftCanvasProps) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);
