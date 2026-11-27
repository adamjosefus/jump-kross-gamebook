import { IconDirectionSign, IconQrcode } from '@tabler/icons-react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type EdgeProps,
  type Node,
  type XYPosition,
} from '@xyflow/react';

import { cn } from '@/lib/utils';

import { FINAL_SIZE, INITIAL_SIZE, LABEL_LINE_HEIGHT, labelLines, type Box } from './graph-layout';

/** Radius of the rounded corners where an edge turns. */
const CORNER_RADIUS = 8;

/**
 * Distance of the focused node's yellow line (`outline-offset-4` of a 1px outline) from the card,
 * and half of the gap an arrow makes in it.
 */
const FOCUS_LINE_DISTANCE = 4.5;
const FOCUS_LINE_GAP = 9;

export const ARROW_HEAD = { type: MarkerType.Arrow, width: 22, height: 22 } as const;

export type RouteEdge = Edge<
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

/** The short piece across the yellow line of the focused node, where the route's arrow ends. */
export const focusLineGap = (points: readonly XYPosition[]) => {
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
export const RouteEdgeView = ({ data, markerEnd, style }: EdgeProps<RouteEdge>) => {
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
