import { IconArrowLeft, IconArrowRight, IconTrash, IconX } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

import type { Draft } from './draft';
import { removeNode } from './draft-edit';
import { RemoveButton } from './draft-node-card';
import { goTo, renameInTrail, step, type FocusTrail } from './focus-trail';
import { FocusView } from './focus-view';

export interface FocusDialogProps {
  readonly draft: Draft;
  /** Closed without a trail. */
  readonly trail: FocusTrail | undefined;
  readonly onTrail: (trail: FocusTrail | undefined) => void;
  /** `field` names what was typed into, so the keystrokes into one field make one step. */
  readonly onChange: (draft: Draft, field?: string) => void;
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
          {node !== undefined && (
            <RemoveButton
              title='Smazat uzel'
              question={`Smazat uzel ${node.id}?`}
              detail='Volby, které do něj vedou, se smažou taky. Vrátit to jde tlačítkem Zpět.'
              onConfirm={() => {
                // Closed first: an undo brings the node back, and the dialog would open again.
                onTrail(undefined);
                onChange(removeNode(draft, node.id));
              }}
            >
              <IconTrash className='size-4' />
            </RemoveButton>
          )}
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
            opening={trail.at}
            onRename={(from, to) => {
              onTrail(renameInTrail(trail, from, to));
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
