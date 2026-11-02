import '@xyflow/react/dist/style.css';
import type { GameGraph, GraphNode } from '@gamebook/core';
import { IconFlag, IconQrcode, IconWalk } from '@tabler/icons-react';
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
import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';

import { Badge } from '@/components/ui/badge';
import { TeamAvatar } from '@/features/teams/team-avatar';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;
/** Filled dot with an arrow into every start node, like the initial state of a state machine. */
const INITIAL_SIZE = 14;

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
    .map((id) => {
      const node = graph.nodes[id]!;
      return `${id}:${node.type}>${node.choices.map((c) => `${c.target}:${c.label}`).join(',')}`;
    })
    .join(';');

const edgeId = (source: string, index: number) => `${source}-${index}`;
const initialId = (start: string) => `initial:${start}`;

/** Teams reach the start by scanning their login code after the intro. */
const LOGIN_LABEL = 'Kód týmu';
const startsOf = (graph: GameGraph) =>
  graph.order.filter((id) => graph.nodes[id]!.type === 'start');

/** Rough label size; ELK only needs it to reserve space. */
const labelSize = (text: string, icon = false) => ({
  width: Math.ceil(text.length * 6.5) + 14 + (icon ? 14 : 0),
  height: 18,
});

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
    children: [
      ...graph.order.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
      ...startsOf(graph).map((id) => ({
        id: initialId(id),
        width: INITIAL_SIZE,
        height: INITIAL_SIZE,
      })),
    ],
    edges: [
      ...graph.order.flatMap((id) =>
        graph.nodes[id]!.choices.flatMap((choice, index) =>
          Object.hasOwn(graph.nodes, choice.target)
            ? [
                {
                  id: edgeId(id, index),
                  sources: [id],
                  targets: [choice.target],
                  labels: [
                    {
                      text: choice.label,
                      ...labelSize(choice.label, choice.location !== undefined),
                    },
                  ],
                },
              ]
            : [],
        ),
      ),
      ...startsOf(graph).map((id) => ({
        id: initialId(id),
        sources: [initialId(id)],
        targets: [id],
        labels: [{ text: LOGIN_LABEL, ...labelSize(LOGIN_LABEL, true) }],
      })),
    ],
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
  {
    points: readonly XYPosition[];
    text?: string;
    /** The edge is a QR choice. */
    qr?: boolean;
    label?: Box;
    dimmed: boolean;
  },
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
            {data.qr === true && <IconQrcode className='mr-0.5 inline size-3 align-[-2px]' />}
            {data.text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const edgeTypes = { route: RouteEdgeView };

/** A clan standing on a node, shown as a colored avatar on its card. */
export interface GraphTeam {
  readonly id: number;
  readonly name: string;
  readonly node?: string;
}

type StoryFlowNode = Node<
  { node: GraphNode; teams: readonly GraphTeam[]; visits: number | undefined },
  'story'
>;
type InitialFlowNode = Node<{ dimmed: boolean }, 'initial'>;

const InitialDot = ({ data: { dimmed } }: NodeProps<InitialFlowNode>) => (
  <div
    title='Start'
    className={cn('rounded-full bg-foreground', dimmed && 'opacity-40')}
    style={{ width: INITIAL_SIZE, height: INITIAL_SIZE }}
  >
    <Handle type='source' position={Position.Bottom} className='opacity-0' />
  </div>
);

/** Node card: id tag, kind and the first screen of its content. */
const StoryNodeCard = ({ data: { node, teams, visits } }: NodeProps<StoryFlowNode>) => {
  const preview = node.preview;
  return (
    <div className='relative' style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}>
      <Handle type='target' position={Position.Top} className='opacity-0' />
      <div
        title={preview?.state === undefined ? undefined : JSON.stringify(preview.state, null, 1)}
        className={cn(
          'flex size-full flex-col gap-2 overflow-hidden rounded-lg border bg-card p-3 text-card-foreground shadow-sm',
          node.type !== 'passage' && 'border-foreground/60',
          !node.reached && teams.length === 0 && 'opacity-40',
          teams.length > 0 && 'ring-2 ring-foreground',
        )}
      >
        <div className='flex items-center gap-1'>
          <Badge variant='secondary' className='font-mono'>
            {node.id}
          </Badge>
          {node.type === 'end' && (
            <Badge variant='outline' title='Konec'>
              <IconFlag />
            </Badge>
          )}
          <span className='flex-1' />
          {visits !== undefined && (
            <Badge
              variant='outline'
              className={cn('font-mono', visits === 0 && 'text-muted-foreground')}
              title={`Klany sem dorazily ${visits}×`}
            >
              <IconWalk /> {visits}
            </Badge>
          )}
        </div>
        <div className='graph-preview line-clamp-4 text-xs leading-snug text-muted-foreground'>
          {preview === undefined ? (
            <em>Obsah závisí na stavu a tento start sem nevede.</em>
          ) : (
            <Markdown>{preview.content}</Markdown>
          )}
        </div>
      </div>
      {teams.length > 0 && (
        <div className='absolute right-2 bottom-full mb-1.5 flex -space-x-2'>
          {teams.map((team) => (
            <TeamAvatar key={team.id} id={team.id} name={team.name} className='size-8 text-xs' />
          ))}
        </div>
      )}
      <Handle type='source' position={Position.Bottom} className='opacity-0' />
    </div>
  );
};

