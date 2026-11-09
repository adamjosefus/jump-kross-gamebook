import { IconLoader2, IconLogout, IconMoon, IconPlayerPause, IconSun } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage, isApiError } from '@/lib/api';
import { useTheme } from '@/lib/theme';

import { adminKeys, useOverview } from './queries';

const NAV = [
  { to: '/admin/story', label: 'Příběh' },
  { to: '/admin/playtest', label: 'Test' },
  { to: '/admin/game', label: 'Hra' },
  { to: '/admin/dashboard', label: 'Živě' },
  { to: '/admin/devices', label: 'Zařízení' },
  { to: '/admin/qr-codes', label: 'QR kódy' },
] as const;

/** The button has two states: without a choice it shows the system's mode, a click settles it. */
const THEME_NEXT = { light: 'dark', dark: 'light' } as const;
const THEME_ICON = { light: IconSun, dark: IconMoon } as const;
const THEME_LABEL = { light: 'Světlý režim', dark: 'Tmavý režim' } as const;

/** The app's name, last in every page title. */
const APP_NAME = 'Gamebook';

/**
 * Sets the browser tab's title to `Živě | Gamebook` and the like while the page is shown; leaving the
 * admin restores the plain app name.
 */
const usePageTitle = (page: string | undefined) => {
  useEffect(() => {
    document.title = page === undefined ? APP_NAME : `${page} | ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [page]);
};

/**
 * Above the admin bar on every page while the game is paused, since nobody plays until it goes on;
 * on the page Hra itself without the link there. Muted amber that reads in both color modes.
 */
const PausedBar = ({ pathname }: { readonly pathname: string }) => {
  const overview = useOverview();
  const game = overview.data?.game;
  if (game?.startedAt === undefined || !game.closed) return null;
  return (
    <div
      role='status'
      className='flex items-center gap-2 border-b border-amber-200 bg-amber-100 px-4 py-1.5 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-100 print:hidden'
    >
      <IconPlayerPause className='size-4 shrink-0' />
      Hra je pozastavená, týmy na cestě teď nemohou hrát.
      {pathname !== '/admin/game' && (
        <Link
          to='/admin/game'
          className='font-medium underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-50'
        >
          Pokračovat na stránce Hra
        </Link>
      )}
    </div>
  );
};

/** Creator area: everything below it requires the admin cookie. */
export const AdminLayout = () => {
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { resolved, setPreference } = useTheme();
  const ThemeIcon = THEME_ICON[resolved];

  const me = useQuery({
    queryKey: adminKeys.me,
    queryFn: ({ signal }) =>
      api((client) => client.admin.me(), { signal }).then(
        () => true,
        (error: unknown) => {
          if (isApiError(error, 'Unauthorized')) return false;
          throw error;
        },
      ),
  });
  const logout = useMutation({
    mutationFn: () => api((client) => client.admin.logout()),
    onSettled: () => queryClient.clear(),
  });

  // The page's name from the bar, so the tab and the highlighted button always say the same.
  const page = NAV.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  usePageTitle(me.data === false ? 'Přihlášení' : page?.label);

  if (me.isPending) {
    return (
      <div className='flex min-h-dvh items-center justify-center'>
        <IconLoader2 className='size-6 animate-spin' />
      </div>
    );
  }
  if (me.data !== true) return <AdminLogin />;

  return (
    // When printed (the QR codes), the page grows with its content and the bar is left out.
    <div className='flex h-dvh flex-col print:h-auto'>
      <PausedBar pathname={pathname} />
      <header className='flex items-center gap-1 border-b px-4 py-2 print:hidden'>
        <span className='mr-4 font-semibold'>Gamebook</span>
        <nav className='flex gap-1'>
          {NAV.map((item) => (
            <Button key={item.to} variant='ghost' size='sm' asChild>
              <Link to={item.to} activeProps={{ className: 'bg-accent' }}>
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
        <span className='flex-1' />
        <Button
          variant='ghost'
          size='sm'
          onClick={() => setPreference(THEME_NEXT[resolved])}
          aria-label={`Vzhled: ${THEME_LABEL[resolved]}, přepnout`}
        >
          <ThemeIcon /> {THEME_LABEL[resolved]}
        </Button>
        <Button variant='ghost' size='sm' onClick={() => logout.mutate()}>
          Odhlásit se <IconLogout />
        </Button>
      </header>
      <div className='min-h-0 flex-1 overflow-auto print:overflow-visible'>
        <Outlet />
      </div>
    </div>
  );
};

const AdminLogin = () => {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api((client) => client.admin.login({ payload: { password } })),
    onSuccess: () => queryClient.setQueryData(adminKeys.me, true),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  return (
    <div className='flex min-h-dvh items-center justify-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>Část pro tvůrce</CardTitle>
          <CardDescription>Zadejte heslo organizátorů.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className='flex flex-col gap-3'>
            <Input
              type='password'
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder='Heslo'
            />
            {login.isError && (
              <p className='text-sm text-destructive'>{errorMessage(login.error)}</p>
            )}
            <Button type='submit' disabled={login.isPending || password === ''}>
              {login.isPending && <IconLoader2 className='animate-spin' />} Přihlásit
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
