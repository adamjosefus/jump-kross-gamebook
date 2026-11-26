import { THEMES } from '@gamebook/core';
import { Context, Schema } from 'effect';
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from 'effect/http-api';

// ---------------------------------------------------------------------------------------------
// Shared values

export const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean]);
export const GameState = Schema.Record(Schema.String, Value);
export const NodeType = Schema.Literals(['intro', 'start', 'passage', 'end']);
export const Theme = Schema.Literals(THEMES);

// ---------------------------------------------------------------------------------------------
// Errors

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class InvalidCode extends Schema.TaggedError<InvalidCode>()(
  'InvalidCode',
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** Another device of the same team moved first; the client should refetch. */
export class RevisionConflict extends Schema.TaggedError<RevisionConflict>()(
  'RevisionConflict',
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** A move the story does not allow right now (wrong code, hidden choice, …). */
export class InvalidMove extends Schema.TaggedError<InvalidMove>()(
  'InvalidMove',
  {
    reason: Schema.Literals([
      // The engine's `wrong-code`, sent under its former name: a phone still running the build
      // from before codes were renamed would not decode the new one and show a generic error.
      // Once no such build is in use (after the next deploy outside a game), send `wrong-code`
      // and drop `reasonOf` in the game server.
      'wrong-location',
      'scan-required',
      'no-scan',
      'unavailable-choice',
      'finished',
      'unknown-node',
      'missing-target',
      'not-started',
      'broken-state',
    ]),
    message: Schema.String,
  },
  { httpApiStatus: 422 },
) {}

/** A state the game cannot hold: a value that is not a string, a boolean or a finite number. */
export class InvalidState extends Schema.TaggedError<InvalidState>()(
  'InvalidState',
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** The admin banned this device; it cannot log in until the admin unbans it. */
export class DeviceBanned extends Schema.TaggedError<DeviceBanned>()(
  'DeviceBanned',
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** The device logged in before devices had their own id, so it can be logged out but not banned. */
export class DeviceNotBannable extends Schema.TaggedError<DeviceNotBannable>()(
  'DeviceNotBannable',
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** The team reached the end; its clock has stopped and resetting it alone would leave no time. */
export class TeamFinished extends Schema.TaggedError<TeamFinished>()(
  'TeamFinished',
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** What a player reads while the game is closed, on the screen and in the refused request. */
export const GAME_CLOSED_MESSAGE = 'Hra je teď pozastavená. Vyčkejte na pokyn organizátorů.';

/** The admin closed the game: nobody logs in or moves until it opens again. */
export class GameClosed extends Schema.TaggedError<GameClosed>()(
  'GameClosed',
  { message: Schema.String },
  { httpApiStatus: 423 },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

/** What a player reads before the organisers start the game, on the screen and in the refused login. */
export const GAME_NOT_STARTED_MESSAGE = 'Hra ještě nezačala. Počkejte na pokyn organizátorů.';

/** The organisers have not started the game yet, so no team can log in. */
export class GameNotStarted extends Schema.TaggedError<GameNotStarted>()(
  'GameNotStarted',
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

// ---------------------------------------------------------------------------------------------
// Player

export const PlayerChoice = Schema.Struct({ index: Schema.Number, label: Schema.String });

export const PlayerSegment = Schema.Struct({
  theme: Theme,
  svg: Schema.optionalKey(Schema.String),
  content: Schema.String,
  /** Text of the button to the next segment, when the story sets one. */
  next: Schema.optionalKey(Schema.String),
});
export type PlayerSegment = typeof PlayerSegment.Type;

export const PlayerView = Schema.Struct({
  team: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  /** Increments with every move; sent back as `expectedRevision`. */
  revision: Schema.Number,
  /** `closed`: the admin closed the game; the view then has no node until it opens again. */
  status: Schema.Literals(['playing', 'finished', 'not-ready', 'closed']),
  /** The story's login texts, written for this team. */
  loginMessages: Schema.Struct({
    loggedIn: Schema.String,
    sameTeam: Schema.String,
    switchTitle: Schema.String,
    switchText: Schema.String,
    switchConfirm: Schema.String,
    switchCancel: Schema.String,
  }),
  node: Schema.optionalKey(
    Schema.Struct({
      id: Schema.String,
      type: NodeType,
      segments: Schema.Array(PlayerSegment),
      choices: Schema.Array(PlayerChoice),
      /** The team moves on by scanning a QR code instead of choosing. */
      scan: Schema.Boolean,
      /** The heading of the scan screen, when the story sets one. */
      scanTitle: Schema.optionalKey(Schema.String),
      /** The text under that heading, when the story sets one. */
      scanText: Schema.optionalKey(Schema.String),
      /** The node's chapter does not count: the game time stands still, the screen says so. */
      timeStops: Schema.Boolean,
    }),
  ),
});
export type PlayerView = typeof PlayerView.Type;

export const PlayerSessionCookie = HttpApiSecurity.apiKey({ key: 'gb_session', in: 'cookie' });

/**
 * The device's own id, set at its first login and kept for a year, so a banned device stays
 * banned after its session ends. Clearing the browser's data makes it a new device.
 */
export const DeviceCookie = HttpApiSecurity.apiKey({ key: 'gb_device', in: 'cookie' });

export class CurrentTeam extends Context.Service<
  CurrentTeam,
  { readonly sessionId: string; readonly teamId: number }
>()('gamebook/CurrentTeam') {}

export class PlayerAuth extends HttpApiMiddleware.Service<PlayerAuth, { provides: CurrentTeam }>()(
  'gamebook/PlayerAuth',
  { security: { session: PlayerSessionCookie }, error: Unauthorized },
) {}

/** What anyone sees before scanning a team's login code. */
export const PlayerIntro = Schema.Struct({
  /** The organisers started the game; until then the login does not work. */
  started: Schema.Boolean,
  /** The admin closed the game; the login does not work until it opens again. */
  closed: Schema.Boolean,
  segments: Schema.Array(PlayerSegment),
  /** The heading of the login scan screen, when the story sets one. */
  scanTitle: Schema.optionalKey(Schema.String),
  /** The text under that heading, when the story sets one. */
  scanText: Schema.optionalKey(Schema.String),
});
export type PlayerIntro = typeof PlayerIntro.Type;

export class PlayerGroup extends HttpApiGroup.make('player')
  .add(
    HttpApiEndpoint.get('intro', '/intro', { success: PlayerIntro }),
    HttpApiEndpoint.post('login', '/login', {
      payload: Schema.Struct({ code: Schema.String }),
      success: PlayerView,
      error: [InvalidCode, NotFound, GameNotStarted, GameClosed, DeviceBanned],
    }),
  )
  .add(
    HttpApiEndpoint.get('state', '/state', { success: PlayerView, error: NotFound }).middleware(
      PlayerAuth,
    ),
    HttpApiEndpoint.post('choose', '/choose', {
      payload: Schema.Struct({ index: Schema.Number, expectedRevision: Schema.Number }),
      success: PlayerView,
      error: [RevisionConflict, InvalidMove, NotFound, GameClosed],
    }).middleware(PlayerAuth),
    HttpApiEndpoint.post('scan', '/scan', {
      payload: Schema.Struct({ code: Schema.String, expectedRevision: Schema.Number }),
      success: PlayerView,
      error: [InvalidCode, RevisionConflict, InvalidMove, NotFound, GameClosed],
    }).middleware(PlayerAuth),
    HttpApiEndpoint.post('logout', '/logout', {}).middleware(PlayerAuth),
  )
  .prefix('/api/player') {}

// ---------------------------------------------------------------------------------------------
// Admin

/** A named part of the story; the time of one that does not count is left out of the result. */
export const Chapter = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  counts: Schema.Boolean,
});
export type Chapter = typeof Chapter.Type;

export const StoryGraph = Schema.Struct({
  /** The node anyone sees before scanning a team's code; the login leads from it to the start. */
  introNode: Schema.String,
  /** The node the game ends at. */
  outroNode: Schema.String,
  order: Schema.Array(Schema.String),
  /** The node every team starts at; the previews are computed from it. */
  start: Schema.optionalKey(Schema.String),
  nodes: Schema.Record(
    Schema.String,
    Schema.Struct({
      id: Schema.String,
      type: NodeType,
      dynamic: Schema.Boolean,
      reached: Schema.Boolean,
      chapter: Schema.optionalKey(Schema.String),
      preview: Schema.optionalKey(
        Schema.Struct({
          state: Schema.optionalKey(GameState),
          segments: Schema.Array(Schema.String),
        }),
      ),
      choices: Schema.Array(
        Schema.Struct({
          label: Schema.String,
          /** Set on QR choices. */
          code: Schema.optionalKey(Schema.Number),
          target: Schema.String,
          conditional: Schema.Boolean,
          available: Schema.optionalKey(Schema.Boolean),
        }),
      ),
    }),
  ),
  chapters: Schema.Array(Chapter),
});

export const QrCode = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});
export type QrCode = typeof QrCode.Type;

/**
 * Where a team is in the story now: in a chapter, or between two (on nodes of no chapter). `ms` is
 * how long it has been there by the server's clock, so the admin's own clock, which may be off,
 * only counts on from there. `counts` says whether this time counts towards its result.
 */
export const TeamPhase = Schema.Struct({
  /** Missing between chapters. */
  chapter: Schema.optionalKey(Schema.String),
  counts: Schema.Boolean,
  since: Schema.String,
  ms: Schema.Number,
});
export type TeamPhase = typeof TeamPhase.Type;

/**
 * A stretch between two chapters, on nodes of no chapter. `from` is the chapter the team left, ""
 * at the start of the game; `to` the one it came to next, "" at the end or while it is still on
 * its way.
 */
export const ChapterGap = Schema.Struct({ from: Schema.String, to: Schema.String });
export type ChapterGap = typeof ChapterGap.Type;

/** The key of a gap in the teams' times: `from>to`. */
export const gapKey = ({ from, to }: ChapterGap) => `${from}>${to}`;

/** The times of every team by chapter and between chapters. */
export const TimeBreakdown = Schema.Struct({
  /** In the story's order. */
  chapters: Schema.Array(Chapter),
  /** The gaps some team went through, in the order of the chapters they lie between. */
  gaps: Schema.Array(ChapterGap),
  teams: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      /** Ms by chapter id; a chapter the team never got to is missing. */
      chapters: Schema.Record(Schema.String, Schema.Number),
      /** Ms by `gapKey`; a gap the team never went through is missing. */
      gaps: Schema.Record(Schema.String, Schema.Number),
    }),
  ),
});
export type TimeBreakdown = typeof TimeBreakdown.Type;

export const TeamStatus = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  /** Missing until the team logs in for the first time, and after a reset. */
  node: Schema.optionalKey(Schema.String),
  /** False when the team's node no longer exists in the story. */
  nodeExists: Schema.Boolean,
  state: GameState,
  /** Increments with every move of the team. */
  revision: Schema.Number,
  finished: Schema.Boolean,
  /** The team's last move; missing for a team that never logged in. */
  updatedAt: Schema.optionalKey(Schema.String),
  /** Devices seen in the last two minutes. */
  devices: Schema.Number,
  /** The team's first login after the game started; missing before it and after a reset. */
  startedAt: Schema.optionalKey(Schema.String),
  /** When the team reached the end; missing while it plays. */
  finishedAt: Schema.optionalKey(Schema.String),
  /** From `startedAt` until `finishedAt`, or until now; missing before the first login. */
  playtimeMs: Schema.optionalKey(Schema.Number),
  /**
   * The total time without the chapters that do not count: what the team is ranked by. Missing
   * before the first login.
   */
  resultMs: Schema.optionalKey(Schema.Number),
  /** Missing before the first login and after the end. */
  phase: Schema.optionalKey(TeamPhase),
});
export type TeamStatus = typeof TeamStatus.Type;

