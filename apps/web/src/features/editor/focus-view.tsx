import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconChevronDown,
  IconChevronUp,
  IconNote,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { useRef, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  draftNodeId,
  incoming,
  NEXT_LABEL,
  SAME_LABEL_WARNING,
  sameLabelChoices,
  type Draft,
  type DraftNode,
} from './draft';
import {
  linkChoice,
  moveChoice,
  removeChoice,
  renameNode,
  updateNode,
  withNote,
} from './draft-edit';
import { IdField, RemoveButton } from './draft-node-card';
import { SegmentEditor } from './segment-editor';
import { tagColor, type TagColor } from './tag-colors';

/** A node's id as a tag in its color, as on its card. */
const IdTag = ({ id, color }: { readonly id: string; readonly color: TagColor | undefined }) => (
  <span
    className={cn(
      'max-w-full shrink-0 truncate rounded px-1.5 font-mono text-[11px] leading-5 font-semibold',
      color?.tag ?? 'bg-muted',
    )}
  >
    {id}
  </span>
);

/** A choice's text as the players see it, quoted, or the plain arrow. */
const ChoiceName = ({ label, invalid }: { readonly label: string; readonly invalid?: boolean }) => {
  if (label === '') {
    return (
      <span className={invalid === true ? 'text-destructive' : 'text-muted-foreground'}>
        {NEXT_LABEL}
      </span>
    );
  }

  return <span className={cn(invalid === true && 'text-destructive')}>„{label}“</span>;
};

/** A neighbour to open: its summary, and the choice that links it with the open node. */
const Neighbour = ({
  id,
  color,
  summary,
  label,
  side,
  invalid,
  onClick,
}: {
  readonly id: string;
  readonly color: TagColor | undefined;
  readonly summary: string;
  readonly label: string;
  readonly side: 'from' | 'to';
  /** Another choice of the same node has this text too. */
  readonly invalid?: boolean;
  readonly onClick: () => void;
}) => (
  <button
    type='button'
    onClick={onClick}
    className={cn(
      'flex w-full flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent',
      side === 'from' ? 'items-end text-right' : 'items-start text-left',
      invalid === true && 'border-destructive',
    )}
    title={invalid === true ? SAME_LABEL_WARNING : undefined}
  >
    <span className='flex items-center gap-1.5 text-xs'>
      {side === 'from' && <IconArrowLeft className='size-3.5 text-muted-foreground' />}
      <ChoiceName label={label} {...(invalid === undefined ? {} : { invalid })} />
      {side === 'to' && <IconArrowRight className='size-3.5 text-muted-foreground' />}
    </span>
    <IdTag id={id} color={color} />
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
  /**
   * Without it the node is only read. `field` names what was typed into, so that the keystrokes
   * into one field make one step of the history.
   */
  readonly onChange?: (draft: Draft, field?: string) => void;
  /** The open node got another id, by hand or after its summary. */
  readonly onRename?: (from: string, to: string) => void;
  /**
   * Which opening of a node this is: a new value starts the text editor anew, with its own undo,
   * while a rename keeps it. The node's id by default, which a rename changes.
   */
  readonly opening?: string | number;
  readonly className?: string;
}

/** A text field without a frame that grows with its text; read-only without `onChange`. */
const Field = ({
  value,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  className,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: ((value: string) => void) | undefined;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly className?: string;
}) => (
  <textarea
    rows={1}
    value={value}
    placeholder={placeholder}
    readOnly={onChange === undefined}
    onChange={(event) => {
      onChange?.(event.target.value);
    }}
    {...(onFocus === undefined ? {} : { onFocus })}
    {...(onBlur === undefined ? {} : { onBlur })}
    className={cn(
      '[field-sizing:content] w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/60',
      className,
    )}
  />
);

