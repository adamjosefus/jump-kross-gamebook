import { IconChevronDown } from '@tabler/icons-react';
import {
  createContext,
  use,
  useId,
  useState,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** Which of the toolbars' menus is open, by its id; one at a time. */
const OpenMenuContext = createContext<
  | {
      readonly open: string | undefined;
      readonly setOpen: Dispatch<SetStateAction<string | undefined>>;
    }
  | undefined
>(undefined);

/**
 * Keeps one menu open at a time across all the toolbars inside, e.g. two bars over one canvas. A
 * `GraphToolbar` outside of one keeps its own menus so.
 */
export const ToolbarMenus = ({ children }: { readonly children: ReactNode }) => {
  const [open, setOpen] = useState<string>();
  return <OpenMenuContext value={{ open, setOpen }}>{children}</OpenMenuContext>;
};

/**
 * The `open` and `onOpenChange` of a menu in a `GraphToolbar`: opening it closes the one open
 * before. The toolbar catches the mouse over a canvas, so a click on another of its buttons does
 * not reach the open menu's outside and would leave both open.
 */
const useToolbarMenu = () => {
  const id = useId();
  const menus = use(OpenMenuContext);
  // Outside any toolbar the menu keeps its own state.
  if (menus === undefined) {
    return {};
  }

  const { open, setOpen } = menus;
  return {
    open: open === id,
    onOpenChange: (next: boolean) => {
      // A menu closing lets go only while it is still the open one: another may have opened.
      setOpen((current) => (next ? id : current === id ? undefined : current));
    },
  };
};

/** A dropdown menu in a `GraphToolbar`, the only one of its menus open while it is. */
export const ToolbarMenu = ({ children }: { readonly children: ReactNode }) => {
  const menu = useToolbarMenu();
  return <DropdownMenu {...menu}>{children}</DropdownMenu>;
};

/** Where a `FloatingBar` places itself over its canvas. */
export type BarCorner = 'top-left' | 'top-right';

const CORNER_PLACE: Readonly<Record<BarCorner, string>> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
};

/**
 * A bar floating over a canvas, as in Figma, in the look of the pages' other floating panels: in a
 * `corner` of the canvas, or, without one, where the page puts it among its own panels.
 */
export const FloatingBar = ({
  corner,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'className' | 'children'> & {
  readonly corner?: BarCorner;
  readonly className?: string;
  readonly children: ReactNode;
}) => (
  <div
    {...props}
    className={cn(
      'pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg border bg-background/80 p-1 text-sm text-muted-foreground shadow-md backdrop-blur-md',
      corner !== undefined &&
        `absolute z-10 max-w-[calc(100%-2rem)] overflow-x-auto ${CORNER_PLACE[corner]}`,
      className,
    )}
  >
    {children}
  </div>
);

/**
 * A toolbar floating over a canvas, as in Figma, in the look of the pages' other floating panels.
 * With `corner` it places itself in the top right corner of the canvas; without, the page puts it
 * among its own panels there. Its menus open downwards, one at a time.
 */
export const GraphToolbar = ({
  label,
  corner = false,
  className,
  children,
}: {
  /** What the toolbar is for, for screen readers. */
  readonly label: string;
  readonly corner?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const bar = (
    <FloatingBar
      role='toolbar'
      aria-label={label}
      {...(corner ? { corner: 'top-right' } : {})}
      {...(className === undefined ? {} : { className })}
    >
      {children}
    </FloatingBar>
  );
  // Inside `ToolbarMenus` its menus take turns with the other bars' there.
  return use(OpenMenuContext) === undefined ? <ToolbarMenus>{bar}</ToolbarMenus> : bar;
};

/** A thin line between groups of tools. */
export const ToolbarSeparator = () => (
  <span className='mx-1 h-4 w-px shrink-0 bg-border' aria-hidden />
);

/**
 * One of a few ways, as one small button with the name and the way chosen, which opens the list
 * of the ways under it.
 */
export const ToolbarPicker = <T extends string>({
  name,
  options,
  texts,
  value,
  parse,
  onChange,
}: {
  readonly name: string;
  readonly options: readonly T[];
  readonly texts: Readonly<Record<T, string>>;
  readonly value: T;
  /** The way a list item's value stands for. */
  readonly parse: (value: string) => T;
  readonly onChange: (value: T) => void;
}) => {
  return (
    <ToolbarMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm' aria-label={`${name}: ${texts[value]}`}>
          {name}: <span className='text-foreground'>{texts[value]}</span>
          <IconChevronDown className='opacity-60' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            onChange(parse(next));
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {texts[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </ToolbarMenu>
  );
};
