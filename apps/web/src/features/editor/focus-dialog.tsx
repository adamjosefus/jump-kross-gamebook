import { IconArrowLeft, IconArrowRight, IconX } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

import type { Draft, DraftNode } from './draft';
import { goTo, step, type FocusTrail } from './focus-trail';
import { FocusView } from './focus-view';

export interface FocusDialogProps {
  readonly draft: Draft;
  /** Closed without a trail. */
  readonly trail: FocusTrail | undefined;
  readonly onTrail: (trail: FocusTrail | undefined) => void;
  readonly onChange: (node: DraftNode) => void;
}

/**
 * A node in a large dialog over the graph, to read and write it at ease: where the story comes
 * from, its text, and where it goes. Opening a neighbour walks on, and the arrows, or ⌘[ and ⌘],
 * go back and forth along the way walked, as a browser does, or Notion's peek at a row.
 */
export const FocusDialog = ({ draft, trail, onTrail, onChange }: FocusDialogProps) => {
  const id = trail?.ids[trail.at];
  const node = draft.nodes.find((candidate) => {
    return candidate.id === id;
  });
  const back = trail !== undefined && trail.at > 0;
  const forth = trail !== undefined && trail.at < trail.ids.length - 1;

  return (
    <Dialog
      open={node !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onTrail(undefined);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='flex h-[min(90vh,960px)] w-[min(1280px,95vw)] max-w-none flex-col gap-0 bg-background p-0 sm:max-w-none'
        onKeyDown={(event) => {
          if (trail === undefined || !(event.metaKey || event.ctrlKey)) {
            return;
          }

          if (event.key === '[' || event.key === ']') {
            event.preventDefault();
            onTrail(step(trail, event.key === '[' ? -1 : 1));
          }
        }}
      >
        <div className='flex items-center gap-1 border-b px-3 py-2'>
          <Button
            variant='ghost'
            size='icon-sm'
            disabled={!back}
            title='Předchozí uzel (⌘[)'
            aria-label='Předchozí uzel'
            onClick={() => {
              if (trail !== undefined) {
                onTrail(step(trail, -1));
              }
            }}
          >
            <IconArrowLeft />
          </Button>
          <Button
            variant='ghost'
            size='icon-sm'
            disabled={!forth}
            title='Další uzel (⌘])'
            aria-label='Další uzel'
            onClick={() => {
              if (trail !== undefined) {
                onTrail(step(trail, 1));
              }
            }}
          >
            <IconArrowRight />
          </Button>
          <DialogTitle className='ml-2 min-w-0 flex-1 truncate font-mono text-xs font-normal text-muted-foreground'>
            {node?.id}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            Uzel konceptu: odkud se do něj přijde, jeho text a kam vede.
          </DialogDescription>
          <DialogClose asChild>
            <Button variant='ghost' size='icon-sm' title='Zavřít (Esc)' aria-label='Zavřít'>
              <IconX />
            </Button>
          </DialogClose>
        </div>
        {node !== undefined && trail !== undefined && (
          <FocusView
            className='min-h-0 flex-1 p-6'
            draft={draft}
            id={node.id}
            onOpen={(next) => {
              onTrail(goTo(trail, next));
            }}
            onChange={onChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
