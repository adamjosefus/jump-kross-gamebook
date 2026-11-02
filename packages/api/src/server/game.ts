import {
  applyChoice,
  applyScan,
  availableScans,
  encodeQr,
  introScreens,
  renderNode,
  startPosition,
  toGraph,
  verifyQr,
  type GameGraph,
  type MoveError,
  type MoveResult,
  type Story,
} from '@gamebook/core';
import { Context, Effect, Layer } from 'effect';

import {
  InvalidCode,
  InvalidMove,
  NotFound,
  StepConflict,
  type Overview,
  type PlaytestView,
  type PlayerView,
  type PrintableCode,
  type TeamStatus,
} from '../api.ts';
import { ServerConfig } from './config.ts';
import { readingTotals } from './reading.ts';
import { Store, type TeamMove, type TeamRow } from './store.ts';

const MOVE_MESSAGES: Record<MoveError | 'not-started', string> = {
  'wrong-location': 'Tady to není. Jste na špatném místě.',
  'scan-required': 'Pokračujte naskenováním QR kódu.',
  'no-scan': 'Teď se vybírá v aplikaci, ne skenováním.',
  'unavailable-choice': 'Tuto volbu teď nelze vybrat.',
  finished: 'Hra už skončila.',
  'unknown-node': 'Příběh je teď nedostupný. Kontaktujte organizátory.',
  'missing-target': 'Příběh je teď nedostupný. Kontaktujte organizátory.',
  'not-started': 'Hra ještě nezačala.',
};

const DEVICE_WINDOW_MS = 2 * 60 * 1000;

/**
 * The most one continuous view of a text counts for. A phone left unlocked on a text while the
 * team walks is not reading.
 */
const MAX_READING_MS = 5 * 60 * 1000;
/** More than a device can have waiting, so one request cannot flood the table. */
const MAX_READING_BATCH = 500;

/** Small pause after a wrong code, so codes cannot be guessed quickly. */
const penalty = Effect.sleep('400 millis');

const notFound = (what: string) => new NotFound({ message: `${what} neexistuje.` });

/** The story teams play; part of the deployed code, so it changes only with a deploy. */
export class CurrentStory extends Context.Service<CurrentStory, Story>()('gamebook/CurrentStory') {}

