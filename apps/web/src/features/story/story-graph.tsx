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
import { TeamAvatar } from '@/features/teams/team-avatar';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;
/** Filled dot with an arrow into the intro, like the initial state of a state machine. */
const INITIAL_SIZE = 14;

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
const INTRO_ID = 'graph:intro';
const INITIAL_EDGE_ID = 'graph:initial-intro';
const loginEdgeId = (start: string) => `graph:login:${start}`;

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
      { id: INTRO_ID, width: NODE_WIDTH, height: NODE_HEIGHT },
      { id: INITIAL_ID, width: INITIAL_SIZE, height: INITIAL_SIZE },
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
      { id: INITIAL_EDGE_ID, sources: [INITIAL_ID], targets: [INTRO_ID] },
      ...startsOf(graph).map((id) => ({
        id: loginEdgeId(id),
        sources: [INTRO_ID],
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
    readonly dimmed: boolean;
  },
  'route'
>;

/** Edge drawn along the route ELK computed, with its label where ELK placed it. */
const RouteEdgeView = ({ data, markerEnd, style }: EdgeProps<RouteEdge>) => {
  if (data === undefined || data.points.length === 0) return null;
  const path = data.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
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
type IntroFlowNode = Node<
  { readonly intro: GameGraph['intro']; readonly focused: boolean },
  'intro'
>;

const InitialDot = () => (
  <div
    title='Start'
    className='rounded-full bg-foreground'
    style={{ width: INITIAL_SIZE, height: INITIAL_SIZE }}
  >
    <Handle type='source' position={Position.Bottom} className='opacity-0' />
  </div>
);

/** The node a test run stands on. */
const FOCUSED_CARD = 'border-yellow-500 ring-1 ring-yellow-500 hover:border-yellow-500';

/** The intro, which is not a node of the story: everyone sees it before the team's code. */
const IntroCard = ({ data: { intro, focused } }: NodeProps<IntroFlowNode>) => (
  <div className='relative' style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}>
    <Handle type='target' position={Position.Top} className='opacity-0' />
    <div
      className={cn(
        'flex size-full cursor-pointer flex-col gap-2 overflow-hidden rounded-lg border border-foreground/60 bg-card p-3 text-card-foreground shadow-sm hover:border-foreground',
        focused && FOCUSED_CARD,
      )}
    >
      <div className='flex items-center gap-1'>
        <Badge variant='secondary'>Úvod</Badge>
      </div>
      <div className='graph-preview line-clamp-4 text-xs leading-snug text-muted-foreground'>
        {textOf(intro.blocks) === '' ? (
          <em>Úvod nemá text.</em>
        ) : (
          <Markdown>{textOf(intro.blocks)}</Markdown>
        )}
      </div>
    </div>
    <Handle type='source' position={Position.Bottom} className='opacity-0' />
  </div>
);

/** Node card: id tag, kind and the text of all its blocks, shortened as a whole. */
const StoryNodeCard = ({ data: { node, teams, visits, focused } }: NodeProps<StoryFlowNode>) => {
  const preview = node.preview;
  return (
    <div className='relative' style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}>
      <Handle type='target' position={Position.Top} className='opacity-0' />
      <div
        title={preview?.state === undefined ? undefined : JSON.stringify(preview.state, null, 1)}
        className={cn(
          'flex size-full cursor-pointer flex-col gap-2 overflow-hidden rounded-lg border bg-card p-3 text-card-foreground shadow-sm hover:border-foreground',
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
            <em>{NO_PREVIEW}</em>
          ) : (
            <Markdown>{textOf(preview.blocks)}</Markdown>
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
  const blocks = id === INTRO_ID ? graph.intro.blocks : node?.preview?.blocks;
  return (
    <Dialog open={id !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className={node === undefined ? undefined : 'font-mono'}>
            {node?.id ?? 'Úvod'}
          </DialogTitle>
          <DialogDescription>
            {node?.dynamic === true && blocks !== undefined
              ? 'Text závisí na stavu a týmu. Tohle je ukázka pro první příchod a první tým.'
              : 'Všechny bloky v pořadí, v jakém je uvidí hráči.'}
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
};

const nodeTypes = { story: StoryNodeCard, initial: InitialDot, intro: IntroCard } as const;

/** Id of the intro card, for `focus`. */
export const GRAPH_INTRO = INTRO_ID;

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
  /** Node to highlight and move the view to, e.g. where a test run stands; `GRAPH_INTRO` for the intro. */
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
  const nodes = useMemo<(StoryFlowNode | InitialFlowNode | IntroFlowNode)[]>(() => {
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
      {
        id: INTRO_ID,
        type: 'intro',
        position: position(INTRO_ID),
        data: { intro: graph.intro, focused: focus === INTRO_ID },
        draggable: false,
      },
    ];
  }, [graph, laidOut, teams, visits, focus]);

  const focusAt = focus === undefined ? undefined : laidOut?.layout.nodes.get(focus);
  const focusCenter =
    focusAt === undefined
      ? undefined
      : { x: focusAt.x + NODE_WIDTH / 2, y: focusAt.y + NODE_HEIGHT / 2 };

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
      {
        id: INITIAL_EDGE_ID,
        type: 'route',
        source: INITIAL_ID,
        target: INTRO_ID,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          points: laidOut?.layout.edges.get(INITIAL_EDGE_ID)?.points ?? [],
          dimmed: false,
        },
      },
      ...startsOf(graph).map((id): RouteEdge => {
        const route = laidOut?.layout.edges.get(loginEdgeId(id));
        return {
          id: loginEdgeId(id),
          type: 'route',
          source: INTRO_ID,
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
          onNodeClick={(_event, node) => {
            if (node.id !== INITIAL_ID) setOpened(node.id);
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
