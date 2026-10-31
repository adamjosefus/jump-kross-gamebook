import { mermaidId, toMermaid, type GameGraph } from '@gamebook/core';
import { mount, register, type Mounted } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import { useEffect, useEffectEvent, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

register(flowchart);

export interface StoryGraphProps {
  readonly graph: GameGraph;
  /** Nodes to emphasise, e.g. where teams currently are. */
  readonly highlight?: readonly string[];
  readonly onNodeClick?: (nodeId: string) => void;
  readonly className?: string;
}

/** The story as a Mermaid flowchart rendered by pele. Keeps the last good picture on errors. */
export const StoryGraph = ({ graph, highlight = [], onNodeClick, className }: StoryGraphProps) => {
  const element = useRef<HTMLDivElement>(null);
  const mounted = useRef<Mounted>(undefined);
  const nodeClicked = useEffectEvent((id: string) => onNodeClick?.(id));

  const text = useMemo(() => {
    const base = toMermaid(graph);
    const present = highlight.filter((id) => Object.hasOwn(graph.nodes, id));
    return present.length === 0
      ? base
      : `${base}\n  classDef here fill:#737373,color:#fff,stroke:#737373,stroke-width:3px\n  class ${present.map(mermaidId).join(',')} here`;
  }, [graph, highlight]);

  useEffect(() => {
    const target = element.current;
    if (target === null) return;
    if (mounted.current === undefined) {
      mounted.current = mount(target, text, {
        zoom: { always: true, controls: true },
        onError: () => undefined,
      });
    } else {
      mounted.current.update(text);
    }
  }, [text]);

  useEffect(() => () => mounted.current?.destroy(), []);

  // Map clicks on rendered nodes (`data-id="n_<id>"`) back to gamebook node ids.
  useEffect(() => {
    const target = element.current;
    if (target === null) return undefined;
    const listener = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const hit = event.target.closest('[data-id^="n_"]');
      const id = hit?.getAttribute('data-id')?.slice(2);
      if (id !== undefined && Object.hasOwn(graph.nodes, id)) nodeClicked(id);
    };
    target.addEventListener('click', listener);
    return () => target.removeEventListener('click', listener);
  }, [graph]);

  return (
    <div
      ref={element}
      className={cn(
        'story-graph size-full overflow-hidden [&_[data-id^=n_]]:cursor-pointer',
        className,
      )}
    />
  );
};
