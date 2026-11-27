import '@xyflow/react/dist/style.css';
import type { GameGraph, GraphNode } from '@gamebook/core';
import { IconFlag, IconWalk } from '@tabler/icons-react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
  type XYPosition,
} from '@xyflow/react';
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

import {
  ARROW_HEAD,
  FinalDot,
  InitialDot,
  RouteEdgeView,
  type FinalFlowNode,
  type InitialFlowNode,
  type RouteEdge,
} from './graph-edges';
import {
  FINAL_ID,
  finalEdgeId,
  INITIAL_ID,
  initialEdgeId,
  layoutBoxes,
  type BoxLayout,
} from './graph-layout';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;
/** Delay in ms, so moving the pointer across the graph does not flash a tooltip on every node. */
const STATE_TOOLTIP_DELAY = 300;

/** Hues of the chapters, in definition order; they repeat after the last one. */
const CHAPTER_HUES = [250, 150, 40, 320, 95, 200] as const;

const chapterHue = (graph: GameGraph, chapter: string | undefined) => {
  const index = graph.chapters.findIndex((known) => known.id === chapter);
  return index < 0 ? undefined : CHAPTER_HUES[index % CHAPTER_HUES.length]!;
};

const chapterFrameId = (id: string) => `chapter:${id}`;

/**
 * Layouts by graph structure, so choosing another start does not lay the graph out again. A
 * module-wide cache that fills up as graphs are shown; it is mutable by design.
 */
const layouts = new Map<string, Promise<BoxLayout>>();

const structureOf = (graph: GameGraph) =>
  graph.order
    .map((id) => {
      const node = graph.nodes[id]!;
      const choices = node.choices.map((choice) => `${choice.target}:${choice.label}`).join(',');
      return `${id}:${node.type}@${node.chapter ?? ''}>${choices}`;
    })
    .join(';')
    // The chapters' frames change the layout too.
    .concat(`|${graph.chapters.map((chapter) => chapter.id).join(',')}`);

const edgeId = (source: string, index: number) => `${source}-${index}`;
const loginEdgeId = (start: string) => `graph:login:${start}`;

/** Teams reach the start by scanning their login code after the intro. */
const LOGIN_LABEL = 'Kód týmu';
const startsOf = (graph: GameGraph) =>
  graph.order.filter((id) => graph.nodes[id]!.type === 'start');
const endsOf = (graph: GameGraph) => graph.order.filter((id) => graph.nodes[id]!.type === 'end');

/**
 * Layered top-down layout; depends only on the nodes and edges, not on the previews. With
 * `grouped`, the nodes of each chapter are laid out inside a box of their own.
 */
