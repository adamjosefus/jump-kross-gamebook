import '@xyflow/react/dist/style.css';
import type { GameGraph, GraphNode } from '@gamebook/core';
import { IconFlag, IconDirectionSign, IconQrcode, IconWalk } from '@tabler/icons-react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TeamAvatar } from '@/features/teams/team-avatar';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;
/** Filled dot with an arrow into the intro, like the initial state of a state machine. */
const INITIAL_SIZE = 14;
/** Ringed dot the end nodes lead into, like the final state of a state machine. */
const FINAL_SIZE = 20;
/** Delay in ms, so moving the pointer across the graph does not flash a tooltip on every node. */
const STATE_TOOLTIP_DELAY = 300;
/** Radius of the rounded corners where an edge turns. */
const CORNER_RADIUS = 8;

const elk = new ELK();

interface Box extends XYPosition {
  readonly width: number;
  readonly height: number;
}

/** Orthogonal route and label box of an edge, so parallel edges and labels do not overlap. */
interface EdgeRoute {
  readonly points: readonly XYPosition[];
  readonly label?: Box;
}

interface Layout {
  readonly nodes: ReadonlyMap<string, XYPosition>;
  readonly edges: ReadonlyMap<string, EdgeRoute>;
}

/**
 * Layouts by graph structure, so choosing another start does not lay the graph out again. A
 * module-wide cache that fills up as graphs are shown; it is mutable by design.
 */
const layouts = new Map<string, Promise<Layout>>();

const structureOf = (graph: GameGraph) =>
  graph.order
    .map((id) => {
      const node = graph.nodes[id]!;
      const choices = node.choices.map((choice) => `${choice.target}:${choice.label}`).join(',');
      return `${id}:${node.type}>${choices}`;
    })
    .join(';');

const edgeId = (source: string, index: number) => `${source}-${index}`;
const INITIAL_ID = 'graph:initial';
const INITIAL_EDGE_ID = 'graph:initial-intro';
const loginEdgeId = (start: string) => `graph:login:${start}`;
const FINAL_ID = 'graph:final';
const finalEdgeId = (end: string) => `graph:final:${end}`;

/** Teams reach the start by scanning their login code after the intro. */
const LOGIN_LABEL = 'Kód týmu';
const startsOf = (graph: GameGraph) =>
  graph.order.filter((id) => graph.nodes[id]!.type === 'start');
const endsOf = (graph: GameGraph) => graph.order.filter((id) => graph.nodes[id]!.type === 'end');

/** Longest line of a label, in characters; a longer word keeps its own line. */
const LABEL_LINE_LENGTH = 14;
const LABEL_LINE_HEIGHT = 14;

/** Words of a label broken into lines, so a long choice stays compact. */
const labelLines = (text: string): readonly string[] =>
  text.split(' ').reduce<readonly string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last === undefined) return [word];
    return `${last} ${word}`.length <= LABEL_LINE_LENGTH
      ? [...lines.slice(0, -1), `${last} ${word}`]
      : [...lines, word];
  }, []);