/** The game as a whole: started by the organisers, or not yet. */
export const GameInfo = Schema.Struct({
  /** Missing until the organisers start the game, and after a new game. */
  startedAt: Schema.optionalKey(Schema.String),
  /** The admin closed the game: nobody logs in or moves until it opens again. */
  closed: Schema.Boolean,
  /** When the admin last opened or closed the game; missing when it never happened. */
  closedChangedAt: Schema.optionalKey(Schema.String),
});
export type GameInfo = typeof GameInfo.Type;

export const LogEntry = Schema.Struct({
  teamId: Schema.Number,
  at: Schema.String,
  action: Schema.String,
  fromNode: Schema.optionalKey(Schema.String),
  toNode: Schema.optionalKey(Schema.String),
  state: GameState,
});
export type LogEntry = typeof LogEntry.Type;

/** A device logged in to a team, from its login until the session expires or it logs out. */
export const Device = Schema.Struct({
  /** Stands for the device; derived from its session, which itself is never shown. */
  id: Schema.String,
  teamId: Schema.Number,
  teamName: Schema.String,
  loggedInAt: Schema.String,
  lastSeenAt: Schema.String,
  /** Seen in the last two minutes. */
  active: Schema.Boolean,
  /** The address the device logged in from; missing when the proxy did not report it. */
  ip: Schema.optionalKey(Schema.String),
  userAgent: Schema.optionalKey(Schema.String),
  /** False for a device logged in before devices had their own cookie: it can only be logged out. */
  bannable: Schema.Boolean,
});
export type Device = typeof Device.Type;

