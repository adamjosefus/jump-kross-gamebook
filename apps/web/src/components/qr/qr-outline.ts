import type { QrRun } from './qr-svg';

/** A corner of the module grid: column and row, from the top left corner. */
export type GridPoint = readonly [number, number];

/** Edge directions on the grid with y down, clockwise: a right turn adds one. */
const STEPS: readonly GridPoint[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

interface GridEdge {
  readonly from: GridPoint;
  readonly direction: number;
}

/**
 * Outlines of the dark modules: one closed polygon per shape and per hole, with corners only where
 * the outline turns. Modules sharing a side belong to one shape; modules touching only at a corner
 * stay separate shapes. Shapes run clockwise and holes counterclockwise (y down), so the default
 * nonzero fill rule leaves the holes empty.
 */
export const qrOutlines = (
  size: number,
  runs: readonly QrRun[],
): readonly (readonly GridPoint[])[] => {
  const darkCells = new Set(
    runs.flatMap(({ column, row, length }) =>
      [...Array(length).keys()].map((offset) => row * size + column + offset),
    ),
  );
  const dark = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < size && row < size && darkCells.has(row * size + column);

  // Every side between a dark and a light module, directed so that the dark one is on its right.
  const edges: readonly GridEdge[] = [...darkCells].flatMap((cell) => {
    const column = cell % size;
    const row = Math.floor(cell / size);
    const sides: readonly (GridEdge | false)[] = [
      !dark(column, row - 1) && { from: [column, row], direction: 0 },
      !dark(column + 1, row) && { from: [column + 1, row], direction: 1 },
      !dark(column, row + 1) && { from: [column + 1, row + 1], direction: 2 },
      !dark(column - 1, row) && { from: [column, row + 1], direction: 3 },
    ];
    return sides.filter((edge): edge is GridEdge => edge !== false);
  });

  const key = ([column, row]: GridPoint, direction: number) =>
    (row * (size + 1) + column) * 4 + direction;
  const byKey = new Map(edges.map((edge) => [key(edge.from, edge.direction), edge]));
  const endOf = ({ from: [column, row], direction }: GridEdge): GridPoint => [
    column + STEPS[direction]![0],
    row + STEPS[direction]![1],
  ];
  // The edge that follows: a right turn first, so shapes touching at a corner are not joined.
  const next = (edge: GridEdge) => {
    const end = endOf(edge);
    return [1, 0, 3]
      .map((turn) => byKey.get(key(end, (edge.direction + turn) % 4)))
      .find((candidate) => candidate !== undefined)!;
  };

  // Walking the edges is a traversal with a visited set, so it is mutable by design.
  const visited = new Set<GridEdge>();
  return edges.flatMap((first) => {
    if (visited.has(first)) return [];
    const corners: GridPoint[] = [];
    let edge = first;
    do {
      visited.add(edge);
      const following = next(edge);
      if (following.direction !== edge.direction) corners.push(endOf(edge));
      edge = following;
    } while (edge !== first);
    return [corners];
  });
};

/** Polygons as one SVG path, each corner written by `point`. */
export const outlinePath = (
  outlines: readonly (readonly GridPoint[])[],
  point: (corner: GridPoint) => string,
) => outlines.map((corners) => `M${corners.map(point).join('L')}Z`).join('');