export class Game extends Context.Service<Game>()('gamebook/Game', {
  make: Effect.gen(function* () {
    const store = yield* Store;
    const config = yield* ServerConfig;
    const story = yield* CurrentStory;
    // Previews depend only on the story, so the graph is computed once.
    let cachedGraph: GameGraph | undefined;
    const graph = () => (cachedGraph ??= toGraph(story));
    const intro = {
      screens: introScreens(story),
      ...(story.introScanTitle === undefined ? {} : { scanTitle: story.introScanTitle }),
    };

    const teamName = (id: number) =>
      story.teams.find((team) => team.id === id)?.name ?? `Tým ${id}`;

    const isEnd = (node: string | undefined) =>
      node !== undefined && story.nodes[node]?.end === true;

    const moveOf = (result: Extract<MoveResult, { ok: true }>, action: string): TeamMove => ({
      ...result.position,
      finished: isEnd(result.position.node),
      action,
    });

    const view = (team: TeamRow): PlayerView => {
      const base = { team: { id: team.id, name: teamName(team.id) }, step: team.step };
      const node =
        team.node === undefined
          ? undefined
          : renderNode(story, { node: team.node, state: team.state });
      if (node === undefined) return { ...base, status: 'not-ready' };
      return {
        ...base,
        status: node.type === 'end' ? 'finished' : 'playing',
        node: {
          id: node.id,
          type: node.type,
          screens: node.screens,
          choices: node.choices,
          scan: node.scan,
          ...(node.scanTitle === undefined ? {} : { scanTitle: node.scanTitle }),
        },
      };
    };

    /** Puts a team that has not started yet on the start node. */
    const ensureStarted = Effect.fn('Game.ensureStarted')(function* (team: TeamRow) {
      if (team.node !== undefined) return team;
      const start = startPosition(story);
      if (start === undefined) return team;
      const moved = yield* store.moveTeam(team.id, team.step, {
        ...start,
        finished: false,
        action: 'start',
      });
      // Another device may have started it in the meantime; either way read the fresh row.
      return moved ?? (yield* store.getTeam(team.id)) ?? team;
    });

    const loadTeam = Effect.fn('Game.loadTeam')(function* (teamId: number) {
      const team = yield* store.getTeam(teamId);
      if (team === undefined) return yield* notFound('Tým');
      return yield* ensureStarted(team);
    });

    const playerView = Effect.fn('Game.playerView')(function* (teamId: number) {
      return view(yield* loadTeam(teamId));
    });

    const commit = Effect.fn('Game.commit')(function* (
      team: TeamRow,
      result: MoveResult,
      action: string,
    ) {
      if (!result.ok)
        return yield* new InvalidMove({
          reason: result.error,
          message: MOVE_MESSAGES[result.error],
        });
      const moved = yield* store.moveTeam(team.id, team.step, moveOf(result, action));
      if (moved === undefined)
        return yield* new StepConflict({ message: 'Váš tým už mezitím rozhodl.' });
      return view(moved);
    });

    const prepareMove = Effect.fn('Game.prepareMove')(function* (
      teamId: number,
      expectedStep: number,
    ) {
      const team = yield* loadTeam(teamId);
      if (team.step !== expectedStep)
        return yield* new StepConflict({ message: 'Váš tým už mezitím rozhodl.' });
      if (team.node === undefined) {
        return yield* new InvalidMove({
          reason: 'not-started',
          message: MOVE_MESSAGES['not-started'],
        });
      }
      const position = { node: team.node, state: team.state };
      return { team, position };
    });

    const choose = Effect.fn('Game.choose')(function* (
      teamId: number,
      index: number,
      expectedStep: number,
    ) {
      const { team, position } = yield* prepareMove(teamId, expectedStep);
      return yield* commit(team, applyChoice(story, position, index), `choice:${index}`);
    });

    /** The story's team whose login code was scanned. */
    const teamOf = Effect.fn('Game.teamOf')(function* (code: string) {
      const payload = yield* Effect.promise(() => verifyQr(config.qrSecret, code));
      if (payload?.kind !== 'T') {
        yield* penalty;
        return yield* new InvalidCode({
          message:
            payload === undefined
              ? 'Tento QR kód nepatří ke hře.'
              : 'Nejdřív naskenujte přihlašovací kód týmu.',
        });
      }
      const team = story.teams.find((t) => t.id === payload.id);
      if (team === undefined)
        return yield* new InvalidCode({ message: 'Tento tým už ve hře není.' });
      return team;
    });

    /** The story's location a scanned code belongs to. */
    const locationOf = Effect.fn('Game.locationOf')(function* (code: string) {
      const payload = yield* Effect.promise(() => verifyQr(config.qrSecret, code));
      if (payload === undefined) {
        yield* penalty;
        return yield* new InvalidCode({ message: 'Tento QR kód nepatří ke hře.' });
      }
      if (payload.kind === 'T')
        return yield* new InvalidCode({ message: 'Tohle je přihlašovací kód týmu.' });
      const location = story.locations.find((l) => l.id === payload.id);
      if (location === undefined)
        return yield* new InvalidCode({ message: 'Tento QR kód už neplatí.' });
      return location;
    });

    const scan = Effect.fn('Game.scan')(function* (
      teamId: number,
      code: string,
      expectedStep: number,
    ) {
      const location = yield* locationOf(code);
      const { team, position } = yield* prepareMove(teamId, expectedStep);
      // After a reset the phones stay logged in, so the first scan is at a location.
      if (team.startedAt === undefined) yield* store.markStarted(team.id);
      return yield* commit(team, applyScan(story, position, location.id), `scan:${location.id}`);
    });

    /** Any device joins a team by its code and continues where the team is. */
    const login = Effect.fn('Game.login')(function* (code: string) {
      const { id } = yield* teamOf(code);
      const team = yield* store.ensureTeam(id);
      if (team.startedAt === undefined) yield* store.markStarted(team.id);
      const sessionId = crypto.randomUUID();
      yield* store.createSession(sessionId, team.id);
      return { sessionId, view: yield* playerView(team.id) };
    });

    const reading = Effect.fn('Game.reading')(function* (
      teamId: number,
      intervals: readonly { readonly ms: number; readonly agoMs: number }[],
    ) {
      const now = Date.now();
      const rows = intervals.slice(0, MAX_READING_BATCH).flatMap(({ ms, agoMs }) => {
        const counted = Math.min(ms, MAX_READING_MS);
        const ended = now - Math.max(agoMs, 0);
        return counted > 0
          ? [{ teamId, startedAt: new Date(ended - counted), endedAt: new Date(ended) }]
          : [];
      });
      if (rows.length > 0) yield* store.addReading(rows);
    });

    // -------------------------------------------------------------------------------------------
    // Admin

    const teamStatus = (team: TeamRow, devices: number, readingMs: number): TeamStatus => ({
      id: team.id,
      name: teamName(team.id),
      ...(team.node === undefined ? {} : { node: team.node }),
      nodeExists: team.node === undefined || Object.hasOwn(story.nodes, team.node),
      state: team.state,
      step: team.step,
      finished: team.finishedAt !== undefined,
      updatedAt: team.updatedAt.toISOString(),
      devices,
      ...(team.startedAt === undefined
        ? {}
        : { playMs: (team.finishedAt?.getTime() ?? Date.now()) - team.startedAt.getTime() }),
      readingMs,
    });

    const singleTeamStatus = Effect.fn('Game.singleTeamStatus')(function* (team: TeamRow) {
      const [devices, readingRows] = yield* Effect.all([
        store.activeDevices(new Date(Date.now() - DEVICE_WINDOW_MS)),
        store.listReading(),
      ]);
      return teamStatus(
        team,
        devices.get(team.id) ?? 0,
        readingTotals(readingRows).get(team.id) ?? 0,
      );
    });

    const overview = Effect.fn('Game.overview')(function* () {
      const [teams, log, devices, visits, readingRows] = yield* Effect.all(
        [
          store.listTeams(),
          store.recentLog(50),
          store.activeDevices(new Date(Date.now() - DEVICE_WINDOW_MS)),
          store.visitCounts(),
          store.listReading(),
        ],
        { concurrency: 'unbounded' },
      );
      const readingMs = readingTotals(readingRows);
      const result: Overview = {
        // Every team of the story; one that never logged in has no row yet.
        teams: story.teams.map(({ id }) =>
          teamStatus(
            teams.find((team) => team.id === id) ?? notStarted(id),
            devices.get(id) ?? 0,
            readingMs.get(id) ?? 0,
          ),
        ),
        locations: story.locations,
        log: log.map((entry) => ({
          teamId: entry.teamId,
          at: entry.at.toISOString(),
          action: entry.action,
          state: entry.state,
          ...(entry.fromNode === undefined ? {} : { fromNode: entry.fromNode }),
          ...(entry.toNode === undefined ? {} : { toNode: entry.toNode }),
        })),
        visits: Object.fromEntries(visits),
      };
      return result;
    });

    const notStarted = (id: number): TeamRow => ({
      id,
      node: undefined,
      state: {},
      step: 0,
      startedAt: undefined,
      finishedAt: undefined,
      updatedAt: new Date(0),
    });

    const requireTeam = Effect.fn('Game.requireTeam')(function* (id: number) {
      if (!story.teams.some((team) => team.id === id)) return yield* notFound('Tým');
      return yield* store.ensureTeam(id);
    });

    /** Puts the team back on the start with the initial state, on every device. */
    const resetTeam = Effect.fn('Game.resetTeam')(function* (id: number) {
      const team = yield* requireTeam(id);
      const start = startPosition(story);
      const moved = yield* store.moveTeam(id, team.step, {
        node: start?.node,
        state: start?.state ?? {},
        finished: false,
        action: 'reset',
      });
      yield* store.clearTiming(id);
      // The row from the move still has the old first scan.
      return yield* singleTeamStatus(
        moved === undefined ? yield* requireTeam(id) : { ...moved, startedAt: undefined },
      );
    });

    /** A new game: every team back on the start. */
    const resetAll = Effect.fn('Game.resetAll')(function* () {
      // Every id comes from the story, so none is missing.
      return yield* Effect.forEach(story.teams, ({ id }) => resetTeam(id)).pipe(
        Effect.catchTag('NotFound', (error) => Effect.die(error)),
      );
    });

    const moveTeam = Effect.fn('Game.moveTeam')(function* (
      id: number,
      node: string,
      state: TeamRow['state'],
    ) {
      const team = yield* requireTeam(id);
      const moved = yield* store.moveTeam(id, team.step, {
        node,
        state,
        finished: isEnd(node),
        action: 'admin',
      });
      return yield* singleTeamStatus(moved ?? (yield* requireTeam(id)));
    });

    /** A test run: the same rules as the game, but the position comes from the client. */
    const playtest = Effect.fn('Game.playtest')(function* (input: {
      readonly position?: { readonly node: string; readonly state: TeamRow['state'] };
      readonly move?:
        | { readonly choice: number }
        | { readonly scan: number }
        | { readonly code: string };
    }) {
      // At the intro only a team's login code (or no move, which skips it) goes on, to the start.
      if (input.position === undefined && input.move !== undefined && 'code' in input.move)
        yield* teamOf(input.move.code);
      const start = input.position ?? startPosition(story);
      if (start === undefined) return yield* notFound('Start');
      const result: MoveResult =
        input.move === undefined || input.position === undefined
          ? { ok: true, position: start }
          : 'choice' in input.move
            ? applyChoice(story, start, input.move.choice)
            : applyScan(
                story,
                start,
                'scan' in input.move ? input.move.scan : (yield* locationOf(input.move.code)).id,
              );
      if (!result.ok)
        return yield* new InvalidMove({
          reason: result.error,
          message: MOVE_MESSAGES[result.error],
        });
      const { position } = result;
      const node = story.nodes[position.node];
      const rendered = renderNode(story, position);
      if (node === undefined || rendered === undefined)
        return yield* notFound(`Uzel ${position.node}`);
      const step: PlaytestView = {
        node: position.node,
        state: position.state,
        view: {
          ...rendered,
          scans: availableScans(node, position.state).flatMap(
            (option) => story.locations.find((l) => l.id === option.scan.location) ?? [],
          ),
        },
      };
      return step;
    });

    const codes = Effect.fn('Game.codes')(function* () {
      // Teams and places come from the story, so their codes change only with a deploy.
      const entries: { kind: PrintableCode['kind']; id: number; label: string }[] = [
        ...story.teams.map((team) => ({ kind: 'T' as const, id: team.id, label: team.name })),
        ...story.locations.map((location) => ({
          kind: 'L' as const,
          id: location.id,
          label: location.name,
        })),
      ];
      return yield* Effect.promise(() =>
        Promise.all(
          entries.map(async (entry) => ({
            ...entry,
            code: await encodeQr(config.qrSecret, entry),
          })),
        ),
      );
    });

    return {
      login,
      playerView,
      choose,
      scan,
      reading,
      graph,
      intro,
      overview,
      singleTeamStatus,
      requireTeam,
      resetTeam,
      resetAll,
      moveTeam,
      playtest,
      codes,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
