import {
  applyChoice,
  applyScan,
  availableScans,
  encodeQr,
  introScreens,
  loginMessages,
  renderNode,
  sampleTeam,
  startPosition,
  toGraph,
  unsoundStateKeys,
  verifyQr,
  type GameGraph,
  type MoveError,
  type MoveResult,
  type Story,
} from '@gamebook/core';
import type { State } from '@gamebook/core';
import { Context, Effect, Layer } from 'effect';

import {
  InvalidCode,
  InvalidMove,
  InvalidState,
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

const MOVE_MESSAGES: Readonly<Record<MoveError | 'not-started' | 'broken-state', string>> = {
  'wrong-code': 'Tento kód vás teď nikam nevede.',
  'scan-required': 'Pokračujte naskenováním QR kódu.',
  'no-scan': 'Teď se vybírá v aplikaci, ne skenováním.',
  'unavailable-choice': 'Tuto volbu teď nelze vybrat.',
  finished: 'Hra už skončila.',
  'unknown-node': 'Příběh je teď nedostupný. Kontaktujte organizátory.',
  'missing-target': 'Příběh je teď nedostupný. Kontaktujte organizátory.',
  'not-started': 'Hra ještě nezačala.',
  'broken-state': 'Příběh je teď nedostupný. Kontaktujte organizátory.',
};

const DEVICE_WINDOW_MS = 2 * 60 * 1000;

/**
 * The most one continuous view of a text counts for. A phone left unlocked on a text while the
 * team walks is not reading.
 */
const MAX_READING_MS = 5 * 60 * 1000;

/** The state the game cannot hold, named for the admin. */
const invalidState = (state: State) =>
  new InvalidState({
    message: `Stav má hodnoty, které nejsou text, číslo ani ano/ne: ${unsoundStateKeys(state).join(', ')}.`,
  });

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
    // Previews depend only on the story, so the graph is computed once, lazily on the first
    // admin request; the cache has to be a `let` for that.
    let cachedGraph: GameGraph | undefined;
    const graph = () => (cachedGraph ??= toGraph(story));
    const introNode = story.nodes[story.introNode];
    const intro = {
      screens: introScreens(story),
      ...(introNode?.scanTitle === undefined ? {} : { scanTitle: introNode.scanTitle }),
      ...(introNode?.scanText === undefined ? {} : { scanText: introNode.scanText }),
    };

    // Before the login there is no team; these texts are written without one.
    const loginTexts = loginMessages(story, sampleTeam(story));

    const teamName = (id: number) =>
      story.teams.find((team) => team.id === id)?.name ?? `Tým ${id}`;

    const isEnd = (node: string | undefined) => node === story.outroNode;

    const moveOf = (result: Extract<MoveResult, { ok: true }>, action: string): TeamMove => ({
      ...result.position,
      finished: isEnd(result.position.node),
      action,
    });

    const identityOf = (team: TeamRow) => ({ id: team.id, name: teamName(team.id) });

    const view = (team: TeamRow): PlayerView => {
      const identity = identityOf(team);
      const { loggedIn, sameTeam, switchTitle, switchText, switchConfirm, switchCancel } =
        loginMessages(story, identity);
      const base = {
        team: identity,
        step: team.step,
        loginMessages: { loggedIn, sameTeam, switchTitle, switchText, switchConfirm, switchCancel },
      };
      const node =
        team.node === undefined
          ? undefined
          : renderNode(story, { node: team.node, state: team.state }, identity);
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
          ...(node.scanText === undefined ? {} : { scanText: node.scanText }),
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
      // A `NaN` or an object in the state is a mistake in the story (or an admin's state without a
      // key the story counts on). Stored, it would make the team's row unreadable; refused, the
      // team stays where it is and the admin can mend the state.
      const broken = unsoundStateKeys(result.position.state);
      if (broken.length > 0) {
        console.error(
          `Tah ${action} týmu ${team.id} z uzlu ${team.node} dal neplatný stav (${broken.join(', ')}): ${JSON.stringify(result.position.state)}`,
        );
        return yield* new InvalidMove({
          reason: 'broken-state',
          message: MOVE_MESSAGES['broken-state'],
        });
      }
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
      return yield* commit(
        team,
        applyChoice(story, position, identityOf(team), index),
        `choice:${index}`,
      );
    });

    /** The story's team whose login code was scanned. */
    const teamOf = Effect.fn('Game.teamOf')(function* (code: string) {
      const payload = yield* Effect.promise(() => verifyQr(config.qrSecret, code));
      if (payload?.kind !== 'T') {
        yield* penalty;
        return yield* new InvalidCode({
          message: payload === undefined ? loginTexts.foreignCode : loginTexts.notTeamCode,
        });
      }
      const team = story.teams.find((candidate) => candidate.id === payload.id);
      if (team === undefined) return yield* new InvalidCode({ message: loginTexts.unknownTeam });
      return team;
    });

    /** The story's code a scanned QR code is. */
    const qrCodeOf = Effect.fn('Game.qrCodeOf')(function* (code: string) {
      const payload = yield* Effect.promise(() => verifyQr(config.qrSecret, code));
      if (payload === undefined) {
        yield* penalty;
        return yield* new InvalidCode({ message: 'Tento QR kód nepatří ke hře.' });
      }
      if (payload.kind === 'T')
        return yield* new InvalidCode({ message: 'Tohle je přihlašovací kód týmu.' });
      const qrCode = story.codes.find((candidate) => candidate.id === payload.id);
      if (qrCode === undefined)
        return yield* new InvalidCode({ message: 'Tento QR kód už neplatí.' });
      return qrCode;
    });

    const scan = Effect.fn('Game.scan')(function* (
      teamId: number,
      code: string,
      expectedStep: number,
    ) {
      const qrCode = yield* qrCodeOf(code);
      const { team, position } = yield* prepareMove(teamId, expectedStep);
      const moved = yield* commit(
        team,
        applyScan(story, position, identityOf(team), qrCode.id),
        `scan:${qrCode.id}`,
      );
      // After a reset the phones stay logged in, so the game starts with the first scan that
      // moves the team; one at a wrong place does not start the clock.
      if (team.startedAt === undefined) yield* store.markStarted(team.id);
      return moved;
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
      readFor: number | undefined,
      intervals: readonly { readonly ms: number; readonly agoMs: number }[],
    ) {
      // Times read for another team (the device switched meanwhile) belong to nobody now.
      if (readFor !== undefined && readFor !== teamId) return;
      const team = yield* store.getTeam(teamId);
      // Reading counts within the game only: from the team's first scan to its end, so a device's
      // wrong clock or a request after the game cannot inflate it.
      if (team?.startedAt === undefined) return;
      const now = Date.now();
      const from = team.startedAt.getTime();
      const to = Math.min(team.finishedAt?.getTime() ?? now, now);
      // A device's numbers are not trusted: a non-finite one would make an invalid date and fail
      // the insert, so such an interval is dropped like one of no length.
      const rows = intervals.flatMap(({ ms, agoMs }) => {
        if (!Number.isFinite(ms) || !Number.isFinite(agoMs)) return [];
        const ended = Math.min(now - Math.max(agoMs, 0), to);
        const started = Math.max(ended - Math.min(ms, MAX_READING_MS), from);
        return ended > started
          ? [{ teamId, startedAt: new Date(started), endedAt: new Date(ended) }]
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
      // A team without a row never logged in and has no last move.
      ...(team.node === undefined && team.step === 0
        ? {}
        : { updatedAt: team.updatedAt.toISOString() }),
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
        codes: story.codes,
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

    /**
     * The admin's move of a team, whatever its devices do at the same moment: a player's move in
     * between must not make the admin's one silently vanish. The row exists, so the move applies.
     */
    const adminMove = Effect.fn('Game.adminMove')(function* (team: TeamRow, move: TeamMove) {
      const moved = yield* store.moveTeam(team.id, undefined, move);
      if (moved === undefined) return yield* Effect.die(new Error(`Tým ${team.id} zmizel.`));
      return moved;
    });

    /** Puts the team back on the start with the initial state, on every device. */
    const resetTeam = Effect.fn('Game.resetTeam')(function* (id: number) {
      const team = yield* requireTeam(id);
      const start = startPosition(story);
      const moved = yield* adminMove(team, {
        node: start?.node,
        state: start?.state ?? {},
        finished: false,
        action: 'reset',
      });
      yield* store.clearTiming(id);
      // The row from the move still has the old first scan.
      return yield* singleTeamStatus({ ...moved, startedAt: undefined });
    });

    /** A new game: every team back on the start, in one write, so no team is left behind. */
    const resetAll = Effect.fn('Game.resetAll')(function* () {
      const start = startPosition(story);
      const rows = yield* store.resetTeams(
        story.teams.map(({ id }) => id),
        { node: start?.node, state: start?.state ?? {}, finished: false, action: 'reset' },
      );
      const devices = yield* store.activeDevices(new Date(Date.now() - DEVICE_WINDOW_MS));
      // The reading of every team was just cleared.
      return rows.map((row) => teamStatus(row, devices.get(row.id) ?? 0, 0));
    });

    const moveTeam = Effect.fn('Game.moveTeam')(function* (id: number, node: string, given: State) {
      const team = yield* requireTeam(id);
      // `story.nodes[node]` alone would find `toString` and the like on the prototype.
      if (!Object.hasOwn(story.nodes, node)) return yield* notFound(`Uzel ${node}`);
      // A key the admin leaves out keeps the start's value, so the story does not count with a
      // missing one later (`state.gold - 20` of nothing is `NaN`).
      const state: State = { ...startPosition(story)?.state, ...given };
      if (unsoundStateKeys(state).length > 0) return yield* invalidState(state);
      const moved = yield* adminMove(team, {
        node,
        state,
        finished: isEnd(node),
        action: 'admin',
      });
      return yield* singleTeamStatus(moved);
    });

    /** A test run: the same rules as the game, but the position comes from the client. */
    const playtest = Effect.fn('Game.playtest')(function* (input: {
      readonly position?: { readonly node: string; readonly state: TeamRow['state'] };
      readonly team?: number;
      readonly move?:
        | { readonly choice: number }
        | { readonly scan: number }
        | { readonly code: string };
    }) {
      // At the intro only a team's login code (or no move, which skips it) goes on, to the start.
      const scanned =
        input.position === undefined && input.move !== undefined && 'code' in input.move
          ? yield* teamOf(input.move.code)
          : undefined;
      const team =
        scanned ?? story.teams.find((known) => known.id === input.team) ?? sampleTeam(story);
      if (input.position !== undefined) {
        if (!Object.hasOwn(story.nodes, input.position.node))
          return yield* notFound(`Uzel ${input.position.node}`);
        if (unsoundStateKeys(input.position.state).length > 0)
          return yield* invalidState(input.position.state);
      }
      const start = input.position ?? startPosition(story);
      if (start === undefined) return yield* notFound('Start');
      const result: MoveResult =
        input.move === undefined || input.position === undefined
          ? { ok: true, position: start }
          : 'choice' in input.move
            ? applyChoice(story, start, team, input.move.choice)
            : applyScan(
                story,
                start,
                team,
                'scan' in input.move ? input.move.scan : (yield* qrCodeOf(input.move.code)).id,
              );
      if (!result.ok)
        return yield* new InvalidMove({
          reason: result.error,
          message: MOVE_MESSAGES[result.error],
        });
      const { position } = result;
      const node = story.nodes[position.node];
      const rendered = renderNode(story, position, team);
      if (node === undefined || rendered === undefined)
        return yield* notFound(`Uzel ${position.node}`);
      const step: PlaytestView = {
        team,
        node: position.node,
        state: position.state,
        view: {
          ...rendered,
          scans: availableScans(node, position.state, team).flatMap(
            (option) => story.codes.find((qrCode) => qrCode.id === option.scan.code) ?? [],
          ),
        },
      };
      return step;
    });

    const codes = Effect.fn('Game.codes')(function* () {
      // Teams and codes come from the story, so their codes change only with a deploy.
      const entries: readonly {
        readonly kind: PrintableCode['kind'];
        readonly id: number;
        readonly label: string;
      }[] = [
        ...story.teams.map((team) => ({ kind: 'T' as const, id: team.id, label: team.name })),
        ...story.codes.map((qrCode) => ({ kind: 'L' as const, id: qrCode.id, label: qrCode.name })),
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
