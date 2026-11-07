import { Effect, Layer, Redacted } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import {
  AdminAuth,
  AdminSessionCookie,
  Api,
  CurrentTeam,
  DeviceCookie,
  PlayerAuth,
  PlayerSessionCookie,
  Unauthorized,
} from '../api.ts';
import { ServerConfig } from './config.ts';
import { Game, isDeviceId, PLAYER_SESSION_TTL_MS } from './game.ts';
import { Store } from './store.ts';
import { ADMIN_MAX_AGE, createAdminToken, secretsEqual, verifyAdminToken } from './tokens.ts';

const PLAYER_MAX_AGE = `${PLAYER_SESSION_TTL_MS / 1000} seconds` as const;

/** The device's own cookie outlives every game it plays, so a ban outlives the session. */
const DEVICE_MAX_AGE = `${365 * 24 * 60 * 60} seconds` as const;

/** Store failures are bugs or outages, not API errors: they surface as 500s. */
const orDie = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchIf(
      (error): error is Extract<E, { readonly _tag: 'StoreError' }> => error._tag === 'StoreError',
      (error) => Effect.die(error),
    ),
  );

/**
 * After this many wrong passwords from one address, each further try waits twice as long as the
 * one before (4 s, 8 s, 16 s, …, at most five minutes). On serverless, a pause inside the request
 * alone would not slow down parallel guesses, so the count lives in the store.
 */
const FREE_FAILURES = 3;
const LOCK_BASE_MS = 2000;
const LOCK_MAX_MS = 5 * 60 * 1000;

const lockMs = (failures: number) =>
  failures < FREE_FAILURES
    ? 0
    : Math.min(LOCK_BASE_MS * 2 ** (failures - FREE_FAILURES + 1), LOCK_MAX_MS);

/** The client's address, as the proxy in front of the function reports it. */
const clientKey = (request: HttpServerRequest.HttpServerRequest) =>
  request.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
  request.headers['x-real-ip'] ??
  'unknown';

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
        const teamId = yield* orDie(
          store.touchSession(sessionId, new Date(Date.now() - PLAYER_SESSION_TTL_MS)),
        );
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
          verifyAdminToken(config, Redacted.value(credential)),
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
      intro: () => orDie(game.intro()),
      login: Effect.fn(function* ({ payload }) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const key = clientKey(request);
        // A device without its own id (or with one this server did not give) gets one now; it is
        // renewed with every login.
        const sent = request.cookies[DeviceCookie.key];
        const deviceId = isDeviceId(sent) ? sent : crypto.randomUUID();
        yield* HttpApiBuilder.securitySetCookie(DeviceCookie, deviceId, {
          ...cookie,
          maxAge: DEVICE_MAX_AGE,
        });
        const { sessionId, view } = yield* orDie(
          game.login(payload.code, {
            ip: key === 'unknown' ? undefined : key,
            userAgent: request.headers['user-agent'],
            deviceId,
          }),
        );
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
      reading: Effect.fn(function* ({ payload }) {
        const { teamId } = yield* CurrentTeam;
        yield* orDie(game.reading(teamId, payload.teamId, payload.intervals));
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
        const key = clientKey(yield* HttpServerRequest.HttpServerRequest);
        const previous = yield* orDie(store.adminFailures(key));
        const lockedFor =
          previous === undefined
            ? 0
            : previous.lastAt.getTime() + lockMs(previous.failures) - Date.now();
        if (lockedFor > 0) {
          yield* new Unauthorized({
            message: `Příliš mnoho pokusů. Zkuste to za ${Math.ceil(lockedFor / 1000)} s.`,
          });
        }
        if (!secretsEqual(config.adminPassword, payload.password)) {
          yield* orDie(store.recordAdminFailure(key));
          yield* Effect.sleep('600 millis');
          yield* new Unauthorized({ message: 'Špatné heslo.' });
        }
        if (previous !== undefined) yield* orDie(store.clearAdminFailures(key));
        const token = yield* Effect.promise(() => createAdminToken(config));
        yield* HttpApiBuilder.securitySetCookie(AdminSessionCookie, token, {
          ...cookie,
          maxAge: ADMIN_MAX_AGE,
        });
      }),
      me: () => Effect.void,
      logout: Effect.fn(function* () {
        yield* HttpApiBuilder.securitySetCookie(AdminSessionCookie, '', { ...cookie, maxAge: 0 });
      }),
      story: () => Effect.succeed(game.graph()),
      playtest: ({ payload }) => game.playtest(payload),
      overview: () => orDie(game.overview()),
      startGame: () => orDie(game.startGame()),
      setClosed: ({ payload }) => orDie(game.setClosed(payload.closed)),
      devices: () => orDie(game.devices()),
      logoutDevice: ({ params }) => orDie(game.logoutDevice(params.id)),
      banDevice: ({ params }) => orDie(game.banDevice(params.id)),
      unbanDevice: ({ params }) => orDie(game.unbanDevice(params.id)),
      resetAll: () => orDie(game.resetAll()),
      resetTeam: ({ params }) => orDie(game.resetTeam(params.id)),
      moveTeam: ({ params, payload }) =>
        orDie(game.moveTeam(params.id, payload.node, payload.state)),
      codes: () => orDie(game.codes()),
    });
  }),
);

/** Every handler with its dependencies, except `Store`, `ServerConfig` and `CurrentStory`. */
export const HandlersLayer = Layer.mergeAll(PlayerHandlers, AdminHandlers).pipe(
  Layer.provide([PlayerAuthLive, AdminAuthLive]),
  Layer.provideMerge(Game.layer),
);