/** Rough size of a label with its icon; ELK only needs it to reserve space. */
const labelSize = (text: string) => {
  const lines = labelLines(text);
  return {
    width: Math.ceil(Math.max(...lines.map((line) => line.length)) * 6.5) + 24,
    height: LABEL_LINE_HEIGHT * lines.length,
  };
};

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
      { id: INITIAL_ID, width: INITIAL_SIZE, height: INITIAL_SIZE },
      ...(endsOf(graph).length > 0
        ? [{ id: FINAL_ID, width: FINAL_SIZE, height: FINAL_SIZE }]
        : []),
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
                  labels: [{ text: choice.label, ...labelSize(choice.label) }],
                },
              ]
            : [],
        ),
      ),
      ...(Object.hasOwn(graph.nodes, graph.introNode)
        ? [
            { id: INITIAL_EDGE_ID, sources: [INITIAL_ID], targets: [graph.introNode] },
            ...startsOf(graph).map((id) => ({
              id: loginEdgeId(id),
              sources: [graph.introNode],
              targets: [id],
              labels: [{ text: LOGIN_LABEL, ...labelSize(LOGIN_LABEL) }],
            })),
          ]
        : []),
      ...endsOf(graph).map((id) => ({ id: finalEdgeId(id), sources: [id], targets: [FINAL_ID] })),
    ],
  };
  const result = await elk.layout(input);
  return {
    nodes: new Map(
      (result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
    ),
    edges: new Map(
      (result.edges ?? []).map((edge): readonly [string, EdgeRoute] => {
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
    readonly points: readonly XYPosition[];
    readonly text?: string;
    /** The edge is a QR choice. */
    readonly qr?: boolean;
    readonly label?: Box;
    /** Of the line, its arrowhead and its label. */
    readonly color?: string;
    readonly dimmed: boolean;
  },
  'route'
>;

/**
 * SVG path through the points with every turn rounded by a quadratic curve; the radius shrinks to
 * half of a short segment, so two turns close together do not overlap.
 */
const roundedPath = (points: readonly XYPosition[]) =>
  points
    .map((point, index) => {
      const previous = points[index - 1];
      const next = points[index + 1];
      if (previous === undefined) return `M ${point.x} ${point.y}`;
      if (next === undefined) return `L ${point.x} ${point.y}`;
      const radius = Math.min(
        CORNER_RADIUS,
        Math.hypot(point.x - previous.x, point.y - previous.y) / 2,
        Math.hypot(next.x - point.x, next.y - point.y) / 2,
      );
      const toward = (to: XYPosition) => {
        const length = Math.hypot(to.x - point.x, to.y - point.y) || 1;
        return {
          x: point.x + ((to.x - point.x) / length) * radius,
          y: point.y + ((to.y - point.y) / length) * radius,
        };
      };
      const start = toward(previous);
      const end = toward(next);
      return `L ${start.x} ${start.y} Q ${point.x} ${point.y} ${end.x} ${end.y}`;
    })
    .join(' ');

/** Edge drawn along the route ELK computed, with its label where ELK placed it. */
const RouteEdgeView = ({ data, markerEnd, style }: EdgeProps<RouteEdge>) => {
  if (data === undefined || data.points.length === 0) return null;
  const path = roundedPath(data.points);
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
              'pointer-events-none absolute overflow-hidden rounded bg-background px-1 text-center text-[11px] whitespace-pre',
              data.dimmed && 'opacity-30',
            )}
            style={{
              color: data.color,
              lineHeight: `${LABEL_LINE_HEIGHT}px`,
              transform: `translate(${label.x}px, ${label.y}px)`,
              width: label.width,
              height: label.height,
            }}
          >
            {data.qr === true ? (
              <IconQrcode className='mr-0.5 inline size-3 align-[-2px]' />
            ) : (
              <IconDirectionSign className='mr-0.5 inline size-3 align-[-2px]' />
            )}
            {labelLines(data.text ?? '').join('\n')}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const edgeTypes = { route: RouteEdgeView } as const;

/** A clan standing on a node, shown as a colored avatar on its card. */
export interface GraphTeam {
  readonly id: number;
  readonly name: string;
  readonly node?: string;
}

type StoryFlowNode = Node<
  {
    readonly node: GraphNode;
    readonly teams: readonly GraphTeam[];
    readonly visits: number | undefined;
    readonly focused: boolean;
  },
  'story'
>;
/** All the blocks as one text, for a card to shorten as a whole. */
const textOf = (blocks: readonly string[]) =>
  blocks.filter((block) => block.trim() !== '').join('\n\n');

const NO_PREVIEW = 'Obsah závisí na stavu a tento start sem nevede.';

type InitialFlowNode = Node<Record<string, never>, 'initial'>;

const InitialDot = () => (
  <div
    title='Start'
    className='rounded-full bg-foreground'
    style={{ width: INITIAL_SIZE, height: INITIAL_SIZE }}
  >
    <Handle type='source' position={Position.Bottom} className='opacity-0' />
  </div>
);

type FinalFlowNode = Node<Record<string, never>, 'final'>;

const FinalDot = () => (
  <div
    title='Konec'
    className='flex items-center justify-center rounded-full border-2 border-foreground'
    style={{ width: FINAL_SIZE, height: FINAL_SIZE }}
  >
    <div className='size-2.5 rounded-full bg-foreground' />
    <Handle type='target' position={Position.Top} className='opacity-0' />
  </div>
);

const ARROW_HEAD = { type: MarkerType.Arrow, width: 22, height: 22 } as const;

/** Keeps the hues of consecutive edges far apart, however many edges there are. */
const GOLDEN_ANGLE = 137.508;

/** Moderately saturated color of the edge at `index`, readable on the theme. */
const edgeColor = (index: number, theme: 'light' | 'dark') =>
  `oklch(${theme === 'dark' ? 0.78 : 0.55} 0.16 ${Math.round((index * GOLDEN_ANGLE) % 360)})`;

/** The node a test run stands on. */
const FOCUSED_CARD =
  'border-yellow-500 ring-1 ring-yellow-500 hover:border-yellow-300 hover:ring-yellow-300';

/**
 * Node card: id tag, kind and the text of all its blocks, shortened as a whole. The corners are
 * concentric with the round tags (their radius plus the padding), and the text lines up with the
 * tags' labels rather than their outlines.
 */
const StoryNodeCard = ({ data: { node, teams, visits, focused } }: NodeProps<StoryFlowNode>) => {
  const preview = node.preview;
  const stateEntries = Object.entries(preview?.state ?? {});
  return (
    <div className='relative' style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}>
      <Handle type='target' position={Position.Top} className='opacity-0' />
      <Tooltip delayDuration={STATE_TOOLTIP_DELAY}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex size-full cursor-pointer flex-col gap-2.5 overflow-hidden rounded-[1.25rem] border bg-card p-2.5 text-card-foreground shadow-sm hover:border-foreground',
              node.type !== 'passage' && 'border-foreground/60',
              !node.reached && teams.length === 0 && 'opacity-40',
              teams.length > 0 && 'ring-2 ring-foreground',
              focused && `opacity-100 ${FOCUSED_CARD}`,
            )}
          >
            <div className='flex items-center gap-1'>
              <Badge variant='secondary' className='font-mono'>
                {node.id}
              </Badge>
              {node.type === 'intro' && <Badge variant='outline'>Úvod</Badge>}
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
            <div className='graph-preview line-clamp-4 px-2 text-xs leading-snug text-muted-foreground'>
              {preview === undefined ? (
                <em>{NO_PREVIEW}</em>
              ) : (
                <Markdown>{textOf(preview.blocks)}</Markdown>
              )}
            </div>
          </div>
        </TooltipTrigger>
        {stateEntries.length > 0 && (
          <TooltipContent side='right' sideOffset={6}>
            <dl className='grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 font-mono'>
              {stateEntries.map(([key, value]) => (
                <div key={key} className='contents'>
                  <dt className='opacity-60'>{key}</dt>
                  <dd className='tabular-nums'>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </TooltipContent>
        )}
      </Tooltip>
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

/** The whole text of a clicked card, block by block. */
const BlocksDialog = ({
  graph,
  id,
  onClose,
}: {
  readonly graph: GameGraph;
  /** Missing: closed. */
  readonly id: string | undefined;
  readonly onClose: () => void;
}) => {
  const node = id === undefined ? undefined : graph.nodes[id];
  const blocks = node?.preview?.blocks;
  return (
    <Dialog open={id !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[85dvh] flex-col gap-0 sm:max-w-2xl'>
        <DialogHeader className='-mx-4 border-b px-4 pb-4'>
          <DialogTitle className='font-mono'>{node?.id}</DialogTitle>
          <DialogDescription>
            {node?.dynamic === true && blocks !== undefined
              ? 'Text závisí na stavu a týmu. Tohle je ukázka pro první příchod a první tým.'
              : 'Všechny bloky v pořadí, v jakém je uvidí hráči.'}
          </DialogDescription>
        </DialogHeader>
        {/* Only the blocks scroll, so the title and the close button stay in view. */}
        <div className='-mx-4 -mb-4 flex min-h-0 flex-col gap-4 overflow-y-auto p-4'>
          {blocks === undefined ? (
            <em className='text-muted-foreground'>{NO_PREVIEW}</em>
          ) : (
            blocks.map((block, index) => (
              <div key={index} className='graph-preview rounded-lg border p-3 leading-relaxed'>
                {block.trim() === '' ? (
                  <em className='text-muted-foreground'>Blok bez textu.</em>
                ) : (
                  <Markdown>{block}</Markdown>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const nodeTypes = { story: StoryNodeCard, initial: InitialDot, final: FinalDot } as const;

/** Screen pixels covered by floating panels on the sides of the graph. */
export interface GraphInset {
  readonly left: number;
  readonly right: number;
}

const NO_INSET: GraphInset = { left: 0, right: 0 };

/**
 * Moves the view to the focused node whenever the focus changes, into the middle of the part not
 * covered by the panels; the zoom stays readable.
 */
const FocusView = ({
  center,
  inset,
}: {
  readonly center: XYPosition | undefined;
  readonly inset: GraphInset;
}) => {
  const flow = useReactFlow();
  // The nodes are not measured into the store here, so readiness is the pan and zoom and a size.
  const initialized = useStore((state) => state.panZoom !== null && state.width > 0);
  const x = center?.x;
  const y = center?.y;
  const shift = (inset.left - inset.right) / 2;
  useEffect(() => {
    if (!initialized || x === undefined || y === undefined) return;
    const zoom = Math.max(flow.getZoom(), 0.75);
    void flow.setCenter(x - shift / zoom, y, { zoom, duration: 400 });
  }, [flow, initialized, x, y, shift]);
  return null;
};

export interface StoryGraphProps {
  readonly graph: GameGraph;
  /** Clans to show on the nodes they stand on. */
  readonly teams?: readonly GraphTeam[];
  /** Arrivals per node; shown on the cards when given. */
  readonly visits?: Readonly<Record<string, number>>;
  /** Click on the empty canvas, e.g. to close a floating panel. */
  readonly onPaneClick?: () => void;
  /** Node to highlight and move the view to, e.g. where a test run stands. */
  readonly focus?: string;
  /** Floating panels over the sides, so the focused node is not moved under them. */
  readonly inset?: GraphInset;
  readonly className?: string;
}

const NO_TEAMS: readonly GraphTeam[] = [];

/** The story as a zoomable graph laid out by ELK. */
export const StoryGraph = ({
  graph,
  teams = NO_TEAMS,
  visits,
  onPaneClick,
  focus,
  inset = NO_INSET,
  className,
}: StoryGraphProps) => {
  const { resolved } = useTheme();
  const [laidOut, setLaidOut] = useState<{ readonly key: string; readonly layout: Layout }>();
  const [opened, setOpened] = useState<string>();

  const structure = useMemo(() => structureOf(graph), [graph]);
  useEffect(() => {
    // Flipped by the cleanup so a layout finishing after the graph changed is not applied.
    let current = true;
    const cached = layouts.get(structure);
    const pending = cached ?? layout(graph);
    if (cached === undefined) layouts.set(structure, pending);
    void pending.then((result) => {
      if (current) setLaidOut({ key: structure, layout: result });
    });
    return () => {
      current = false;
    };
  }, [graph, structure]);

  // ReactFlow's `nodes` and `edges` props take mutable arrays; the memos are never changed here.
  const nodes = useMemo<(StoryFlowNode | InitialFlowNode | FinalFlowNode)[]>(() => {
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
          focused: focus === id,
        },
        draggable: false,
      })),
      {
        id: INITIAL_ID,
        type: 'initial',
        position: position(INITIAL_ID),
        data: {},
        draggable: false,
        selectable: false,
      },
      ...(endsOf(graph).length > 0
        ? [
            {
              id: FINAL_ID,
              type: 'final',
              position: position(FINAL_ID),
              data: {},
              draggable: false,
              selectable: false,
            } satisfies FinalFlowNode,
          ]
        : []),
    ];
  }, [graph, laidOut, teams, visits, focus]);

  const focusAt = focus === undefined ? undefined : laidOut?.layout.nodes.get(focus);
  const focusCenter =
    focusAt === undefined
      ? undefined
      : { x: focusAt.x + NODE_WIDTH / 2, y: focusAt.y + NODE_HEIGHT / 2 };

  // An edge to a node that does not exist (reported by `graphProblems`) is left out, like in
  // `layout`; React Flow would log an error on every render otherwise.
  const edges = useMemo<RouteEdge[]>(
    () =>
      [
        ...graph.order.flatMap((id) =>
          graph.nodes[id]!.choices.flatMap((choice, index): readonly RouteEdge[] => {
            if (!Object.hasOwn(graph.nodes, choice.target)) return [];
            const route = laidOut?.layout.edges.get(edgeId(id, index));
            return [
              {
                id: edgeId(id, index),
                type: 'route',
                source: id,
                target: choice.target,
                markerEnd: ARROW_HEAD,
                data: {
                  points: route?.points ?? [],
                  text: choice.label,
                  qr: choice.code !== undefined,
                  ...(route?.label === undefined ? {} : { label: route.label }),
                  // Paths the start never takes are dimmed.
                  dimmed: choice.available === false || !graph.nodes[id]!.reached,
                },
                ...(choice.conditional ? { style: { strokeDasharray: '6 4' } } : {}),
              },
            ];
          }),
        ),
        ...(Object.hasOwn(graph.nodes, graph.introNode)
          ? [
              {
                id: INITIAL_EDGE_ID,
                type: 'route',
                source: INITIAL_ID,
                target: graph.introNode,
                markerEnd: ARROW_HEAD,
                data: {
                  points: laidOut?.layout.edges.get(INITIAL_EDGE_ID)?.points ?? [],
                  dimmed: false,
                },
              } satisfies RouteEdge,
            ]
          : []),
        ...startsOf(graph).map((id): RouteEdge => {
          const route = laidOut?.layout.edges.get(loginEdgeId(id));
          return {
            id: loginEdgeId(id),
            type: 'route',
            source: graph.introNode,
            target: id,
            markerEnd: ARROW_HEAD,
            data: {
              points: route?.points ?? [],
              text: LOGIN_LABEL,
              qr: true,
              ...(route?.label === undefined ? {} : { label: route.label }),
              dimmed: !graph.nodes[id]!.reached,
            },
          };
        }),
        ...endsOf(graph).map((id): RouteEdge => ({
          id: finalEdgeId(id),
          type: 'route',
          source: id,
          target: FINAL_ID,
          markerEnd: ARROW_HEAD,
          data: {
            points: laidOut?.layout.edges.get(finalEdgeId(id))?.points ?? [],
            dimmed: !graph.nodes[id]!.reached,
          },
        })),
      ].map((edge: RouteEdge, index) => {
        const color = edgeColor(index, resolved);
        return {
          ...edge,
          markerEnd: { ...ARROW_HEAD, color },
          style: { ...edge.style, stroke: color },
          data: { ...edge.data!, color },
        };
      }),
    [graph, laidOut, resolved],
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
          onNodeClick={(_event, node) => {
            if (node.type === 'story') setOpened(node.id);
          }}
          colorMode={resolved}
          // A focused node sets the view itself.
          fitView={focus === undefined}
          minZoom={0.1}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <FocusView center={focusCenter} inset={inset} />
        </ReactFlow>
      )}
      <BlocksDialog graph={graph} id={opened} onClose={() => setOpened(undefined)} />
    </div>
  );
};
