import { Effect, Layer, Redacted } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import {
  AdminAuth,
  AdminSessionCookie,
  Api,
  CurrentTeam,
  NotFound,
  PlayerAuth,
  PlayerSessionCookie,
  Unauthorized,
} from '../api.ts';
import { ServerConfig } from './config.ts';
import { Game } from './game.ts';
import { Store } from './store.ts';
import { ADMIN_MAX_AGE, createAdminToken, verifyAdminToken } from './tokens.ts';

const PLAYER_MAX_AGE = '7 days';

/** Store failures are bugs or outages, not API errors: they surface as 500s. */
const orDie = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchIf(
      (error): error is Extract<E, { readonly _tag: 'StoreError' }> => error._tag === 'StoreError',
      (error) => Effect.die(error),
    ),
  );

const cookieOptions = (config: ServerConfig['Service']) => ({
  path: '/',
  sameSite: 'lax' as const,
  secure: !config.insecureCookies,
});

const PlayerAuthLive = Layer.effect(
  PlayerAuth,
  Effect.gen(function* () {
    const store = yield* Store;
    return PlayerAuth.of({
      session: Effect.fn(function* (httpEffect, { credential }) {
        const sessionId = Redacted.value(credential);
        if (sessionId === '') return yield* new Unauthorized({ message: 'Nejste přihlášeni.' });
        const teamId = yield* orDie(store.touchSession(sessionId));
        if (teamId === undefined)
          return yield* new Unauthorized({ message: 'Přihlášení vypršelo.' });
        return yield* Effect.provideService(httpEffect, CurrentTeam, { sessionId, teamId });
      }),
    });
  }),
);

const AdminAuthLive = Layer.effect(
  AdminAuth,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    return AdminAuth.of({
      cookie: Effect.fn(function* (httpEffect, { credential }) {
        const valid = yield* Effect.promise(() =>
          verifyAdminToken(config.sessionSecret, Redacted.value(credential)),
        );
        if (!valid) return yield* new Unauthorized({ message: 'Přihlaste se heslem tvůrce.' });
        return yield* httpEffect;
      }),
    });
  }),
);

const PlayerHandlers = HttpApiBuilder.group(
  Api,
  'player',
  Effect.fn(function* (handlers) {
    const game = yield* Game;
    const store = yield* Store;
    const cookie = cookieOptions(yield* ServerConfig);
    return handlers.handleAll({
      login: Effect.fn(function* ({ payload }) {
        const { sessionId, view } = yield* orDie(game.login(payload.code));
        yield* HttpApiBuilder.securitySetCookie(PlayerSessionCookie, sessionId, {
          ...cookie,
          maxAge: PLAYER_MAX_AGE,
        });
        return view;
      }),
      state: Effect.fn(function* () {
        const { teamId } = yield* CurrentTeam;
        return yield* orDie(game.playerView(teamId));
      }),
      choose: Effect.fn(function* ({ payload }) {
        const { teamId } = yield* CurrentTeam;
        return yield* orDie(game.choose(teamId, payload.index, payload.expectedStep));
      }),
      scan: Effect.fn(function* ({ payload }) {
        const { teamId } = yield* CurrentTeam;
        return yield* orDie(game.scan(teamId, payload.code, payload.expectedStep));
      }),
      logout: Effect.fn(function* () {
        const { sessionId } = yield* CurrentTeam;
        yield* orDie(store.deleteSession(sessionId));
        yield* HttpApiBuilder.securitySetCookie(PlayerSessionCookie, '', { ...cookie, maxAge: 0 });
      }),
    });
  }),
);

const AdminHandlers = HttpApiBuilder.group(
  Api,
  'admin',
  Effect.fn(function* (handlers) {
    const game = yield* Game;
    const store = yield* Store;
    const config = yield* ServerConfig;
    const cookie = cookieOptions(config);

    return handlers.handleAll({
      login: Effect.fn(function* ({ payload }) {
        if (payload.password !== config.adminPassword) {
          yield* Effect.sleep('600 millis');
          yield* new Unauthorized({ message: 'Špatné heslo.' });
        }
        const token = yield* Effect.promise(() => createAdminToken(config.sessionSecret));
        yield* HttpApiBuilder.securitySetCookie(AdminSessionCookie, token, {
          ...cookie,
          maxAge: ADMIN_MAX_AGE,
        });
      }),
      me: () => Effect.void,
      logout: Effect.fn(function* () {
        yield* HttpApiBuilder.securitySetCookie(AdminSessionCookie, '', { ...cookie, maxAge: 0 });
      }),
      story: () => Effect.succeed(game.graph),
      overview: () => orDie(game.overview()),
      createTeam: Effect.fn(function* ({ payload }) {
        const team = yield* orDie(store.createTeam(payload.name.trim(), payload.startNode));
        return yield* orDie(game.singleTeamStatus(team));
      }),
      updateTeam: Effect.fn(function* ({ params, payload }) {
        const team = yield* orDie(
          store.updateTeam(params.id, payload.name.trim(), payload.startNode),
        );
        if (team === undefined) return yield* new NotFound({ message: 'Tým neexistuje.' });
        return yield* orDie(game.singleTeamStatus(team));
      }),
      deleteTeam: Effect.fn(function* ({ params }) {
        if (!(yield* orDie(store.deleteTeam(params.id))))
          yield* new NotFound({ message: 'Tým neexistuje.' });
      }),
      resetTeam: ({ params }) => orDie(game.resetTeam(params.id)),
      moveTeam: ({ params, payload }) =>
        orDie(game.moveTeam(params.id, payload.node, payload.state)),
      saveLocation: ({ params, payload }) =>
        orDie(store.saveLocation({ id: params.id, name: payload.name.trim(), kind: payload.kind })),
      deleteLocation: ({ params }) => orDie(store.deleteLocation(params.id)),
      codes: () => orDie(game.codes()),
    });
  }),
);

/** Every handler with its dependencies, except `Store`, `ServerConfig` and `CurrentStory`. */
export const HandlersLayer = Layer.mergeAll(PlayerHandlers, AdminHandlers).pipe(
  Layer.provide([PlayerAuthLive, AdminAuthLive]),
  Layer.provideMerge(Game.layer),
);
