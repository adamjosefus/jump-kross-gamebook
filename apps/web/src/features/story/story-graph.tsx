import '@xyflow/react/dist/style.css';
import type { GameGraph, GraphNode } from '@gamebook/core';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type XYPosition,
} from '@xyflow/react';
import type { ElkNode } from 'elkjs/lib/elk-api';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Flag, Play, QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';

import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;

const elk = new ELK();

interface Box extends XYPosition {
  readonly width: number;
  readonly height: number;
}

interface Layout {
  readonly nodes: ReadonlyMap<string, XYPosition>;
  /** Orthogonal route and label box of every edge, so parallel edges and labels do not overlap. */
  readonly edges: ReadonlyMap<string, { points: readonly XYPosition[]; label?: Box }>;
}

/** Layouts by graph structure, so choosing another start does not lay the graph out again. */
const layouts = new Map<string, Promise<Layout>>();

const structureOf = (graph: GameGraph) =>
  graph.order
    .map((id) => `${id}>${graph.nodes[id]!.choices.map((c) => `${c.target}:${c.label}`).join(',')}`)
    .join(';');

const edgeId = (source: string, index: number) => `${source}-${index}`;

/** Rough label size; ELK only needs it to reserve space. */
const labelSize = (text: string) => ({ width: Math.ceil(text.length * 6.5) + 14, height: 18 });

