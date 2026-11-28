import { IconDirectionSign, IconQrcode } from '@tabler/icons-react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type EdgeProps,
  useStoreApi,
  type Node,
  type XYPosition,
} from '@xyflow/react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

import { FINAL_SIZE, INITIAL_SIZE, LABEL_LINE_HEIGHT, labelLines, type Box } from './graph-layout';

/** Radius of the rounded corners where an edge turns. */
const CORNER_RADIUS = 8;

/** Where the line around a focused node is, and the gap an arrow makes in it. */
export interface FocusLine {
  /** Of the line's middle from the card. */
  readonly distance: number;
  /** Half of the gap's length. */
  readonly gap: number;
  /** Of the gap, across the line; wider than the line, so nothing of it shows. */
  readonly width: number;
  /**
   * A CSS number all three are scaled by, e.g. `var(--zoom-out)` to keep the gap as large on the
   * screen at any zoom, like a line that keeps its width; none keeps them in the canvas's units.
   */
  readonly scale?: string;
}

/**
 * The line around a selected or focused card, `outline-offset` of 3 and a width of 1 screen pixel
 * off its ring of 1: the arrows into the card clear a gap in it, as large on the screen at any zoom.
 */
export const SCREEN_FOCUS_LINE: FocusLine = {
  distance: 3.5,
  gap: 9,
  width: 3,
  scale: 'var(--zoom-out, 1)',
};

/**
 * The thin yellow line around a selected or focused card, off its own ring, as `SCREEN_FOCUS_LINE`.
 * Deeper on the light canvas, where a light yellow would fade.
 */
export const SELECTED_OUTLINE =
  'outline-[length:var(--line,1px)] outline-offset-[calc(3*var(--line,1px))] outline-yellow-500 dark:outline-yellow-400';

/**
 * Keeps the lines as wide on the screen at any zoom: `--line` is one screen pixel in the canvas's
 * units, for the cards' outlines, and the edges are as wide. `--zoom-out` is one over the zoom, for
 * what should shrink less than the canvas, like the edges' labels. The arrowheads follow the edges'
 * width. Set on the graph's element, so zooming does not render it again; placed inside
 * `ReactFlow`.
 */
export const ScreenLines = () => {
  const store = useStoreApi();
  useEffect(() => {
    const apply = ({ domNode, transform: [, , zoom] }: ReturnType<typeof store.getState>) => {
      domNode?.style.setProperty('--line', `${1 / zoom}px`);
      domNode?.style.setProperty('--zoom-out', `${1 / zoom}`);
      domNode?.style.setProperty('--xy-edge-stroke-width', `${1 / zoom}`);
      domNode?.style.setProperty('--xy-connectionline-stroke-width', `${1 / zoom}`);
    };

    apply(store.getState());
    return store.subscribe(apply);
  }, [store]);
  return null;
};

export const ARROW_HEAD = { type: MarkerType.Arrow, width: 22, height: 22 } as const;

export type RouteEdge = Edge<
  {
    readonly points: readonly XYPosition[];
    readonly text?: string;
    /** The edge is a QR choice, or a button's; missing, the label has no icon. */
    readonly qr?: boolean;
    readonly label?: Box;
    /** Of the label; the theme's text color when missing. */
    readonly color?: string;
    /** The edge leads to the focused node, so its arrow clears a gap in the line around it. */
    readonly focusTarget?: boolean;
    /** That line, `SCREEN_FOCUS_LINE` by default. */
    readonly focusLine?: FocusLine;
    /**
     * Of the label, for an edge raised over the others: the edge's own layer lies above the labels
     * otherwise, and its line would strike its label through.
     */
    readonly labelZIndex?: number;
    /**
     * Drawn as a Bézier curve from the start to the end, not along the route with right angles;
     * the label sits in the middle of the curve then.
     */
    readonly smooth?: boolean;
    readonly dimmed: boolean;
  },
  'route'
>;

/**
 * SVG path through the points with every turn rounded by a quadratic curve; the radius shrinks to
 * half of a short segment, so two turns close together do not overlap.
 */
export const roundedPath = (points: readonly XYPosition[]) =>
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

/** How far a Bézier edge at least leaves its start downwards before it turns, in pixels. */
const BEZIER_MIN_PULL = 40;

/**
 * A Bézier curve from the route's start to its end, leaving downwards and coming in from above,
 * as edges between the bottom and the top of cards do; the bends between are not followed.
 */
