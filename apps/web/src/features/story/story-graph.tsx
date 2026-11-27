import '@xyflow/react/dist/style.css';
import type { GameGraph, GraphNode } from '@gamebook/core';
import { IconDirectionSign, IconFlag, IconQrcode, IconWalk } from '@tabler/icons-react';
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
  /** Boxes of the chapters laid out as groups, by chapter id; empty without grouping. */
  readonly chapters: ReadonlyMap<string, Box>;
}

/** Hues of the chapters, in definition order; they repeat after the last one. */
const CHAPTER_HUES = [250, 150, 40, 320, 95, 200] as const;

const chapterHue = (graph: GameGraph, chapter: string | undefined) => {
  const index = graph.chapters.findIndex((known) => known.id === chapter);
  return index < 0 ? undefined : CHAPTER_HUES[index % CHAPTER_HUES.length]!;
};

/** Room in a chapter's frame around its nodes; the title is outside, on the left. */
const CHAPTER_PADDING = { top: 20, side: 20, bottom: 20 } as const;

const chapterFrameId = (id: string) => `chapter:${id}`;

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
      return `${id}:${node.type}@${node.chapter ?? ''}>${choices}`;
    })
    .join(';')
    // The chapters' frames change the layout too.
    .concat(`|${graph.chapters.map((chapter) => chapter.id).join(',')}`);

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
    if (last === undefined) {
      return [word];
    }

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

/**
 * How nodes and edges are spaced and routed. ELK does not pass these down, so a chapter's group
 * gets them too; its nodes would otherwise sit closer together than those outside chapters.
 */
const LAYOUT_OPTIONS = {
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
} as const;

/** Every node of the result, nested ones included; coordinates are absolute (`ROOT`). */
const flatten = (node: ElkNode): readonly ElkNode[] =>
  (node.children ?? []).flatMap((child) => [child, ...flatten(child)]);

/**
 * Layered top-down layout; depends only on the nodes and edges, not on the previews. With
 * `grouped`, the nodes of each chapter are laid out inside a box of their own.
 */
const layout = async (graph: GameGraph, grouped: boolean): Promise<Layout> => {
  const nodeBox = (id: string) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT });
  const inChapter = (id: string) =>
    grouped && graph.chapters.some((chapter) => chapter.id === graph.nodes[id]!.chapter);
  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.shapeCoords': 'ROOT',
      'elk.json.edgeCoords': 'ROOT',
      ...LAYOUT_OPTIONS,
    },
    children: [
      ...graph.order.filter((id) => !inChapter(id)).map(nodeBox),
      ...(grouped
        ? graph.chapters.flatMap((chapter) => {
            const members = graph.order.filter((id) => graph.nodes[id]!.chapter === chapter.id);
            return members.length === 0
              ? []
              : [
                  {
                    id: chapterFrameId(chapter.id),
                    layoutOptions: {
                      ...LAYOUT_OPTIONS,
                      'elk.padding': `[top=${CHAPTER_PADDING.top},left=${CHAPTER_PADDING.side},bottom=${CHAPTER_PADDING.bottom},right=${CHAPTER_PADDING.side}]`,
                    },
                    children: members.map(nodeBox),
                  },
                ];
          })
        : []),
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
  const all = flatten(result);
  const frames = new Set(graph.chapters.map((chapter) => chapterFrameId(chapter.id)));
  return {
    nodes: new Map(
      all
        .filter((child) => !frames.has(child.id))
        .map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
    ),
    chapters: new Map(
      all
        .filter((child) => frames.has(child.id))
        .map((child) => [
          child.id.slice(chapterFrameId('').length),
          {
            x: child.x ?? 0,
            y: child.y ?? 0,
            width: child.width ?? 0,
            height: child.height ?? 0,
          },
        ]),
    ),
    // With the edges of the nested nodes too: ELK may move an edge into the box it stays in.
    edges: new Map(
      [result, ...all]
        .flatMap((node) => node.edges ?? [])
        .map((edge): readonly [string, EdgeRoute] => {
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
    /** Of the label; the theme's text color when missing. */
    readonly color?: string;
    /** The edge leads to the focused node, so its arrow clears a gap in the yellow line. */
    readonly focusTarget?: boolean;
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
      if (previous === undefined) {
        return `M ${point.x} ${point.y}`;
      }

      if (next === undefined) {
        return `L ${point.x} ${point.y}`;
      }

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

/** The short piece across the yellow line of the focused node, where the route's arrow ends. */
const focusLineGap = (points: readonly XYPosition[]) => {
  const end = points.at(-1);
  const previous = points.at(-2);
  if (end === undefined || previous === undefined) {
    return undefined;
  }

  const length = Math.hypot(end.x - previous.x, end.y - previous.y) || 1;
  const along = { x: (end.x - previous.x) / length, y: (end.y - previous.y) / length };
  const middle = {
    x: end.x - along.x * FOCUS_LINE_DISTANCE,
    y: end.y - along.y * FOCUS_LINE_DISTANCE,
  };
  const across = { x: -along.y * FOCUS_LINE_GAP, y: along.x * FOCUS_LINE_GAP };
  return `M ${middle.x - across.x} ${middle.y - across.y} L ${middle.x + across.x} ${middle.y + across.y}`;
};

/** Edge drawn along the route ELK computed, with its label where ELK placed it. */
const RouteEdgeView = ({ data, markerEnd, style }: EdgeProps<RouteEdge>) => {
  if (data === undefined || data.points.length === 0) {
    return null;
  }

  const path = roundedPath(data.points);
  const { label } = data;
  const gap = data.focusTarget === true ? focusLineGap(data.points) : undefined;
  return (
    <>
      {gap !== undefined && (
        <path d={gap} fill='none' stroke='var(--graph-canvas)' strokeWidth={3} />
      )}
      <BaseEdge
        path={path}
        {...(markerEnd === undefined ? {} : { markerEnd })}
        style={{ ...style, opacity: data.dimmed ? 0.3 : 1 }}
      />
      {label !== undefined && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'pointer-events-none absolute overflow-hidden rounded bg-(--graph-canvas) px-1 text-center text-[11px] whitespace-pre text-foreground',
              data.dimmed && 'opacity-30',
            )}
            style={{
              lineHeight: `${LABEL_LINE_HEIGHT}px`,
              color: data.color,
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

/** Tells the edges taken by scanning a QR code from the ones taken by a button. */
const SCAN_EDGE_COLOR = {
  light: 'oklch(0.42 0.18 258)',
  dark: 'oklch(0.75 0.14 250)',
} as const;

/** The node a test run stands on: its own border stays, a yellow line goes around it. */
const FOCUSED_CARD = 'outline-1 outline-offset-4 outline-yellow-500';

/** Distance of that yellow line's middle from the card, and half of the gap an arrow makes in it. */
const FOCUS_LINE_DISTANCE = 4.5;
const FOCUS_LINE_GAP = 9;

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
  const [laidOut, setLaidOut] = useState<{ readonly key: string; readonly layout: Layout }>();
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
      const box = laidOut?.layout.chapters.get(chapter.id);
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
