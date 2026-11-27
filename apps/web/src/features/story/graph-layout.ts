import type { XYPosition } from '@xyflow/react';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import ELK from 'elkjs/lib/elk.bundled.js';

/** Filled dot with an arrow into the first nodes, like the initial state of a state machine. */
export const INITIAL_SIZE = 14;
/** Ringed dot the last nodes lead into, like the final state of a state machine. */
export const FINAL_SIZE = 20;

/** Ids of the start dot, the end ring and the edges to and from them, in the layout's results. */
export const INITIAL_ID = 'graph:initial';
export const FINAL_ID = 'graph:final';
export const initialEdgeId = (target: string) => `graph:initial:${target}`;
export const finalEdgeId = (source: string) => `graph:final:${source}`;
/** The end ring of one node, when every end has its own. */
export const finalRingId = (source: string) => `graph:final-ring:${source}`;

/** Room in a group's frame around its nodes; a title, if any, goes outside. */
export const GROUP_PADDING = { top: 20, side: 20, bottom: 20 } as const;

export interface Box extends XYPosition {
  readonly width: number;
  readonly height: number;
}

/** Orthogonal route and label box of an edge, so parallel edges and labels do not overlap. */
export interface EdgeRoute {
  readonly points: readonly XYPosition[];
  readonly label?: Box;
}

export interface BoxLayout {
  /** Top left corners of the nodes, the start dot and the end ring included. */
  readonly nodes: ReadonlyMap<string, XYPosition>;
  readonly edges: ReadonlyMap<string, EdgeRoute>;
  /** Boxes of the groups that have any nodes, by group id. */
  readonly groups: ReadonlyMap<string, Box>;
}

/** A fixed point on a node's border where its edges start or end, e.g. at a choice's button. */
export interface LayoutPort {
  /** Unique among all ports of the layout. */
  readonly id: string;
  /** From the node's top left corner. */
  readonly x: number;
  readonly y: number;
  readonly side: 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
}

export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Where the node's edges attach; without ports ELK picks the points itself. */
  readonly ports?: readonly LayoutPort[];
}

export interface LayoutEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** Text the edge reserves room for, broken into lines by `labelLines`. */
  readonly label?: string;
  /** Off, the label is drawn without an icon, so it takes less room. On by default. */
  readonly labelIcon?: boolean;
  /** Ports of `source` and `target` the edge attaches to. */
  readonly sourcePort?: string;
  readonly targetPort?: string;
}

/** Nodes laid out together inside a box of their own. */
export interface LayoutGroup {
  readonly id: string;
  /** Ids of the nodes inside, in order; a node belongs to one group at most. */
  readonly members: readonly string[];
}

export interface LayoutInput {
  readonly nodes: readonly LayoutNode[];
  /** An edge from or to a node that is not laid out is left out. */
  readonly edges: readonly LayoutEdge[];
  readonly groups?: readonly LayoutGroup[];
  /** Node ids the start dot points at; given, even empty, the dot is laid out. */
  readonly initial?: readonly string[];
  /** Node ids leading into the end ring; the ring is laid out only when some are given. */
  readonly final?: readonly string[];
  /** Ports of the nodes the start dot's edges enter and the end ring's edges leave, by node id. */
  readonly initialPorts?: ReadonlyMap<string, string>;
  readonly finalPorts?: ReadonlyMap<string, string>;
  /** Every node in `final` leads into a ring of its own (`finalRingId`), not into a shared one. */
  readonly finalRings?: 'shared' | 'each';
  /** Where the layers follow each other; down by default. */
  readonly direction?: 'DOWN' | 'RIGHT';
  /** ELK options of this layout over `LAYOUT_OPTIONS`. */
  readonly options?: Readonly<Record<string, string>>;
}

export const elk = new ELK();

/** Longest line of a label, in characters; a longer word keeps its own line. */
const LABEL_LINE_LENGTH = 14;
export const LABEL_LINE_HEIGHT = 14;

/** Words of a label broken into lines, so a long choice stays compact. */
export const labelLines = (text: string): readonly string[] =>
  text.split(' ').reduce<readonly string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last === undefined) {
      return [word];
    }

    return `${last} ${word}`.length <= LABEL_LINE_LENGTH
      ? [...lines.slice(0, -1), `${last} ${word}`]
      : [...lines, word];
  }, []);

/** Room of a label's padding, and of its icon with the padding. */
const LABEL_PADDING = 10;
const LABEL_ICON_ROOM = 24;

/** Rough size of a label, with its icon or without; ELK only needs it to reserve space. */
export const labelSize = (text: string, icon = true) => {
  const lines = labelLines(text);
  return {
    width:
      Math.ceil(Math.max(...lines.map((line) => line.length)) * 7) +
      (icon ? LABEL_ICON_ROOM : LABEL_PADDING),
    height: LABEL_LINE_HEIGHT * lines.length,
  };
};