const layout = (graph: GameGraph, grouped: boolean): Promise<BoxLayout> => {
  const hasIntro = Object.hasOwn(graph.nodes, graph.introNode);
  return layoutBoxes({
    nodes: graph.order.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: [
      ...graph.order.flatMap((id) =>
        graph.nodes[id]!.choices.map((choice, index) => ({
          id: edgeId(id, index),
          source: id,
          target: choice.target,
          label: choice.label,
        })),
      ),
      ...(hasIntro
        ? startsOf(graph).map((id) => ({
            id: loginEdgeId(id),
            source: graph.introNode,
            target: id,
            label: LOGIN_LABEL,
          }))
        : []),
    ],
    ...(grouped
      ? {
          groups: graph.chapters.map((chapter) => ({
            id: chapter.id,
            members: graph.order.filter((id) => graph.nodes[id]!.chapter === chapter.id),
          })),
        }
      : {}),
    initial: hasIntro ? [graph.introNode] : [],
    final: endsOf(graph),
  });
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

type ChapterFlowNode = Node<
  {
    readonly name: string;
    readonly hue: number;
    /** False for a chapter left out of the teams' results. */
    readonly counts: boolean;
    readonly width: number;
    readonly height: number;
  },
  'chapter'
>;

/**
 * A chapter around its nodes: an outline in the chapter's color on a faint fill, lighter in light
 * mode and darker in dark mode, and its name outside along the left edge, read from the bottom up.
 * The outline of a chapter that does not count towards the result is dashed, and its name says so.
 * ELK lays the nodes of a chapter out inside it, so frames never overlap.
 */
const ChapterFrame = ({
  data: { name, hue, counts, width, height },
}: NodeProps<ChapterFlowNode>) => (
  <div
    className={cn(
      'relative rounded-2xl border-2 bg-white/10 dark:bg-black/10',
      !counts && 'border-dashed',
    )}
    style={{
      width,
      height,
      borderColor: `oklch(0.65 0.14 ${hue} / 0.55)`,
    }}
  >
    <div
      // A name longer than the frame is cut short with an ellipsis; the whole one is in the title.
      className='absolute top-3 right-full mr-2 max-h-[calc(100%-1.5rem)] rotate-180 truncate text-sm font-semibold tracking-wide uppercase [writing-mode:vertical-rl]'
      style={{ color: `oklch(0.55 0.15 ${hue})` }}
      title={counts ? name : `${name}: čas se do výsledku nepočítá`}
    >
      {name}
      {!counts && <span className='font-normal normal-case'> · nepočítá se</span>}
    </div>
  </div>
);
/** All the segments as one text, for a card to shorten as a whole. */
const textOf = (segments: readonly string[]) =>
  segments.filter((block) => block.trim() !== '').join('\n\n');

const NO_PREVIEW = 'Obsah závisí na stavu a tento start sem nevede.';

/** Tells the edges taken by scanning a QR code from the ones taken by a button. */
const SCAN_EDGE_COLOR = {
  light: 'oklch(0.42 0.18 258)',
  dark: 'oklch(0.75 0.14 250)',
} as const;

/** The node a test run stands on: its own border stays, a yellow line goes around it. */
const FOCUSED_CARD = 'outline-1 outline-offset-4 outline-yellow-500';

/** Above the nodes, so an arrow is drawn over the yellow line of its target. */
const FOCUSED_EDGE_Z_INDEX = 1001;

/**
 * Node card: id tag, kind and the text of all its segments, shortened as a whole. The text lines up
 * with the tags' labels rather than their outlines.
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
              'flex size-full cursor-pointer flex-col gap-2.5 overflow-hidden rounded-lg border bg-card p-2.5 text-card-foreground shadow-sm hover:border-foreground',
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
                <Markdown>{textOf(preview.segments)}</Markdown>
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
  const segments = node?.preview?.segments;
  return (
    <Dialog open={id !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[85dvh] flex-col gap-0 sm:max-w-2xl'>
        <DialogHeader className='-mx-4 border-b px-4 pb-4'>
          <DialogTitle className='font-mono'>{node?.id}</DialogTitle>
          <DialogDescription>
            {node?.dynamic === true && segments !== undefined
              ? 'Text závisí na stavu a týmu. Tohle je ukázka pro první příchod a první tým.'
              : 'Všechny bloky v pořadí, v jakém je uvidí hráči.'}
          </DialogDescription>
        </DialogHeader>
        {/* Only the segments scroll, so the title and the close button stay in view. */}
        <div className='-mx-4 -mb-4 flex min-h-0 flex-col gap-4 overflow-y-auto p-4'>
          {segments === undefined ? (
            <em className='text-muted-foreground'>{NO_PREVIEW}</em>
          ) : (
            segments.map((block, index) => (
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

const nodeTypes = {
  story: StoryNodeCard,
  initial: InitialDot,
  final: FinalDot,
  chapter: ChapterFrame,
} as const;

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
    if (!initialized || x === undefined || y === undefined) {
      return;
    }

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
  /** Off, the chapters are not framed and the graph is laid out without them. */
  readonly chapters?: boolean;
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
  chapters: grouped = true,
  className,
}: StoryGraphProps) => {
  const { resolved } = useTheme();
  const [laidOut, setLaidOut] = useState<{ readonly key: string; readonly layout: BoxLayout }>();
  const [opened, setOpened] = useState<string>();

  const structure = useMemo(
    () => `${grouped ? 'grouped:' : ''}${structureOf(graph)}`,
    [graph, grouped],
  );
  useEffect(() => {
    // Flipped by the cleanup so a layout finishing after the graph changed is not applied.
    let current = true;
    const cached = layouts.get(structure);
    const pending = cached ?? layout(graph, grouped);
    if (cached === undefined) {
      layouts.set(structure, pending);
    }

    void pending.then((result) => {
      if (current) {
        setLaidOut({ key: structure, layout: result });
      }
    });
    return () => {
      current = false;
    };
  }, [graph, structure, grouped]);

  // ReactFlow's `nodes` and `edges` props take mutable arrays; the memos are never changed here.
  const nodes = useMemo<
    (StoryFlowNode | InitialFlowNode | FinalFlowNode | ChapterFlowNode)[]
  >(() => {
    const position = (id: string) => laidOut?.layout.nodes.get(id) ?? { x: 0, y: 0 };
    // Empty without grouping: the layout has no chapter boxes then.
    const frames = graph.chapters.flatMap((chapter): readonly ChapterFlowNode[] => {
      const box = laidOut?.layout.groups.get(chapter.id);
      const hue = chapterHue(graph, chapter.id);
      return box === undefined || hue === undefined
        ? []
        : [
            {
              id: chapterFrameId(chapter.id),
              type: 'chapter',
              position: { x: box.x, y: box.y },
              data: {
                name: chapter.name,
                hue,
                counts: chapter.counts,
                width: box.width,
                height: box.height,
              },
              zIndex: -1,
              draggable: false,
              selectable: false,
              focusable: false,
            },
          ];
    });
    return [
      ...frames,
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
            if (!Object.hasOwn(graph.nodes, choice.target)) {
              return [];
            }

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
                id: initialEdgeId(graph.introNode),
                type: 'route',
                source: INITIAL_ID,
                target: graph.introNode,
                markerEnd: ARROW_HEAD,
                data: {
                  points: laidOut?.layout.edges.get(initialEdgeId(graph.introNode))?.points ?? [],
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
      ]
        .map((edge: RouteEdge) =>
          edge.data?.qr === true
            ? {
                ...edge,
                markerEnd: { ...ARROW_HEAD, color: SCAN_EDGE_COLOR[resolved] },
                style: { ...edge.style, stroke: SCAN_EDGE_COLOR[resolved] },
                data: { ...edge.data, color: SCAN_EDGE_COLOR[resolved] },
              }
            : edge,
        )
        .map((edge: RouteEdge) =>
          edge.target === focus && edge.data !== undefined
            ? {
                ...edge,
                zIndex: FOCUSED_EDGE_Z_INDEX,
                data: { ...edge.data, focusTarget: true },
              }
            : edge,
        ),
    [graph, laidOut, resolved, focus],
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
            // A chapter's frame is only a background.
            if (node.type === 'story') {
              setOpened(node.id);
            }
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