/** A device the admin banned, as it was when it was banned. */
export const BannedDevice = Schema.Struct({
  /** Stands for the ban; derived from the device's cookie, which itself is never shown. */
  id: Schema.String,
  teamId: Schema.Number,
  teamName: Schema.String,
  bannedAt: Schema.String,
  ip: Schema.optionalKey(Schema.String),
  userAgent: Schema.optionalKey(Schema.String),
});
export type BannedDevice = typeof BannedDevice.Type;

export const Overview = Schema.Struct({
  game: GameInfo,
  teams: Schema.Array(TeamStatus),
  codes: Schema.Array(QrCode),
  /** The story's chapters; the phase of a team names one by its id. */
  chapters: Schema.Array(Chapter),
  log: Schema.Array(LogEntry),
  /** How many times teams arrived at each node; scans do not count. */
  visits: Schema.Record(Schema.String, Schema.Number),
});
export type Overview = typeof Overview.Type;

/** The devices of the game, apart from the overview, which the live view polls often. */
export const Devices = Schema.Struct({
  /** Every device logged in to a team, the most recently seen first. */
  devices: Schema.Array(Device),
  /** Banned devices, the most recent ban first. */
  bans: Schema.Array(BannedDevice),
});
export type Devices = typeof Devices.Type;

export const PrintableCode = Schema.Struct({
  kind: Schema.Literals(['T', 'L']),
  id: Schema.Number,
  label: Schema.String,
  code: Schema.String,
  /**
   * The story's texts of the scan screens that take this code, each once: the intro's for a team's
   * login code, those of the nodes accepting it for the others. `null` stands for the scan screens
   * without a text of their own; empty when no node takes the code. For the organisers only.
   */
  scanTexts: Schema.Array(Schema.NullOr(Schema.String)),
});
export type PrintableCode = typeof PrintableCode.Type;

