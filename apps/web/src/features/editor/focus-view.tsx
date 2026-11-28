import { THEMES, type Theme } from '@gamebook/core';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconArrowsJoin,
  IconArrowsSplit,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconGripVertical,
  IconHash,
  IconNote,
  IconPencil,
  IconPlus,
  IconSquareRoundedPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useRef, useState, type ComponentType, type DragEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import {
  draftNodeId,
  isNewNodeId,
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
import { RemoveButton } from './draft-node-card';
import { SegmentEditor } from './segment-editor';
import { tagColor, type TagColor } from './tag-colors';

/** A node's id as a tag in its color, as on its card. */
const IdTag = ({
  id,
  color,
  quiet = false,
}: {
  readonly id: string;
  readonly color: TagColor | undefined;
  /** Grey till the pointer is over the part it is in, `group/from`. */
  readonly quiet?: boolean;
}) => (
  <span
    className={cn(
      quiet && 'grayscale transition-[filter] group-hover/from:grayscale-0',
      // A block of its own, so it is as high wherever it sits, in a flex row or in a button.
      'inline-block max-w-full shrink-0 truncate rounded-md px-2 py-0.5 align-middle font-mono text-xs leading-4 font-semibold',
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

/** A node leading here, to open, on one line: the choice that leads here and the node's id. */
const Source = ({
  id,
  color,
  summary,
  label,
  onClick,
}: {
  readonly id: string;
  readonly color: TagColor | undefined;
  readonly summary: string;
  readonly label: string;
  readonly onClick: () => void;
}) => (
  <button
    type='button'
    onClick={onClick}
    title={`Otevřít uzel ${id}: ${summary}`}
    className='flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-card px-2 text-left text-sm hover:bg-accent'
  >
    <span className='min-w-0 flex-1 truncate'>
      <ChoiceName label={label} />
    </span>
    <IdTag id={id} color={color} quiet />
  </button>
);

/**
 * The node's id as its tag, with a pencil to write it over: the field takes it when confirmed by
 * its tick or Enter, Esc leaves it as it was.
 */
const IdEditor = ({
  id,
  color,
  onId,
}: {
  readonly id: string;
  readonly color: TagColor | undefined;
  readonly onId: ((id: string) => void) | undefined;
}) => {
  const [typed, setTyped] = useState<string>();
  if (typed === undefined || onId === undefined) {
    return (
      <div className='flex items-center gap-1'>
        <IdTag id={id} color={color} />
        {onId !== undefined && (
          <Button
            variant='ghost'
            size='icon-xs'
            title='Upravit id'
            aria-label='Upravit id'
            onClick={() => {
              setTyped(id);
            }}
          >
            <IconPencil />
          </Button>
        )}
      </div>
    );
  }

  const confirm = () => {
    if (typed.trim() !== '' && typed !== id) {
      onId(typed);
    }

    setTyped(undefined);
  };

  return (
    <form
      className='flex items-center gap-1'
      onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}
    >
      <input
        // Written in as soon as the pencil is clicked.
        autoFocus
        value={typed}
        aria-label='Id uzlu'
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // Only the field gives up, not the dialog around it.
            event.stopPropagation();
            setTyped(undefined);
          }
        }}
        className='min-w-0 flex-1 rounded-md border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-ring'
      />
      <Button
        type='submit'
        variant='ghost'
        size='icon-xs'
        title='Potvrdit id'
        aria-label='Potvrdit id'
      >
        <IconCheck />
      </Button>
    </form>
  );
};

/** Where a dragged choice lands: before the row under the pointer, or after it past its middle. */
const dropIndex = (event: DragEvent<HTMLElement>, index: number) => {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2 ? index + 1 : index;
};

/**
 * The choices, a line each: a handle to drag the choice to another place in the order, its text
 * and the tag of the node it leads to, which open that node, and a bin to remove the choice. The
 * texts are written in `ChoiceButtons`, under the node's text.
 */