const nodeTypes = { story: StoryNodeCard, initial: InitialDot };

export interface StoryGraphProps {
  readonly graph: GameGraph;
  /** Clans to show on the nodes they stand on. */
  readonly teams?: readonly GraphTeam[];
  /** Arrivals per node; shown on the cards when given. */
  readonly visits?: Readonly<Record<string, number>>;
  /** Click on the empty canvas, e.g. to close a floating panel. */
  readonly onPaneClick?: () => void;
  readonly className?: string;
}

const NO_TEAMS: readonly GraphTeam[] = [];

/** The story as a zoomable graph laid out by ELK. */
export const StoryGraph = ({
  graph,
  teams = NO_TEAMS,
  visits,
  onPaneClick,
  className,
}: StoryGraphProps) => {
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

  const nodes = useMemo<(StoryFlowNode | InitialFlowNode)[]>(() => {
    const position = (id: string) => laidOut?.layout.nodes.get(id) ?? { x: 0, y: 0 };
    return [
      ...graph.order.map((id): StoryFlowNode => ({
        id,
        type: 'story',
        position: position(id),
        data: {
          node: graph.nodes[id]!,
          teams: teams.filter((team) => team.node === id),
          visits: visits === undefined ? undefined : (visits[id] ?? 0),
        },
        draggable: false,
      })),
      ...startsOf(graph).map((id): InitialFlowNode => ({
        id: initialId(id),
        type: 'initial',
        position: position(initialId(id)),
        data: { dimmed: !graph.nodes[id]!.reached },
        draggable: false,
        selectable: false,
      })),
    ];
  }, [graph, laidOut, teams, visits]);

  const edges = useMemo<RouteEdge[]>(
    () => [
      ...graph.order.flatMap((id) =>
        graph.nodes[id]!.choices.map((choice, index): RouteEdge => {
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
              qr: choice.location !== undefined,
              ...(route?.label === undefined ? {} : { label: route.label }),
              // Paths the start never takes are dimmed.
              dimmed: choice.available === false || !graph.nodes[id]!.reached,
            },
            ...(choice.conditional ? { style: { strokeDasharray: '6 4' } } : {}),
          };
        }),
      ),
      ...startsOf(graph).map((id): RouteEdge => {
        const route = laidOut?.layout.edges.get(initialId(id));
        return {
          id: initialId(id),
          type: 'route',
          source: initialId(id),
          target: id,
          markerEnd: { type: MarkerType.ArrowClosed },
          data: {
            points: route?.points ?? [],
            text: LOGIN_LABEL,
            qr: true,
            ...(route?.label === undefined ? {} : { label: route.label }),
            dimmed: !graph.nodes[id]!.reached,
          },
        };
      }),
    ],
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
          {...(onPaneClick === undefined ? {} : { onPaneClick })}
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
