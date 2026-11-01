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

const player = createRoute({ getParentRoute: () => root, path: '/', component: PlayerPage });

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
const playtest = createRoute({
  getParentRoute: () => admin,
  path: '/playtest',
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
