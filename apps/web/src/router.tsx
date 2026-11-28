import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
} from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { PlayerPage } from '@/features/player/player-page';

const root = createRootRoute({ component: Outlet });

const index = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : undefined;
};

/** Where the player is within the team's revision, so a reload opens the same segment. */
export interface PlayerSearch {
  readonly revision?: number;
  readonly segment?: number;
}

const player = createRoute({
  getParentRoute: () => root,
  path: '/',
  component: PlayerPage,
  validateSearch: (search): PlayerSearch => {
    const revision = index(search['revision']);
    const segment = index(search['segment']);
    return {
      ...(revision === undefined ? {} : { revision }),
      ...(segment === undefined ? {} : { segment }),
    };
  },
});

// The creator area (story graph, game setup, QR printing) is loaded on demand, so phones only download the
// player part.
const admin = createRoute({
  getParentRoute: () => root,
  path: '/admin',
  component: lazyRouteComponent(() => import('@/features/admin/admin-layout'), 'AdminLayout'),
});
const adminIndex = createRoute({
  getParentRoute: () => admin,
  path: '/',
  component: () => <Navigate to='/admin/dashboard' />,
});
const story = createRoute({
  getParentRoute: () => admin,
  path: '/story',
  component: lazyRouteComponent(() => import('@/features/admin/story-page'), 'StoryPage'),
});
/** The test run's moves and segment, so a reload replays the same path. */
export interface PlaytestSearch {
  readonly path?: string;
  readonly segment?: number;
  /** The log opened as a subpage on a phone. */
  readonly panel?: 'log';
}

const playtest = createRoute({
  getParentRoute: () => admin,
  path: '/playtest',
  validateSearch: (search): PlaytestSearch => {
    const path = typeof search['path'] === 'string' ? search['path'] : undefined;
    const segment = index(search['segment']);
    return {
      ...(path === undefined || path === '' ? {} : { path }),
      ...(segment === undefined ? {} : { segment }),
      ...(search['panel'] === 'log' ? { panel: 'log' } : {}),
    };
  },
  component: lazyRouteComponent(() => import('@/features/admin/playtest-page'), 'PlaytestPage'),
});
const game = createRoute({
  getParentRoute: () => admin,
  path: '/game',
  component: lazyRouteComponent(() => import('@/features/admin/game-page'), 'GamePage'),
});
/** The live view's panel opened as a subpage on a phone. */
export interface DashboardSearch {
  readonly panel?: 'teams' | 'log';
}

const dashboard = createRoute({
  getParentRoute: () => admin,
  path: '/dashboard',
  validateSearch: (search): DashboardSearch =>
    search['panel'] === 'teams' || search['panel'] === 'log' ? { panel: search['panel'] } : {},
  component: lazyRouteComponent(() => import('@/features/admin/dashboard-page'), 'DashboardPage'),
});
const times = createRoute({
  getParentRoute: () => admin,
  path: '/times',
  component: lazyRouteComponent(() => import('@/features/admin/times-page'), 'TimesPage'),
});
const devices = createRoute({
  getParentRoute: () => admin,
  path: '/devices',
  component: lazyRouteComponent(() => import('@/features/admin/devices-page'), 'DevicesPage'),
});
/** The story editor, which writes its draft into a file on the author's disk. */
const editor = createRoute({
  getParentRoute: () => admin,
  path: '/editor',
  component: lazyRouteComponent(() => import('@/features/editor/editor-page'), 'EditorPage'),
});
const print = createRoute({
  getParentRoute: () => admin,
  path: '/qr-codes',
  component: lazyRouteComponent(() => import('@/features/admin/print-page'), 'PrintPage'),
});

/** A crash of the page, in the player's language, with the one way out that always works. */
const Crashed = ({ error }: { readonly error: unknown }) => {
  console.error(error);
  return (
    <main className='flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center'>
      <p className='text-balance'>
        Něco se pokazilo a stránka se nemůže zobrazit. Načtěte ji znovu; když to nepomůže, dejte
        vědět organizátorům.
      </p>
      <Button onClick={() => window.location.reload()}>Načíst znovu</Button>
    </main>
  );
};

export const router = createRouter({
  routeTree: root.addChildren([
    player,
    admin.addChildren([
      adminIndex,
      story,
      editor,
      playtest,
      game,
      dashboard,
      times,
      devices,
      print,
    ]),
  ]),
  defaultErrorComponent: Crashed,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