/**
 * How nodes and edges are spaced and routed. ELK does not pass these down, so a group gets them
 * too; its nodes would otherwise sit closer together than those outside groups.
 */
export const LAYOUT_OPTIONS = {
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
export const flatten = (node: ElkNode): readonly ElkNode[] =>
  (node.children ?? []).flatMap((child) => [child, ...flatten(child)]);

/** Group boxes get ids of their own, so a group may share its id with a node. */
const groupBoxId = (id: string) => `group:${id}`;

/** Orthogonal route and label box ELK computed for an edge. */
const routeOf = (edge: ElkExtendedEdge): EdgeRoute => {
  const section = edge.sections?.[0];
  const label = edge.labels?.[0];
  return {
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
  };
};

/**
 * Layered top-down layout of boxes with orthogonal edges; groups are laid out inside boxes of
 * their own, and the start dot and end ring are added around the nodes when asked for.
 */
export const layoutBoxes = async ({
  nodes,
  edges,
  groups = [],
  initial,
  final = [],
  initialPorts = new Map(),
  finalPorts = new Map(),
  finalRings = 'shared',
  direction = 'DOWN',
  options: extra = {},
}: LayoutInput): Promise<BoxLayout> => {
  const known = new Map(nodes.map((node) => [node.id, node]));
  const grouped = new Set(groups.flatMap((group) => group.members));
  const options = { ...LAYOUT_OPTIONS, 'elk.direction': direction, ...extra };
  const box = ({ id, width, height, ports }: LayoutNode): ElkNode => {
    if (ports === undefined) {
      return { id, width, height };
    }

    return {
      id,
      width,
      height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: ports.map((port) => {
        return {
          id: port.id,
          x: port.x,
          y: port.y,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': port.side },
        };
      }),
    };
  };

  const members = (group: LayoutGroup) =>
    group.members.flatMap((id) => {
      const node = known.get(id);
      return node === undefined ? [] : [box(node)];
    });
  const boxes = groups.flatMap((group) => {
    const children = members(group);
    return children.length === 0 ? [] : [{ id: groupBoxId(group.id), group: group.id, children }];
  });
  const linked = (edge: LayoutEdge) => known.has(edge.source) && known.has(edge.target);
  const starts = (initial ?? []).filter((id) => known.has(id));
  const ends = final.filter((id) => known.has(id));
  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.shapeCoords': 'ROOT',
      'elk.json.edgeCoords': 'ROOT',
      ...options,
    },
    children: [
      ...nodes.filter((node) => !grouped.has(node.id)).map(box),
      ...boxes.map(({ id, children }) => ({
        id,
        layoutOptions: {
          ...options,
          'elk.padding': `[top=${GROUP_PADDING.top},left=${GROUP_PADDING.side},bottom=${GROUP_PADDING.bottom},right=${GROUP_PADDING.side}]`,
        },
        children,
      })),
      ...(initial === undefined
        ? []
        : [{ id: INITIAL_ID, width: INITIAL_SIZE, height: INITIAL_SIZE }]),
      ...(finalRings === 'each'
        ? ends.map((id) => ({ id: finalRingId(id), width: FINAL_SIZE, height: FINAL_SIZE }))
        : []),
      ...(finalRings === 'shared' && ends.length > 0
        ? [{ id: FINAL_ID, width: FINAL_SIZE, height: FINAL_SIZE }]
        : []),
    ],
    edges: [
      ...starts.map((id) => ({
        id: initialEdgeId(id),
        sources: [INITIAL_ID],
        targets: [initialPorts.get(id) ?? id],
      })),
      ...edges.filter(linked).map((edge) => ({
        id: edge.id,
        sources: [edge.sourcePort ?? edge.source],
        targets: [edge.targetPort ?? edge.target],
        ...(edge.label === undefined
          ? {}
          : { labels: [{ text: edge.label, ...labelSize(edge.label, edge.labelIcon ?? true) }] }),
      })),
      ...ends.map((id) => ({
        id: finalEdgeId(id),
        sources: [finalPorts.get(id) ?? id],
        targets: [finalRings === 'each' ? finalRingId(id) : FINAL_ID],
      })),
    ],
  };
  const result = await elk.layout(input);
  const all = flatten(result);
  const groupOf = new Map(boxes.map(({ id, group }) => [id, group]));
  return {
    nodes: new Map(
      all
        .filter((child) => !groupOf.has(child.id))
        .map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
    ),
    groups: new Map(
      all.flatMap((child) => {
        const group = groupOf.get(child.id);
        return group === undefined
          ? []
          : [
              [
                group,
                {
                  x: child.x ?? 0,
                  y: child.y ?? 0,
                  width: child.width ?? 0,
                  height: child.height ?? 0,
                },
              ] as const,
            ];
      }),
    ),
    // With the edges of the nested nodes too: ELK may move an edge into the box it stays in.
    edges: new Map(
      [result, ...all].flatMap((node) => node.edges ?? []).map((edge) => [edge.id, routeOf(edge)]),
    ),
  };
};
