import { IconDeviceDesktop, IconLoader2, IconLogout, IconMoon, IconSun } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage, isApiError } from '@/lib/api';
import { useTheme, type ThemePreference } from '@/lib/theme';

import { adminKeys } from './queries';

const NAV = [
  { to: '/admin/story', label: 'Příběh' },
  { to: '/admin/playtest', label: 'Test' },
  { to: '/admin/game', label: 'Hra' },
  { to: '/admin/dashboard', label: 'Živě' },
  { to: '/admin/devices', label: 'Zařízení' },
  { to: '/admin/qr-codes', label: 'QR kódy' },
] as const;

const THEME_NEXT: Readonly<Record<ThemePreference, ThemePreference>> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
} as const;
const THEME_ICON = { system: IconDeviceDesktop, light: IconSun, dark: IconMoon } as const;
const THEME_LABEL: Readonly<Record<ThemePreference, string>> = {
  system: 'podle systému',
  light: 'světlý',
  dark: 'tmavý',
} as const;

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

/** Creator area: everything below it requires the admin cookie. */
export const AdminLayout = () => {
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { preference, setPreference } = useTheme();
  const ThemeIcon = THEME_ICON[preference];

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
          size='icon'
          onClick={() => setPreference(THEME_NEXT[preference])}
          title='Vzhled'
          aria-label={`Vzhled: ${THEME_LABEL[preference]}, přepnout`}
        >
          <ThemeIcon />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          onClick={() => logout.mutate()}
          title='Odhlásit'
          aria-label='Odhlásit'
        >
          <IconLogout />
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
