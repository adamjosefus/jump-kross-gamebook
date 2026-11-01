import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
} from '@tanstack/react-router';

import { PlayerPage } from '@/features/player/player-page';

const root = createRootRoute({ component: Outlet });

const index = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : undefined;
};

/** Where the player is within the team's step, so a reload opens the same screen. */
export interface PlayerSearch {
  readonly step?: number;
  readonly screen?: number;
}

const player = createRoute({
  getParentRoute: () => root,
  path: '/',
  component: PlayerPage,
  validateSearch: (search): PlayerSearch => {
    const step = index(search['step']);
    const screen = index(search['screen']);
    return {
      ...(step === undefined ? {} : { step }),
      ...(screen === undefined ? {} : { screen }),
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
/** The test run's moves and screen, so a reload replays the same path. */
export interface PlaytestSearch {
  readonly path?: string;
  readonly screen?: number;
}

const playtest = createRoute({
  getParentRoute: () => admin,
  path: '/playtest',
  validateSearch: (search): PlaytestSearch => {
    const path = typeof search['path'] === 'string' ? search['path'] : undefined;
    const screen = index(search['screen']);
    return {
      ...(path === undefined || path === '' ? {} : { path }),
      ...(screen === undefined ? {} : { screen }),
    };
  },
  component: lazyRouteComponent(() => import('@/features/admin/playtest-page'), 'PlaytestPage'),
});
const game = createRoute({
  getParentRoute: () => admin,
  path: '/game',
  component: lazyRouteComponent(() => import('@/features/admin/game-page'), 'GamePage'),
});
const dashboard = createRoute({
  getParentRoute: () => admin,
  path: '/dashboard',
  component: lazyRouteComponent(() => import('@/features/admin/dashboard-page'), 'DashboardPage'),
});
const print = createRoute({
  getParentRoute: () => admin,
  path: '/print',
  component: lazyRouteComponent(() => import('@/features/admin/print-page'), 'PrintPage'),
});

export const router = createRouter({
  routeTree: root.addChildren([
    player,
    admin.addChildren([adminIndex, story, playtest, game, dashboard, print]),
  ]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