export const bezierPath = (points: readonly XYPosition[]) => {
  const start = points[0];
  const end = points.at(-1);
  if (start === undefined || end === undefined) {
    return '';
  }

  const pull = Math.max(Math.abs(end.y - start.y) / 2, BEZIER_MIN_PULL);
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + pull} ${end.x} ${end.y - pull} ${end.x} ${end.y}`;
};

/**
 * The short piece across the line around the focused node, where the route's arrow ends: a path,
 * and, for a scaled line, the CSS transform that puts the path drawn around the arrow's end there.
 */
export const focusLineGap = (
  points: readonly XYPosition[],
  line: FocusLine = SCREEN_FOCUS_LINE,
): { readonly d: string; readonly transform?: string } | undefined => {
  const end = points.at(-1);
  const previous = points.at(-2);
  if (end === undefined || previous === undefined) {
    return undefined;
  }

  const length = Math.hypot(end.x - previous.x, end.y - previous.y) || 1;
  const along = { x: (end.x - previous.x) / length, y: (end.y - previous.y) / length };
  if (line.scale !== undefined) {
    // Drawn with the arrow coming down to the origin, then turned its way and scaled.
    const turn = Math.atan2(along.y, along.x) - Math.PI / 2;
    return {
      d: `M ${-line.gap} ${-line.distance} L ${line.gap} ${-line.distance}`,
      transform: `translate(${end.x}px, ${end.y}px) rotate(${turn}rad) scale(${line.scale})`,
    };
  }

  const middle = {
    x: end.x - along.x * line.distance,
    y: end.y - along.y * line.distance,
  };
  const across = { x: -along.y * line.gap, y: along.x * line.gap };
  return {
    d: `M ${middle.x - across.x} ${middle.y - across.y} L ${middle.x + across.x} ${middle.y + across.y}`,
  };
};

/** Edge drawn along the route ELK computed, with its label where ELK placed it. */
export const RouteEdgeView = ({ data, markerEnd, style }: EdgeProps<RouteEdge>) => {
  if (data === undefined || data.points.length === 0) {
    return null;
  }

  const smooth = data.smooth === true;
  const path = smooth ? bezierPath(data.points) : roundedPath(data.points);
  const start = data.points[0];
  const end = data.points.at(-1);
  // The curve leaves the route's bends, so its label moves to the curve's middle.
  const label =
    smooth && data.label !== undefined && start !== undefined && end !== undefined
      ? {
          ...data.label,
          x: (start.x + end.x) / 2 - data.label.width / 2,
          y: (start.y + end.y) / 2 - data.label.height / 2,
        }
      : data.label;
  const line = data.focusLine ?? SCREEN_FOCUS_LINE;
  const gap = data.focusTarget === true ? focusLineGap(data.points, line) : undefined;
  return (
    <>
      {gap !== undefined && (
        <path
          d={gap.d}
          fill='none'
          stroke='var(--graph-canvas)'
          strokeWidth={line.width}
          {...(gap.transform === undefined ? {} : { style: { transform: gap.transform } })}
        />
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
              'pointer-events-none absolute overflow-hidden rounded bg-(--graph-canvas) px-1 text-center text-2xs whitespace-pre text-foreground',
              data.dimmed && 'opacity-30',
            )}
            style={{
              lineHeight: `${LABEL_LINE_HEIGHT}px`,
              color: data.color,
              // Moved by `translate` so `scale` keeps it in place: a canvas that sets `--zoom-out`
              // to one over the zoom keeps its labels as large on the screen at any zoom, or with
              // `--edge-label-resistance` below 1 lets them shrink a little with the canvas; and
              // `--edge-label-scale` makes them larger than the room laid out for them.
              translate: `${label.x}px ${label.y}px`,
              scale:
                'calc(pow(var(--zoom-out, 1), var(--edge-label-resistance, 1)) * var(--edge-label-scale, 1))',
              ...(data.labelZIndex === undefined ? {} : { zIndex: data.labelZIndex }),
              width: label.width,
              height: label.height,
            }}
          >
            {data.qr === true && <IconQrcode className='mr-0.5 inline size-3 align-[-2px]' />}
            {data.qr === false && (
              <IconDirectionSign className='mr-0.5 inline size-3 align-[-2px]' />
            )}
            {labelLines(data.text ?? '').join('\n')}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export type InitialFlowNode = Node<Record<string, never>, 'initial'>;

/** The start dot, laid out by `layoutBoxes` with the id `INITIAL_ID`. */
export const InitialDot = () => (
  <div
    title='Start'
    className='rounded-full bg-foreground'
    style={{ width: INITIAL_SIZE, height: INITIAL_SIZE }}
  >
    <Handle type='source' position={Position.Bottom} className='opacity-0' />
  </div>
);

export type FinalFlowNode = Node<Record<string, never>, 'final'>;

/** The end ring, laid out by `layoutBoxes` with the id `FINAL_ID`. */
export const FinalDot = () => (
  <div
    title='Konec'
    className='flex items-center justify-center rounded-full border-2 border-foreground'
    style={{ width: FINAL_SIZE, height: FINAL_SIZE }}
  >
    <div className='size-2.5 rounded-full bg-foreground' />
    <Handle type='target' position={Position.Top} className='opacity-0' />
  </div>
);