/**
 * One step of a test run from the admin. Nothing is stored: the client keeps the position and
 * sends it back with the move. Without a position the run is at the intro: a team's login code
 * (or no move, which skips it) leads to the start.
 */
export const PlaytestInput = Schema.Struct({
  position: Schema.optionalKey(Schema.Struct({ node: Schema.String, state: GameState })),
  /** The team the content is shown for; the first one of the story when missing. */
  team: Schema.optionalKey(Schema.Number),
  move: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ choice: Schema.Number }),
      /** Skips the QR code: moves as if the code with this number was scanned. */
      Schema.Struct({ scan: Schema.Number }),
      /** A scanned or typed QR code, checked like in the game. */
      Schema.Struct({ code: Schema.String }),
    ]),
  ),
});

export const PlaytestView = Schema.Struct({
  /** The team the content is shown for: the one whose code was scanned at the intro. */
  team: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  node: Schema.String,
  state: GameState,
  /** What the players see; unlike `PlayerView` it names the codes the node can be left by. */
  view: Schema.Struct({
    id: Schema.String,
    type: NodeType,
    segments: Schema.Array(PlayerSegment),
    choices: Schema.Array(PlayerChoice),
    scan: Schema.Boolean,
    scanTitle: Schema.optionalKey(Schema.String),
    scanText: Schema.optionalKey(Schema.String),
    timeStops: Schema.Boolean,
    scans: Schema.Array(QrCode),
  }),
});
export type PlaytestView = typeof PlaytestView.Type;