const ChoiceList = ({
  node,
  colorOf,
  summaryOf,
  onMove,
  onRemove,
  onOpen,
}: {
  readonly node: DraftNode;
  readonly colorOf: (id: string) => TagColor | undefined;
  readonly summaryOf: (id: string) => string;
  readonly onMove: ((index: number, offset: number) => void) | undefined;
  readonly onRemove: ((index: number) => void) | undefined;
  readonly onOpen: (id: string) => void;
}) => {
  /** The choice dragged now, and where it would land. */
  const [drag, setDrag] = useState<{ readonly from: number; readonly to: number }>();
  const sameLabel = sameLabelChoices(node.choices);
  const movable = onMove !== undefined && node.choices.length > 1;
  return (
    <div className='flex flex-col gap-1'>
      {node.choices.map((choice, index) => {
        const invalid = sameLabel.has(index);
        return (
          <div
            // The choices have no ids; their order is all there is.
            key={index}
            className={cn('relative flex flex-col gap-1', drag?.from === index && 'opacity-40')}
            onDragOver={(event) => {
              if (drag === undefined) {
                return;
              }

              event.preventDefault();
              const to = dropIndex(event, index);
              if (to !== drag.to) {
                setDrag({ ...drag, to });
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (drag === undefined) {
                return;
              }

              // Where it lands once taken out of its place.
              const landing = drag.to > drag.from ? drag.to - 1 : drag.to;
              if (landing !== drag.from) {
                onMove?.(drag.from, landing - drag.from);
              }

              setDrag(undefined);
            }}
          >
            {/* A line where the dragged choice would land. */}
            {drag !== undefined && drag.to === index && (
              <span className='pointer-events-none absolute inset-x-0 -top-[3px] h-0.5 rounded bg-sky-500' />
            )}
            {drag !== undefined && drag.to === index + 1 && index === node.choices.length - 1 && (
              <span className='pointer-events-none absolute inset-x-0 -bottom-[3px] h-0.5 rounded bg-sky-500' />
            )}
            <div className='flex items-center gap-1'>
              {/* The handle to drag the choice by. */}
              <span
                draggable={movable}
                title={movable ? 'Přetažením změníte pořadí' : undefined}
                onDragStart={(event) => {
                  // The row beside the handle goes with the pointer.
                  const row = event.currentTarget.nextElementSibling;
                  if (row instanceof HTMLElement) {
                    event.dataTransfer.setDragImage(row, 8, row.offsetHeight / 2);
                  }

                  event.dataTransfer.effectAllowed = 'move';
                  setDrag({ from: index, to: index });
                }}
                onDragEnd={() => {
                  setDrag(undefined);
                }}
                className={cn(
                  // Framed like the remove button on the other side of the row.
                  'flex h-9 w-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground',
                  // Nothing to reorder, no handle: a lone choice is as wide as the rows around.
                  movable
                    ? 'cursor-grab hover:bg-accent hover:text-foreground active:cursor-grabbing'
                    : 'hidden',
                )}
              >
                <IconGripVertical className='size-3.5' />
              </span>
              {/* Only read here: the text is written in the buttons under the node's text. */}
              <button
                type='button'
                title={
                  invalid
                    ? SAME_LABEL_WARNING
                    : `Otevřít uzel ${choice.to}: ${summaryOf(choice.to)}`
                }
                onClick={() => {
                  onOpen(choice.to);
                }}
                className={cn(
                  'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-2 text-left text-sm hover:bg-accent',
                  invalid && 'border-destructive',
                )}
              >
                <span className='min-w-0 flex-1 truncate'>
                  <ChoiceName label={choice.label} invalid={invalid} />
                </span>
                {invalid && <IconAlertTriangle className='size-4 shrink-0 text-destructive' />}
                <IdTag id={choice.to} color={colorOf(choice.to)} />
              </button>
              {onRemove !== undefined && (
                <RemoveButton
                  title='Smazat volbu'
                  question={`Smazat volbu ${index + 1}?`}
                  detail={`Vede do uzlu ${choice.to}; ten zůstane.`}
                  onConfirm={() => {
                    onRemove(index);
                  }}
                  className='flex size-9 shrink-0 items-center justify-center rounded-md border bg-card'
                >
                  <IconTrash className='size-4' />
                </RemoveButton>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * The choices as the players see them, under the node's text: a button each, its text written
 * right in it, and a round button at its end that opens the node the choice leads to. A text the
 * button shares with another one frames it red.
 */
const ChoiceButtons = ({
  node,
  summaryOf,
  onLabel,
  onOpen,
  focusIndex,
}: {
  readonly node: DraftNode;
  readonly summaryOf: (id: string) => string;
  readonly onLabel: ((index: number, label: string) => void) | undefined;
  readonly onOpen: (id: string) => void;
  /** The choice just added, its text to be written first. */
  readonly focusIndex: number | undefined;
}) => {
  const sameLabel = sameLabelChoices(node.choices);
  return (
    <section aria-label='Volby pro hráče'>
      {/* The buttons in a column, as on the player's screen. */}
      <div className='flex flex-col gap-2'>
        {node.choices.length === 0 && (
          <p className='text-sm text-muted-foreground'>Konec příběhu, uzel nemá volby.</p>
        )}
        {node.choices.map((choice, index) => {
          const invalid = sameLabel.has(index);
          return (
            // As the player's button, smaller: round, the text in the middle. The choices have no
            // ids; their order is all there is.
            <label
              key={index}
              {...(invalid ? { title: SAME_LABEL_WARNING } : {})}
              className={cn(
                'relative flex h-12 w-full items-center rounded-full border bg-muted/40 px-12 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40 hover:border-foreground/30',
                invalid && 'border-destructive',
              )}
            >
              <input
                value={choice.label}
                placeholder={NEXT_LABEL}
                autoFocus={focusIndex === index}
                readOnly={onLabel === undefined}
                aria-label={`Text volby ${index + 1}`}
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                  onLabel?.(index, event.target.value);
                }}
                className='min-w-0 flex-1 bg-transparent text-center text-base font-medium outline-none placeholder:text-muted-foreground/50'
              />
              {/* Where the player's thumb is: it goes on to the node the choice leads to. */}
              <button
                type='button'
                title={`Otevřít uzel ${choice.to}: ${summaryOf(choice.to)}`}
                aria-label={`Otevřít uzel ${choice.to}`}
                onClick={(event) => {
                  // Not into the text, as a click on the label would.
                  event.preventDefault();
                  onOpen(choice.to);
                }}
                className='absolute right-1 flex size-10 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform outline-none hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50'
              >
                <IconArrowRight className='size-4' />
              </button>
            </label>
          );
        })}
      </div>
    </section>
  );
};

/**
 * A new choice of the open node: into a new node, or into one of the other nodes, picked from a
 * list without the nodes leading here. The open node stays open either way.
 */
const AddChoice = ({
  draft,
  id,
  colorOf,
  onAdd,
}: {
  readonly draft: Draft;
  readonly id: string;
  readonly colorOf: (id: string) => TagColor | undefined;
  /** Without a target, into a new node. */
  readonly onAdd: (target: string | undefined) => void;
}) => {
  const [open, setOpen] = useState(false);
  const pick = (target: string | undefined) => {
    setOpen(false);
    onAdd(target);
  };

  // Not the node itself, nor the nodes leading into it: a choice back the way the players came.
  const before = new Set(incoming(draft, id).map(({ from }) => from.id));
  const targets = draft.nodes.filter((other) => {
    return other.id !== id && !before.has(other.id);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' className='h-9 justify-center'>
          Přidat volbu <IconPlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='flex max-h-80 w-72 flex-col gap-0.5 overflow-y-auto p-1'
      >
        <Button
          variant='outline'
          className='h-9 justify-center'
          onClick={() => {
            pick(undefined);
          }}
        >
          Do nového uzlu <IconSquareRoundedPlus />
        </Button>
        {/* The new node apart from the nodes there are. */}
        <div role='separator' className='-mx-1 my-1 h-px bg-border' />
        {targets.length === 0 && (
          <p className='px-2 pb-1 text-sm text-muted-foreground'>Jiný uzel tu není.</p>
        )}
        {targets.map((other) => (
          <button
            type='button'
            key={other.id}
            onClick={() => {
              pick(other.id);
            }}
            className='flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent'
          >
            <IdTag id={other.id} color={colorOf(other.id)} />
            <span className='truncate text-muted-foreground'>{other.summary}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

/** When a node last changed, as the author reads it, to the second, e.g. „27. 11. 2026 18:04:05“. */
const EDITED_AT = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'medium' });

const editedAt = (iso: string) => EDITED_AT.format(new Date(iso));

/** A part of the side panel, named above it. */
const Section = ({
  title,
  icon: SectionIcon,
  className,
  children,
}: {
  readonly title: string;
  /** Shown before the title, so each part is found at a glance. */
  readonly icon: ComponentType<{ readonly className?: string }>;
  readonly className?: string;
  readonly children: ReactNode;
}) => (
  // Divided from the part above by a line across the whole panel.
  <section
    className={cn(
      '-mx-4 flex flex-col gap-2 border-t px-4 py-4 first:border-t-0 first:pt-0',
      className,
    )}
  >
    <h2 className='flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase'>
      <SectionIcon className='size-3.5 shrink-0' />
      {title}
    </h2>
    {children}
  </section>
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
  /** Removes the open node, after a yes; without it the node has no remove button here. */
  readonly onRemove?: () => void;
  /**
   * Which opening of a node this is: a new value starts the text editor anew, with its own undo,
   * while a rename keeps it. The node's id by default, which a rename changes.
   */
  readonly opening?: string | number;
  readonly className?: string;
}

/**
 * A text field without a frame that grows with its text, or keeps to one line when `singleLine`;
 * read-only without `onChange`.
 */
const Field = ({
  value,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  singleLine = false,
  className,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: ((value: string) => void) | undefined;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly singleLine?: boolean;
  readonly className?: string;
}) => {
  const props = {
    value,
    placeholder,
    readOnly: onChange === undefined,
    ...(onFocus === undefined ? {} : { onFocus }),
    ...(onBlur === undefined ? {} : { onBlur }),
  };
  const look = 'w-full bg-transparent outline-none placeholder:text-muted-foreground/60';
  if (singleLine) {
    return (
      <input
        {...props}
        onChange={(event) => {
          onChange?.(event.target.value);
        }}
        className={cn(look, 'truncate', className)}
      />
    );
  }

  return (
    <textarea
      {...props}
      rows={1}
      onChange={(event) => {
        onChange?.(event.target.value);
      }}
      className={cn(look, '[field-sizing:content] resize-none', className)}
    />
  );
};

/**
 * The column the node is written in, in the middle of the dialog: 320 px of text, about as wide
 * as the player's phone, and on either side a gutter for the dialog's round buttons.
 */
const NODE_COLUMN = 'mx-auto w-full max-w-[calc(320px+7rem)] px-14';

/**
 * The first segment's note and theme, on the line between the summary and the text, where the
 * editor would draw the segment's divider: a button with the note in a popover, then the theme's
 * picker. The default theme's picker and a missing note show only under the pointer or the
 * keyboard's focus, a dot in their place otherwise, as on the editor's dividers.
 */
const FirstSegmentTools = ({
  theme,
  note,
  onTheme,
  onNote,
}: {
  readonly theme: Theme | undefined;
  readonly note: string | undefined;
  readonly onTheme: ((theme: Theme | undefined) => void) | undefined;
  readonly onNote: ((note: string) => void) | undefined;
}) => {
  const plain = theme === undefined || theme === 'default';
  return (
    <div className='group/first absolute right-14 bottom-0 z-10 flex translate-y-1/2 items-center justify-end gap-1 text-muted-foreground'>
      {plain && note === undefined && (
        <span className='pointer-events-none absolute right-0 size-1 rounded-full bg-muted-foreground transition-opacity group-focus-within/first:opacity-0 group-hover/first:opacity-0' />
      )}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type='button'
            title={note ?? 'Přidat poznámku k segmentu'}
            aria-label='Poznámka k prvnímu segmentu'
            className={cn(
              'flex size-5.5 items-center justify-center rounded-md bg-background shadow-[-6px_0_0_var(--background)] transition-opacity outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
              note === undefined
                ? 'opacity-0 group-focus-within/first:opacity-100 group-hover/first:opacity-100 data-[state=open]:opacity-100'
                : 'text-foreground',
            )}
          >
            <IconNote className='size-3.5' />
          </button>
        </PopoverTrigger>
        <PopoverContent align='end' className='flex w-72 flex-col gap-1.5 p-3'>
          <label className='flex flex-col gap-1.5 text-xs font-medium text-muted-foreground'>
            Poznámka k segmentu
            <textarea
              // Written in as soon as it opens.
              autoFocus
              rows={3}
              value={note ?? ''}
              readOnly={onNote === undefined}
              placeholder='Pro autora a převod, hráči ji neuvidí'
              onChange={(event) => {
                onNote?.(event.target.value);
              }}
              className='min-h-22 resize-y rounded-md border bg-transparent px-2 py-1.5 text-sm font-normal text-foreground outline-none focus:border-ring'
            />
          </label>
        </PopoverContent>
      </Popover>
      <label
        className={cn(
          'relative items-center bg-background shadow-[-6px_0_0_var(--background)] focus-within:text-foreground hover:text-foreground',
          plain ? 'hidden group-focus-within/first:flex group-hover/first:flex' : 'flex',
        )}
      >
        <span className='sr-only'>Téma prvního segmentu</span>
        <select
          value={theme ?? 'default'}
          disabled={onTheme === undefined}
          title='Téma segmentu'
          onChange={(event) => {
            const picked = THEMES.find((name) => {
              return name === event.target.value;
            });
            onTheme?.(picked === 'default' ? undefined : picked);
          }}
          className='cursor-pointer appearance-none rounded-md border bg-background py-0 pr-6 pl-2 font-sans text-2xs leading-5 font-medium outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40'
        >
          {THEMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <IconChevronDown className='pointer-events-none absolute right-2 size-2.5' />
      </label>
    </div>
  );
};

/** The look of a field to write in: framed, with a ring while it is written in. */
const FIELD_BOX =
  'rounded-lg border bg-card px-3 py-2 transition-[border-color,box-shadow] hover:border-foreground/30 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40';

/**
 * One node over the whole screen, the place to write it. A panel on the left holds its id, the
 * nodes leading here, its choices with where they lead and a way to add the next node, and its
 * note; the rest is one piece to write in, the summary as its heading and the segments' text with
 * their themes under it. Opening a neighbour reads the story like a book.
 */
export const FocusView = ({
  draft,
  id,
  onOpen,
  onChange,
  onRename,
  onRemove,
  opening = id,
  className,
}: FocusViewProps) => {
  /**
   * The id follows the summary being written: in a new node, from when its empty summary is
   * entered till it is left, as the id of a new node is made from its summary. Holds the node's
   * numbered id, which comes back when the summary is emptied again.
   */
  const following = useRef<string | undefined>(undefined);
  /** The choice added last here, its text to be written first. */
  const [added, setAdded] = useState<{ readonly id: string; readonly index: number }>();
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
  const focusIndex = added?.id === id ? added.index : undefined;
  /** A change of the open node, as a step of the history named by `field`. */
  const edit =
    onChange === undefined
      ? undefined
      : (field: string, change: (current: DraftNode) => DraftNode) => {
          onChange(updateNode(draft, id, change), `focus:${id}:${field}`);
        };

  /** Writes a choice's text, as a step of the history of its own. */
  const writeLabel =
    edit &&
    ((index: number, label: string) => {
      edit(`choice:${index}`, (current) => ({
        ...current,
        choices: current.choices.map((other, at) => (at === index ? { ...other, label } : other)),
      }));
    });

  return (
    <div className={cn('grid h-full min-h-0 grid-cols-[20rem_minmax(0,1fr)]', className)}>
      <aside className='flex min-h-0 flex-col overflow-y-auto border-r bg-muted/30 p-4'>
        <Section title='Id' icon={IconHash}>
          <IdEditor
            // A new node, a new field.
            key={node.id}
            id={node.id}
            color={colorOf(id)}
            onId={
              onChange &&
              ((typed) => {
                following.current = undefined;
                rename(draft, draftNodeId(typed, others));
              })
            }
          />
        </Section>
        {/* The tags are grey till the pointer is over the part: where the story comes from is
          only for reference here. */}
        <Section title='Odkud' icon={IconArrowsJoin} className='group/from'>
          {from.length === 0 && (
            <p className='text-sm text-muted-foreground'>Tady příběh začíná.</p>
          )}
          <div className='flex flex-col gap-1'>
            {from.map(({ from: source, choice, index }) => (
              <Source
                key={`${source.id}-${index}`}
                id={source.id}
                color={colorOf(source.id)}
                summary={source.summary}
                label={choice.label}
                onClick={() => {
                  onOpen(source.id);
                }}
              />
            ))}
          </div>
        </Section>
        <Section title='Kam' icon={IconArrowsSplit}>
          {node.choices.length === 0 && (
            <p className='text-sm text-muted-foreground'>Konec příběhu, uzel nemá volby.</p>
          )}
          <ChoiceList
            node={node}
            colorOf={colorOf}
            summaryOf={summaryOf}
            onOpen={onOpen}
            onMove={
              onChange &&
              ((index, offset) => {
                onChange(moveChoice(draft, id, index, offset));
              })
            }
            onRemove={
              onChange &&
              ((index) => {
                onChange(removeChoice(draft, id, index));
              })
            }
          />
          {onChange !== undefined && (
            <AddChoice
              draft={draft}
              id={id}
              colorOf={colorOf}
              onAdd={(target) => {
                // The open node stays open; the new node is opened by its tag when wanted. The new
                // choice's text is written first.
                onChange(linkChoice(draft, id, 'new', target).draft);
                setAdded({ id, index: node.choices.length });
              }}
            />
          )}
        </Section>
        <Section title='Poznámka pro převod' icon={IconNote}>
          <div className={cn('flex text-sm text-muted-foreground', FIELD_BOX)}>
            <Field
              value={node.note ?? ''}
              placeholder='Podmínky, stav, QR kód místo tlačítek…'
              onChange={
                edit &&
                ((note) => {
                  edit('note', (current) => withNote(current, note));
                })
              }
              // Three lines at least, so it reads as a place for more than a word.
              className='min-h-[3lh]'
            />
          </div>
        </Section>
        <Section title='Naposledy upraveno' icon={IconClock}>
          <p className='text-sm text-muted-foreground'>
            {node.updatedAt === undefined ? 'Zatím neupraveno' : editedAt(node.updatedAt)}
          </p>
        </Section>
        {onRemove !== undefined && (
          <div className='-mx-4 mt-auto border-t px-4 pt-3'>
            <RemoveButton
              title='Smazat uzel'
              question={`Smazat uzel ${node.id}?`}
              detail='Volby, které do něj vedou, se smažou taky. Vrátit to jde tlačítkem Zpět.'
              onConfirm={onRemove}
              className='flex items-center gap-2 px-2 py-1.5 text-sm'
            >
              <IconTrash className='size-4' /> Smazat uzel
            </RemoveButton>
          </div>
        )}
      </aside>
      {/* One piece to write in: the summary on top, the segments' text under it, the choices at
        the bottom; lines across the whole width part them. */}
      <main className='flex min-h-0 min-w-0 flex-col'>
        {/* The summary and the choices stay in place; only the text between them scrolls. */}
        <div className='shrink-0 border-b'>
          {/* From the top, the dialog's round buttons in the gutters on either side of it. */}
          {/* As high as the side panel's first part, the id, with its title and one line, so the
            line under it goes on from the panel's. */}
          <div className={cn(NODE_COLUMN, 'relative py-4')}>
            {/* The summary above the text, named, with no ground of its own: it says what happens
            in the node, the players never read it. In line with the text under it. */}
            <label className='flex flex-col gap-2'>
              <span className='text-xs font-medium tracking-widest text-muted-foreground uppercase'>
                Shrnutí
              </span>
              <Field
                value={node.summary}
                placeholder='Co se v uzlu stane, jednou větou'
                onFocus={() => {
                  following.current =
                    node.summary === '' && isNewNodeId(node.id) ? node.id : undefined;
                }}
                onBlur={() => {
                  following.current = undefined;
                }}
                onChange={
                  edit &&
                  ((summary) => {
                    if (following.current !== undefined) {
                      rename(
                        updateNode(draft, id, (current) => ({ ...current, summary })),
                        draftNodeId(summary, others, following.current),
                        // One step of the history while the id follows, though it changes each time.
                        'focus:following-summary',
                      );
                      return;
                    }

                    edit('summary', (current) => ({ ...current, summary }));
                  })
                }
                // One line, so the summary keeps as high as the panel's id beside it; a longer one
                // scrolls in the field.
                singleLine
                className='text-base leading-6'
              />
            </label>
            {/* On the line under the summary, which is the first segment's divider too. */}
            <FirstSegmentTools
              theme={node.segments[0]?.theme}
              note={node.segments[0]?.note}
              onNote={
                edit &&
                ((note) => {
                  edit('segments:first-note', (current) => ({
                    ...current,
                    segments: current.segments.map((segment, index) => {
                      if (index !== 0) {
                        return segment;
                      }

                      const { note: _old, ...rest } = segment;
                      return note.trim() === '' ? rest : { ...rest, note };
                    }),
                  }));
                })
              }
              onTheme={
                edit &&
                ((theme) => {
                  edit('segments:first-theme', (current) => ({
                    ...current,
                    segments: current.segments.map((segment, index) => {
                      if (index !== 0) {
                        return segment;
                      }

                      const { theme: _old, ...rest } = segment;
                      return theme === undefined ? rest : { ...rest, theme };
                    }),
                  }));
                })
              }
            />
          </div>
        </div>
        <div className='flex min-h-0 flex-1 flex-col overflow-y-auto'>
          <div className={cn(NODE_COLUMN, 'flex flex-1 flex-col pt-7 pb-5')}>
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
              firstThemeOutside
              fontSize={18}
              // The rest of the height, so a click anywhere below the text writes.
              className='min-h-64 flex-1'
            />
          </div>
        </div>
        <div className='shrink-0 border-t'>
          <div className={cn(NODE_COLUMN, 'pt-5 pb-8')}>
            <ChoiceButtons
              node={node}
              summaryOf={summaryOf}
              onLabel={writeLabel}
              onOpen={onOpen}
              focusIndex={focusIndex}
            />
          </div>
        </div>
      </main>
    </div>
  );
};