/** Layered top-down layout; depends only on the nodes and edges, not on the previews. */
const layout = async (graph: GameGraph): Promise<Layout> => {
  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '48',
      'elk.spacing.edgeEdge': '16',
      'elk.spacing.edgeLabel': '4',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.edgeLabels.inline': 'true',
    },
    children: graph.order.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: graph.order.flatMap((id) =>
      graph.nodes[id]!.choices.flatMap((choice, index) =>
        Object.hasOwn(graph.nodes, choice.target)
          ? [
              {
                id: edgeId(id, index),
                sources: [id],
                targets: [choice.target],
                labels: [{ text: choice.label, ...labelSize(choice.label) }],
              },
            ]
          : [],
      ),
    ),
  };
  const result = await elk.layout(input);
  return {
    nodes: new Map(
      (result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
    ),
    edges: new Map(
      (result.edges ?? []).map((edge) => {
        const section = edge.sections?.[0];
        const label = edge.labels?.[0];
        return [
          edge.id,
          {
            points:
              section === undefined
                ? []
                : [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
            ...(label === undefined
              ? {}
              : {
                  label: {
                    x: label.x ?? 0,
                    y: label.y ?? 0,
                    width: label.width ?? 0,
                    height: label.height ?? 0,
                  },
                }),
          },
        ];
      }),
    ),
  };
};

type RouteEdge = Edge<
  { points: readonly XYPosition[]; text: string; label?: Box; dimmed: boolean },
  'route'
>;

/** Edge drawn along the route ELK computed, with its label where ELK placed it. */
const RouteEdgeView = ({ data, markerEnd, style }: EdgeProps<RouteEdge>) => {
  if (data === undefined || data.points.length === 0) return null;
  const path = data.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const { label } = data;
  return (
    <>
      <BaseEdge
        path={path}
        {...(markerEnd === undefined ? {} : { markerEnd })}
        style={{ ...style, opacity: data.dimmed ? 0.3 : 1 }}
      />
      {label !== undefined && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'pointer-events-none absolute truncate rounded bg-background px-1 text-center text-[11px] leading-[18px] text-foreground',
              data.dimmed && 'opacity-30',
            )}
            style={{
              transform: `translate(${label.x}px, ${label.y}px)`,
              width: label.width,
              height: label.height,
            }}
          >
            {data.text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const edgeTypes = { route: RouteEdgeView };

type StoryFlowNode = Node<{ node: GraphNode; highlighted: boolean }, 'story'>;

/** Node card: id tag, kind, checkpoints and the first screen of its content. */
const StoryNodeCard = ({ data: { node, highlighted } }: NodeProps<StoryFlowNode>) => {
  const preview = node.preview;
  return (
    <div
      title={preview?.state === undefined ? undefined : JSON.stringify(preview.state, null, 1)}
      className={cn(
        'flex flex-col gap-2 overflow-hidden rounded-lg border bg-card p-3 text-card-foreground shadow-sm',
        node.type !== 'passage' && 'border-foreground/60',
        !node.reached && 'opacity-40',
        highlighted && 'ring-2 ring-foreground',
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle type='target' position={Position.Top} className='opacity-0' />
      <div className='flex items-center gap-1'>
        <Badge variant='secondary' className='font-mono'>
          {node.id}
        </Badge>
        {node.type === 'start' && (
          <Badge variant='outline' title='Start'>
            <Play />
          </Badge>
        )}
        {node.type === 'end' && (
          <Badge variant='outline' title='Konec'>
            <Flag />
          </Badge>
        )}
        {preview?.checkpoints.map((location, i) => (
          <Badge
            key={i}
            variant='outline'
            className='font-mono'
            title={`Checkpoint, místo ${location}`}
          >
            <QrCode /> {location}
          </Badge>
        ))}
        <span className='flex-1' />
        {preview !== undefined && preview.screens > 1 && (
          <span className='text-xs text-muted-foreground' title='Počet obrazovek'>
            {preview.screens}×
          </span>
        )}
      </div>
      <div className='graph-preview line-clamp-4 text-xs leading-snug text-muted-foreground'>
        {preview === undefined ? (
          <em>Obsah závisí na stavu a tento start sem nevede.</em>
        ) : (
          <Markdown>{preview.content}</Markdown>
        )}
      </div>
      <Handle type='source' position={Position.Bottom} className='opacity-0' />
    </div>
  );
};

const nodeTypes = { story: StoryNodeCard };

export interface StoryGraphProps {
  readonly graph: GameGraph;
  /** Nodes to emphasise, e.g. where teams currently are. */
  readonly highlight?: readonly string[];
  readonly className?: string;
}

/** The story as a zoomable graph laid out by ELK. */
export const StoryGraph = ({ graph, highlight = [], className }: StoryGraphProps) => {
  const { resolved } = useTheme();
  const [laidOut, setLaidOut] = useState<{ key: string; layout: Layout }>();

  const structure = useMemo(() => structureOf(graph), [graph]);
  useEffect(() => {
    let current = true;
    let pending = layouts.get(structure);
    if (pending === undefined) {
      pending = layout(graph);
      layouts.set(structure, pending);
    }
    void pending.then((result) => {
      if (current) setLaidOut({ key: structure, layout: result });
    });
    return () => {
      current = false;
    };
  }, [graph, structure]);

  const nodes = useMemo<StoryFlowNode[]>(
    () =>
      graph.order.map((id) => ({
        id,
        type: 'story',
        position: laidOut?.layout.nodes.get(id) ?? { x: 0, y: 0 },
        data: { node: graph.nodes[id]!, highlighted: highlight.includes(id) },
        draggable: false,
      })),
    [graph, laidOut, highlight],
  );

  const edges = useMemo<RouteEdge[]>(
    () =>
      graph.order.flatMap((id) =>
        graph.nodes[id]!.choices.map((choice, index) => {
          const route = laidOut?.layout.edges.get(edgeId(id, index));
          return {
            id: edgeId(id, index),
            type: 'route',
            source: id,
            target: choice.target,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: {
              points: route?.points ?? [],
              text: choice.label,
              ...(route?.label === undefined ? {} : { label: route.label }),
              // Paths the chosen start never takes are dimmed.
              dimmed: choice.available === false || !graph.nodes[id]!.reached,
            },
            ...(choice.conditional ? { style: { strokeDasharray: '6 4' } } : {}),
          };
        }),
      ),
    [graph, laidOut],
  );

  return (
    <div className={cn('story-graph size-full', className)}>
      {laidOut?.key === structure && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={resolved}
          fitView
          minZoom={0.1}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  );
};
