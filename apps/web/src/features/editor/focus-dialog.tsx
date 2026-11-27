import { IconArrowLeft, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

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
 * from, its text, and where it goes. It has no header: it closes by the cross in its top right
 * corner or Esc. Opening a neighbour walks on, and ⌘[ and ⌘] go back and forth along the way
 * walked, as a browser does, or Notion's peek at a row; a button in the top left goes back too.
 */
export const FocusDialog = ({ draft, trail, onTrail, onChange }: FocusDialogProps) => {
  const id = trail?.ids[trail.at];
  const node = draft.nodes.find((candidate) => {
    return candidate.id === id;
  });
  /** The node shown last, still in the dialog while it closes, so its frame is not left empty. */
  const [shown, setShown] = useState<{ readonly draft: Draft; readonly id: string }>();
  if (node !== undefined && (shown?.draft !== draft || shown.id !== node.id)) {
    setShown({ draft, id: node.id });
  }

  // The node gone from under the trail, as by an undo of the page: the trail is left, so it does
  // not open the dialog again when the node comes back.
  useEffect(() => {
    if (trail !== undefined && node === undefined) {
      onTrail(undefined);
    }
  }, [trail, node, onTrail]);

  /** The node opened before this one on the way walked, while it is still in the draft. */
  const previous =
    trail === undefined || trail.at === 0
      ? undefined
      : draft.nodes.find((candidate) => {
          return candidate.id === trail.ids[trail.at - 1];
        });

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
        className='flex h-[min(90vh,960px)] w-[min(1280px,95vw)] max-w-none flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-none'
        // Esc that a field inside takes, to give up the id written or close the note, leaves the
        // dialog open; the editor's commands close before the dialog hears of it.
        onEscapeKeyDown={(event) => {
          const target = event.target instanceof Element ? event.target : undefined;
          if (target?.closest('input[aria-label="Id uzlu"], .cm-divider-note-popover')) {
            event.preventDefault();
          }
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented || trail === undefined || !(event.metaKey || event.ctrlKey)) {
            return;
          }

          if (event.key === '[' || event.key === ']') {
            event.preventDefault();
            onTrail(step(trail, event.key === '[' ? -1 : 1));
          }
        }}
      >
        <DialogTitle className='sr-only'>Uzel {node?.id}</DialogTitle>
        <DialogDescription className='sr-only'>
          Uzel konceptu: odkud se do něj přijde, jeho text a kam vede.
        </DialogDescription>
        <DialogClose asChild>
          <Button
            variant='ghost'
            size='icon-lg'
            title='Zavřít (Esc)'
            aria-label='Zavřít'
            className='absolute top-3 right-3 z-10 [&_svg:not([class*=size-])]:size-6'
          >
            <IconX />
          </Button>
        </DialogClose>
        {previous !== undefined && trail !== undefined && (
          // In the top left corner of the text, past the side panel (20rem in `FocusView`), round
          // as the cross across from it; only when the node was reached from another one here.
          <Button
            variant='ghost'
            size='icon-lg'
            title={`Zpět na uzel ${previous.id} (⌘[)`}
            aria-label='Zpět'
            onClick={() => {
              onTrail(step(trail, -1));
            }}
            className='absolute top-3 left-[calc(20rem+0.75rem)] z-10 [&_svg:not([class*=size-])]:size-6'
          >
            <IconArrowLeft />
          </Button>
        )}
        {node === undefined && shown !== undefined && (
          // Read only while the dialog closes.
          <FocusView
            className='min-h-0 flex-1'
            draft={shown.draft}
            id={shown.id}
            onOpen={() => {}}
          />
        )}
        {node !== undefined && trail !== undefined && (
          <FocusView
            className='min-h-0 flex-1'
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
            onRemove={() => {
              // Closed first: an undo brings the node back, and the dialog would open again.
              onTrail(undefined);
              onChange(removeNode(draft, node.id));
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