/** A small button that moves a choice a place up or down. */
const MoveButton = ({
  title,
  disabled,
  onClick,
  children,
}: {
  readonly title: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) => (
  <button
    type='button'
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className='rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30'
  >
    {children}
  </button>
);

/** The look of a field to write in: framed, with a ring while it is written in. */
const FIELD_BOX =
  'rounded-lg border bg-card px-3 py-2 transition-[border-color,box-shadow] hover:border-foreground/30 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40';

/** A part of the node to write, named above it. */
const Part = ({ title, children }: { readonly title: string; readonly children: ReactNode }) => (
  // A label, so a click on the name goes into the field.
  <label className='flex flex-col gap-1.5'>
    <span className='text-xs font-medium text-muted-foreground uppercase'>{title}</span>
    {children}
  </label>
);

/**
 * One node over the whole screen, the place to write it: the nodes leading here on the left, its
 * summary, note, text with the segments' themes and its choices in the middle, where the choices
 * lead on the right. Opening a neighbour reads the story like a book.
 */
export const FocusView = ({
  draft,
  id,
  onOpen,
  onChange,
  onRename,
  opening = id,
  className,
}: FocusViewProps) => {
  /**
   * The id follows the summary being written: in a new node, from when its empty summary is
   * entered till it is left, as the id of a new node is made from its summary.
   */
  const following = useRef(false);
  const node = draft.nodes.find((candidate) => {
    return candidate.id === id;
  });
  if (node === undefined) {
    return null;
  }

  const others = new Set(
    draft.nodes.flatMap((other) => {
      return other.id === id ? [] : [other.id];
    }),
  );
  /** The open node renamed, its choices in other nodes too, and the history step named. */
  const rename = (changed: Draft, to: string, field?: string) => {
    onChange?.(renameNode(changed, id, to), field);
    if (to !== id) {
      onRename?.(id, to);
    }
  };

  /** A node's color, of its id's tag, as on the canvas. */
  const colorOf = (target: string) => {
    const index = draft.nodes.findIndex((candidate) => {
      return candidate.id === target;
    });
    return index < 0 ? undefined : tagColor(index);
  };

  const summaryOf = (target: string) =>
    draft.nodes.find((candidate) => {
      return candidate.id === target;
    })?.summary ?? target;
  const from = incoming(draft, id);
  const sameLabel = sameLabelChoices(node.choices);
  /** A change of the open node, as a step of the history named by `field`. */
  const edit =
    onChange === undefined
      ? undefined
      : (field: string, change: (current: DraftNode) => DraftNode) => {
          onChange(updateNode(draft, id, change), `focus:${id}:${field}`);
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
            id={source.id}
            color={colorOf(source.id)}
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
        <header className='flex flex-col items-start gap-1'>
          {onChange === undefined ? (
            <IdTag id={node.id} color={colorOf(id)} />
          ) : (
            <IdField
              id={node.id}
              color={colorOf(id)}
              className='font-mono text-xs'
              onId={(typed) => {
                following.current = false;
                rename(draft, draftNodeId(typed, others));
              }}
            />
          )}
        </header>
        <Part title='Shrnutí'>
          <div className={FIELD_BOX}>
            <Field
              value={node.summary}
              placeholder='Co se v uzlu stane, jednou větou'
              onFocus={() => {
                following.current = node.summary === '' && node.id === draftNodeId('', others);
              }}
              onBlur={() => {
                following.current = false;
              }}
              onChange={
                edit &&
                ((summary) => {
                  if (following.current) {
                    rename(
                      updateNode(draft, id, (current) => ({ ...current, summary })),
                      draftNodeId(summary, others),
                      // One step of the history while the id follows, though it changes each time.
                      'focus:following-summary',
                    );
                    return;
                  }

                  edit('summary', (current) => ({ ...current, summary }));
                })
              }
              className='w-full text-lg leading-snug font-semibold'
            />
          </div>
        </Part>
        <Part title='Poznámka pro převod'>
          <div className={cn('flex gap-2 text-sm text-muted-foreground', FIELD_BOX)}>
            <IconNote className='mt-0.5 size-4 shrink-0' />
            <Field
              value={node.note ?? ''}
              placeholder='Podmínky, stav, QR kód místo tlačítek…'
              onChange={
                edit &&
                ((note) => {
                  edit('note', (current) => withNote(current, note));
                })
              }
              className='whitespace-pre-line'
            />
          </div>
        </Part>
        <div className='flex flex-col gap-1.5'>
          <span className='text-xs font-medium text-muted-foreground uppercase'>Text</span>
          <div className={cn('flex px-4 py-3', FIELD_BOX)}>
            {/* Keyed by the opening, so its undo history does not reach into the node opened
              before, and a rename while the summary is written does not start it anew. */}
            <SegmentEditor
              key={opening}
              value={node.segments}
              {...(edit === undefined
                ? { readOnly: true }
                : {
                    onChange: (segments) => {
                      edit('segments', (current) => ({ ...current, segments }));
                    },
                  })}
              autoFocus
              // Room to write from the start, not one line.
              className='min-h-64 flex-1'
            />
          </div>
        </div>
        <div className='flex flex-col gap-1.5'>
          <span className='text-xs font-medium text-muted-foreground uppercase'>Volby</span>
          {node.choices.map((choice, index) => {
            const invalid = sameLabel.has(index);
            return (
              <div
                // The choices have no ids; their order is all there is.
                key={index}
                className={cn(
                  'flex items-center gap-2 rounded-md border py-1 pr-1 pl-3 text-sm',
                  invalid && 'border-destructive',
                )}
                title={invalid ? SAME_LABEL_WARNING : undefined}
              >
                <input
                  value={choice.label}
                  placeholder={NEXT_LABEL}
                  readOnly={edit === undefined}
                  aria-label={`Text volby ${index + 1}`}
                  aria-invalid={invalid || undefined}
                  onChange={(event) => {
                    const label = event.target.value;
                    edit?.(`choice:${index}`, (current) => ({
                      ...current,
                      choices: current.choices.map((other, at) =>
                        at === index ? { ...other, label } : other,
                      ),
                    }));
                  }}
                  className={cn(
                    'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
                    invalid && 'text-destructive placeholder:text-destructive/70',
                  )}
                />
                {invalid && <IconAlertTriangle className='size-4 shrink-0 text-destructive' />}
                {/* Where the choice leads, so buttons of the same text can be told apart. */}
                <button
                  type='button'
                  onClick={() => {
                    onOpen(choice.to);
                  }}
                  title={`Otevřít uzel ${choice.to}`}
                  className='flex max-w-[60%] min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground'
                >
                  <IconArrowRight className='size-3.5 shrink-0' />
                  <span className='truncate'>{summaryOf(choice.to)}</span>
                  <IdTag id={choice.to} color={colorOf(choice.to)} />
                </button>
                {onChange !== undefined && (
                  // The order of the buttons the players see, changed only here.
                  <span className='flex'>
                    <MoveButton
                      title='Posunout volbu výš'
                      disabled={index === 0}
                      onClick={() => {
                        onChange(moveChoice(draft, id, index, -1));
                      }}
                    >
                      <IconChevronUp className='size-3.5' />
                    </MoveButton>
                    <MoveButton
                      title='Posunout volbu níž'
                      disabled={index === node.choices.length - 1}
                      onClick={() => {
                        onChange(moveChoice(draft, id, index, 1));
                      }}
                    >
                      <IconChevronDown className='size-3.5' />
                    </MoveButton>
                  </span>
                )}
                {onChange !== undefined && (
                  <RemoveButton
                    title='Smazat volbu'
                    question={`Smazat volbu ${index + 1}?`}
                    detail={`Vede do uzlu ${choice.to}; ten zůstane.`}
                    onConfirm={() => {
                      onChange(removeChoice(draft, id, index));
                    }}
                  >
                    <IconX className='size-3.5' />
                  </RemoveButton>
                )}
              </div>
            );
          })}
          {node.choices.length === 0 && (
            <p className='text-sm text-muted-foreground'>Konec příběhu, uzel nemá volby.</p>
          )}
          {onChange !== undefined && (
            <Button
              variant='outline'
              size='sm'
              className='self-start'
              onClick={() => {
                // A choice into a new node, and the new node opened to be written.
                const next = linkChoice(draft, id, 'new');
                onChange(next.draft);
                onOpen(next.target);
              }}
            >
              <IconPlus /> Přidat následující uzel
            </Button>
          )}
        </div>
      </main>
      <Column title='Kam'>
        {node.choices.map((choice, index) => (
          <Neighbour
            key={`${choice.to}-${index}`}
            id={choice.to}
            color={colorOf(choice.to)}
            summary={summaryOf(choice.to)}
            label={choice.label}
            side='to'
            invalid={sameLabel.has(index)}
            onClick={() => {
              onOpen(choice.to);
            }}
          />
        ))}
      </Column>
    </div>
  );
};