export const AdminSessionCookie = HttpApiSecurity.apiKey({ key: 'gb_admin', in: 'cookie' });

export class AdminAuth extends HttpApiMiddleware.Service<AdminAuth>()('gamebook/AdminAuth', {
  security: { cookie: AdminSessionCookie },
  error: Unauthorized,
}) {}

const teamParams = { id: Schema.Number } as const;

export class AdminGroup extends HttpApiGroup.make('admin')
  .add(
    HttpApiEndpoint.post('login', '/login', {
      payload: Schema.Struct({ password: Schema.String }),
      error: Unauthorized,
    }),
  )
  .add(
    HttpApiEndpoint.get('me', '/me', {}).middleware(AdminAuth),
    HttpApiEndpoint.post('logout', '/logout', {}).middleware(AdminAuth),
    HttpApiEndpoint.get('story', '/story', { success: StoryGraph }).middleware(AdminAuth),
    HttpApiEndpoint.post('playtest', '/playtest', {
      payload: PlaytestInput,
      success: PlaytestView,
      error: [InvalidCode, InvalidMove, InvalidState, NotFound],
    }).middleware(AdminAuth),
    HttpApiEndpoint.get('overview', '/overview', { success: Overview }).middleware(AdminAuth),
    HttpApiEndpoint.get('timeBreakdown', '/time-breakdown', { success: TimeBreakdown }).middleware(
      AdminAuth,
    ),
    /** Lets the teams log in; the clock of each starts with its first login. */
    HttpApiEndpoint.post('startGame', '/game/start', { success: GameInfo }).middleware(AdminAuth),
    HttpApiEndpoint.post('setClosed', '/game/closed', {
      payload: Schema.Struct({ closed: Schema.Boolean }),
      success: GameInfo,
    }).middleware(AdminAuth),
    HttpApiEndpoint.get('devices', '/devices', { success: Devices }).middleware(AdminAuth),
    /** Ends the device's session; it can log in again with a team code. */
    HttpApiEndpoint.post('logoutDevice', '/devices/:id/logout', {
      params: { id: Schema.String },
      error: NotFound,
    }).middleware(AdminAuth),
    /** Ends every session of the device and refuses its logins until it is unbanned. */
    HttpApiEndpoint.post('banDevice', '/devices/:id/ban', {
      params: { id: Schema.String },
      error: [NotFound, DeviceNotBannable],
    }).middleware(AdminAuth),
    HttpApiEndpoint.post('unbanDevice', '/bans/:id/remove', {
      params: { id: Schema.String },
      error: NotFound,
    }).middleware(AdminAuth),
    HttpApiEndpoint.post('resetAll', '/teams/reset', {
      success: Schema.Array(TeamStatus),
    }).middleware(AdminAuth),
    HttpApiEndpoint.post('resetTeam', '/teams/:id/reset', {
      params: teamParams,
      success: TeamStatus,
      error: NotFound,
    }).middleware(AdminAuth),
    /**
     * Forgets the team's times and logs its devices out; the progress stays. The clock runs again
     * from the team's next login.
     */
    HttpApiEndpoint.post('resetTeamTime', '/teams/:id/reset-time', {
      params: teamParams,
      success: TeamStatus,
      error: [NotFound, TeamFinished],
    }).middleware(AdminAuth),
    HttpApiEndpoint.post('moveTeam', '/teams/:id/move', {
      params: teamParams,
      /** Keys the state leaves out keep the start's values, so no counter is missing later. */
      payload: Schema.Struct({ node: Schema.String, state: GameState }),
      success: TeamStatus,
      error: [InvalidState, NotFound],
    }).middleware(AdminAuth),
    HttpApiEndpoint.get('codes', '/codes', { success: Schema.Array(PrintableCode) }).middleware(
      AdminAuth,
    ),
  )
  .prefix('/api/admin') {}

export class Api extends HttpApi.make('gamebook').add(PlayerGroup).add(AdminGroup) {}
