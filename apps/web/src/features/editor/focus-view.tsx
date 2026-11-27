import { IconArrowLeft, IconArrowRight, IconNote } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { incoming, type Draft, type DraftNode, type DraftSegment } from './draft';
import { NEXT_LABEL } from './draft-node-card';
import { SegmentEditor } from './segment-editor';

/** A choice's text as the players see it, quoted, or the plain arrow. */
const ChoiceName = ({ label }: { readonly label: string }) =>
  label === '' ? (
    <span className='text-muted-foreground'>{NEXT_LABEL}</span>
  ) : (
    <span>„{label}“</span>
  );

/** A neighbour to open: its summary, and the choice that links it with the open node. */
const Neighbour = ({
  summary,
  label,
  side,
  onClick,
}: {
  readonly summary: string;
  readonly label: string;
  readonly side: 'from' | 'to';
  readonly onClick: () => void;
}) => (
  <button
    type='button'
    onClick={onClick}
    className={cn(
      'flex w-full flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent',
      side === 'from' ? 'items-end text-right' : 'items-start text-left',
    )}
  >
    <span className='flex items-center gap-1.5 text-xs'>
      {side === 'from' && <IconArrowLeft className='size-3.5 text-muted-foreground' />}
      <ChoiceName label={label} />
      {side === 'to' && <IconArrowRight className='size-3.5 text-muted-foreground' />}
    </span>
    <span className='leading-snug font-medium'>{summary}</span>
  </button>
);

const Column = ({ title, children }: { readonly title: string; readonly children: ReactNode }) => (
  <aside className='flex min-w-0 flex-col gap-2 overflow-y-auto'>
    <h2 className='text-xs font-medium text-muted-foreground uppercase'>{title}</h2>
    {children}
  </aside>
);

export interface FocusViewProps {
  readonly draft: Draft;
  /** The node in focus. */
  readonly id: string;
  /** Opens a neighbour in focus instead. */
  readonly onOpen: (id: string) => void;
  readonly onChange?: (node: DraftNode) => void;
  readonly className?: string;
}

/**
 * One node over the whole screen to write in: the nodes leading here on the left, the text in the
 * middle, where its choices lead on the right. Opening a neighbour reads the story like a book.
 */
export const FocusView = ({ draft, id, onOpen, onChange, className }: FocusViewProps) => {
  const node = draft.nodes.find((candidate) => {
    return candidate.id === id;
  });
  if (node === undefined) {
    return null;
  }

  const summaryOf = (target: string) =>
    draft.nodes.find((candidate) => {
      return candidate.id === target;
    })?.summary ?? target;
  const from = incoming(draft, id);
  const change = (segments: readonly DraftSegment[]) => {
    onChange?.({ ...node, segments });
  };

  return (
    <div
      className={cn(
        'grid h-full grid-cols-[minmax(10rem,1fr)_minmax(0,42rem)_minmax(10rem,1fr)] gap-8',
        className,
      )}
    >
      <Column title='Odkud'>
        {from.length === 0 && <p className='text-sm text-muted-foreground'>Tady příběh začíná.</p>}
        {from.map(({ from: source, choice, index }) => (
          <Neighbour
            key={`${source.id}-${index}`}
            summary={source.summary}
            label={choice.label}
            side='from'
            onClick={() => {
              onOpen(source.id);
            }}
          />
        ))}
      </Column>
      <main className='flex min-w-0 flex-col gap-4 overflow-y-auto pb-16'>
        <header className='flex flex-col gap-1'>
          <span className='font-mono text-xs text-muted-foreground'>{node.id}</span>
          <h1 className='text-xl leading-snug font-semibold'>{node.summary}</h1>
        </header>
        {node.note !== undefined && (
          <p className='flex gap-2 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-line text-muted-foreground'>
            <IconNote className='mt-0.5 size-4 shrink-0' />
            {node.note}
          </p>
        )}
        {/* Keyed by the node, so its undo history does not reach into the node opened before. */}
        <SegmentEditor key={node.id} value={node.segments} onChange={change} autoFocus />
        <div className='flex flex-col gap-1.5 border-t pt-4'>
          {node.choices.map((choice, index) => (
            <div
              key={`${choice.to}-${index}`}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm',
                choice.label === '' && 'text-muted-foreground',
              )}
            >
              {choice.label === '' ? NEXT_LABEL : choice.label}
            </div>
          ))}
          {node.choices.length === 0 && (
            <p className='text-sm text-muted-foreground'>Konec příběhu, uzel nemá volby.</p>
          )}
        </div>
      </main>
      <Column title='Kam'>
        {node.choices.map((choice, index) => (
          <Neighbour
            key={`${choice.to}-${index}`}
            summary={summaryOf(choice.to)}
            label={choice.label}
            side='to'
            onClick={() => {
              onOpen(choice.to);
            }}
          />
        ))}
      </Column>
    </div>
  );
};
