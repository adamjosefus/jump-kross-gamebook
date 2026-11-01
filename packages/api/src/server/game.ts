import {
  applyChoice,
  applyScan,
  encodeQr,
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
  type PlayerView,
  type PrintableCode,
  type TeamStatus,
} from '../api.ts';
import { ServerConfig } from './config.ts';
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
    // Previews depend only on the story and the start, so each start's graph is computed once.
    const graphs = new Map<string, GameGraph>();
    const graph = (start?: string) => {
      const key = start ?? '';
      let result = graphs.get(key);
      if (result === undefined) {
        result = toGraph(story, start);
        graphs.set(key, result);
      }
      return result;
    };

    const isEnd = (node: string | undefined) =>
      node !== undefined && story.nodes[node]?.end === true;

    const moveOf = (result: Extract<MoveResult, { ok: true }>, action: string): TeamMove => ({
      ...result.position,
      finished: isEnd(result.position.node),
      action,
    });

    const view = (team: TeamRow): PlayerView => {
      const base = { team: { id: team.id, name: team.name }, step: team.step };
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
        },
      };
    };

    /** Puts a team that has not started yet on its start node. */
    const ensureStarted = Effect.fn('Game.ensureStarted')(function* (team: TeamRow) {
      if (team.node !== undefined) return team;
      const start = startPosition(story, team.startNode);
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

    const scan = Effect.fn('Game.scan')(function* (
      teamId: number,
      code: string,
      expectedStep: number,
    ) {
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
      const { team, position } = yield* prepareMove(teamId, expectedStep);
      return yield* commit(team, applyScan(story, position, location.id), `scan:${location.id}`);
    });

    const login = Effect.fn('Game.login')(function* (code: string) {
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
      const team = yield* store.getTeam(payload.id);
      if (team === undefined)
        return yield* new InvalidCode({ message: 'Tento tým už ve hře není.' });
      const sessionId = crypto.randomUUID();
      yield* store.createSession(sessionId, team.id);
      return { sessionId, view: yield* playerView(team.id) };
    });

    // -------------------------------------------------------------------------------------------
    // Admin

    const teamStatus = (team: TeamRow, devices: number): TeamStatus => ({
      id: team.id,
      name: team.name,
      startNode: team.startNode,
      ...(team.node === undefined ? {} : { node: team.node }),
      nodeExists: team.node === undefined || Object.hasOwn(story.nodes, team.node),
      state: team.state,
      step: team.step,
      finished: team.finishedAt !== undefined,
      updatedAt: team.updatedAt.toISOString(),
      devices,
    });

    const singleTeamStatus = Effect.fn('Game.singleTeamStatus')(function* (team: TeamRow) {
      const devices = yield* store.activeDevices(new Date(Date.now() - DEVICE_WINDOW_MS));
      return teamStatus(team, devices.get(team.id) ?? 0);
    });

    const overview = Effect.fn('Game.overview')(function* () {
      const [teams, log, devices, visits] = yield* Effect.all(
        [
          store.listTeams(),
          store.recentLog(50),
          store.activeDevices(new Date(Date.now() - DEVICE_WINDOW_MS)),
          store.visitCounts(),
        ],
        { concurrency: 'unbounded' },
      );
      const result: Overview = {
        teams: teams.map((team) => teamStatus(team, devices.get(team.id) ?? 0)),
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

    const requireTeam = Effect.fn('Game.requireTeam')(function* (id: number) {
      const team = yield* store.getTeam(id);
      return team === undefined ? yield* notFound('Tým') : team;
    });

    const resetTeam = Effect.fn('Game.resetTeam')(function* (id: number) {
      const team = yield* requireTeam(id);
      const start = startPosition(story, team.startNode);
      const moved = yield* store.moveTeam(id, team.step, {
        node: start?.node,
        state: start?.state ?? {},
        finished: false,
        action: 'reset',
      });
      return yield* singleTeamStatus(moved ?? (yield* requireTeam(id)));
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

    const codes = Effect.fn('Game.codes')(function* () {
      const teams = yield* store.listTeams();
      const entries: { kind: PrintableCode['kind']; id: number; label: string }[] = [
        ...teams.map((team) => ({ kind: 'T' as const, id: team.id, label: team.name })),
        // Places come from the story, so their codes change only with a deploy.
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
      graph,
      overview,
      singleTeamStatus,
      requireTeam,
      resetTeam,
      moveTeam,
      codes,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
