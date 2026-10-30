import {
  applyChoice,
  applyScan,
  encodeQr,
  parseDocument,
  renderNode,
  startPosition,
  verifyQr,
  type GameGraph,
  type MoveError,
  type MoveResult,
} from '@gamebook/core';
import { Context, Effect, Layer } from 'effect';

import {
  DocumentHasErrors,
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
import { Store, type TeamMove, type TeamRow, type VersionRow } from './store.ts';

const MOVE_MESSAGES: Record<MoveError | 'not-started', string> = {
  'wrong-location': 'Tady to není. Jste na špatném místě.',
  'scan-required': 'Pokračujte naskenováním QR kódu na místě.',
  'no-scan': 'Teď není potřeba nic skenovat.',
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

export class Game extends Context.Service<Game>()('gamebook/Game', {
  make: Effect.gen(function* () {
    const store = yield* Store;
    const config = yield* ServerConfig;

    // Versions are immutable, so their parsed graphs can be cached for the life of the instance.
    const graphs = new Map<number, GameGraph>();
    const graphOf = (version: VersionRow) => {
      let graph = graphs.get(version.id);
      if (graph === undefined) {
        graph = parseDocument(version.source).graph;
        graphs.set(version.id, graph);
      }
      return graph;
    };
    const currentGraph = Effect.map(store.currentVersion(), (version) =>
      version === undefined ? undefined : graphOf(version),
    );

    const moveOf = (
      graph: GameGraph,
      result: Extract<MoveResult, { ok: true }>,
      action: string,
    ): TeamMove => ({
      node: result.position.node,
      state: result.position.state,
      finished: graph.nodes[result.position.node]?.type === 'end',
      action,
    });

    const view = (team: TeamRow, graph: GameGraph | undefined): PlayerView => {
      const base = { team: { id: team.id, name: team.name }, step: team.step };
      const node =
        graph === undefined || team.node === undefined
          ? undefined
          : renderNode(graph, { node: team.node, state: team.state });
      if (node === undefined) return { ...base, status: 'not-ready' };
      return {
        ...base,
        status: node.type === 'end' ? 'finished' : 'playing',
        node: {
          id: node.id,
          type: node.type,
          markdown: node.markdown,
          choices: node.choices,
          ...(node.theme === undefined ? {} : { theme: node.theme }),
          ...(node.scan === undefined ? {} : { scan: node.scan }),
        },
      };
    };

    /** Puts a team that has not started yet on its start node. */
    const ensureStarted = Effect.fn('Game.ensureStarted')(function* (
      team: TeamRow,
      graph: GameGraph | undefined,
    ) {
      if (team.node !== undefined || graph === undefined) return team;
      const start = startPosition(graph, team.startNode);
      if (start === undefined) return team;
      const moved = yield* store.moveTeam(team.id, team.step, {
        node: start.node,
        state: start.state,
        finished: false,
        action: 'start',
      });
      // Another device may have started it in the meantime; either way read the fresh row.
      return moved ?? (yield* store.getTeam(team.id)) ?? team;
    });

    const loadTeam = Effect.fn('Game.loadTeam')(function* (teamId: number) {
      const team = yield* store.getTeam(teamId);
      if (team === undefined) return yield* notFound('Tým');
      const graph = yield* currentGraph;
      return { team: yield* ensureStarted(team, graph), graph };
    });

    const playerView = Effect.fn('Game.playerView')(function* (teamId: number) {
      const { team, graph } = yield* loadTeam(teamId);
      return view(team, graph);
    });

    const commit = Effect.fn('Game.commit')(function* (
      team: TeamRow,
      graph: GameGraph,
      result: MoveResult,
      action: string,
    ) {
      if (!result.ok)
        return yield* new InvalidMove({
          reason: result.error,
          message: MOVE_MESSAGES[result.error],
        });
      const moved = yield* store.moveTeam(team.id, team.step, moveOf(graph, result, action));
      if (moved === undefined)
        return yield* new StepConflict({ message: 'Váš tým už mezitím rozhodl.' });
      return view(moved, graph);
    });

    const prepareMove = Effect.fn('Game.prepareMove')(function* (
      teamId: number,
      expectedStep: number,
    ) {
      const { team, graph } = yield* loadTeam(teamId);
      if (team.step !== expectedStep)
        return yield* new StepConflict({ message: 'Váš tým už mezitím rozhodl.' });
      if (graph === undefined || team.node === undefined) {
        return yield* new InvalidMove({
          reason: 'not-started',
          message: MOVE_MESSAGES['not-started'],
        });
      }
      return { team, graph, position: { node: team.node, state: team.state } };
    });

    const choose = Effect.fn('Game.choose')(function* (
      teamId: number,
      index: number,
      expectedStep: number,
    ) {
      const { team, graph, position } = yield* prepareMove(teamId, expectedStep);
      return yield* commit(team, graph, applyChoice(graph, position, index), `choice:${index}`);
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
      const location = yield* store.getLocation(payload.id);
      if (location === undefined || (location.kind === 'end') !== (payload.kind === 'E')) {
        return yield* new InvalidCode({ message: 'Tento QR kód už neplatí.' });
      }
      const { team, graph, position } = yield* prepareMove(teamId, expectedStep);
      return yield* commit(
        team,
        graph,
        applyScan(graph, position, location.id),
        `scan:${location.id}`,
      );
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

    const publish = Effect.fn('Game.publish')(function* () {
      const draft = yield* store.getDraft();
      const locations = yield* store.listLocations();
      const { diagnostics } = parseDocument(draft.source, {
        locations: locations.map((l) => l.id),
      });
      const errors = diagnostics.filter((d) => d.severity === 'error').length;
      if (errors > 0) {
        return yield* new DocumentHasErrors({
          message: `Dokument obsahuje ${errors} chyb.`,
          count: errors,
        });
      }
      const version = yield* store.publish(draft.source);
      return { versionId: version.id };
    });

    const teamStatus = (
      team: TeamRow,
      graph: GameGraph | undefined,
      devices: number,
    ): TeamStatus => ({
      id: team.id,
      name: team.name,
      startNode: team.startNode,
      ...(team.node === undefined ? {} : { node: team.node }),
      nodeExists:
        team.node === undefined || (graph !== undefined && Object.hasOwn(graph.nodes, team.node)),
      state: team.state,
      step: team.step,
      finished: team.finishedAt !== undefined,
      updatedAt: team.updatedAt.toISOString(),
      devices,
    });

    const singleTeamStatus = Effect.fn('Game.singleTeamStatus')(function* (team: TeamRow) {
      const devices = yield* store.activeDevices(new Date(Date.now() - DEVICE_WINDOW_MS));
      return teamStatus(team, yield* currentGraph, devices.get(team.id) ?? 0);
    });

    const overview = Effect.fn('Game.overview')(function* () {
      const [version, teams, locations, log, devices] = yield* Effect.all(
        [
          store.currentVersion(),
          store.listTeams(),
          store.listLocations(),
          store.recentLog(50),
          store.activeDevices(new Date(Date.now() - DEVICE_WINDOW_MS)),
        ],
        { concurrency: 'unbounded' },
      );
      const graph = version === undefined ? undefined : graphOf(version);
      const result: Overview = {
        ...(version === undefined
          ? {}
          : {
              version: {
                id: version.id,
                publishedAt: version.publishedAt.toISOString(),
                source: version.source,
              },
            }),
        teams: teams.map((team) => teamStatus(team, graph, devices.get(team.id) ?? 0)),
        locations,
        log: log.map((entry) => ({
          teamId: entry.teamId,
          at: entry.at.toISOString(),
          action: entry.action,
          state: entry.state,
          ...(entry.fromNode === undefined ? {} : { fromNode: entry.fromNode }),
          ...(entry.toNode === undefined ? {} : { toNode: entry.toNode }),
        })),
      };
      return result;
    });

    const requireTeam = Effect.fn('Game.requireTeam')(function* (id: number) {
      const team = yield* store.getTeam(id);
      return team === undefined ? yield* notFound('Tým') : team;
    });

    const resetTeam = Effect.fn('Game.resetTeam')(function* (id: number) {
      const team = yield* requireTeam(id);
      const graph = yield* currentGraph;
      const start = graph === undefined ? undefined : startPosition(graph, team.startNode);
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
      const graph = yield* currentGraph;
      const moved = yield* store.moveTeam(id, team.step, {
        node,
        state,
        finished: graph?.nodes[node]?.type === 'end',
        action: 'admin',
      });
      return yield* singleTeamStatus(moved ?? (yield* requireTeam(id)));
    });

    const codes = Effect.fn('Game.codes')(function* () {
      const [teams, locations] = yield* Effect.all([store.listTeams(), store.listLocations()]);
      const entries: { kind: PrintableCode['kind']; id: number; label: string }[] = [
        ...teams.map((team) => ({ kind: 'T' as const, id: team.id, label: team.name })),
        ...locations.map((location) => ({
          kind: location.kind === 'end' ? ('E' as const) : ('L' as const),
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
      publish,
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
