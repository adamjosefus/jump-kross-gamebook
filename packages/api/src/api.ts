import { Context, Schema } from 'effect'
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from 'effect/http-api'

// ---------------------------------------------------------------------------------------------
// Shared values

export const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
export const GameState = Schema.Record(Schema.String, Value)
export const NodeType = Schema.Literals(['start', 'passage', 'end'])
export const LocationKind = Schema.Literals(['progress', 'end'])
export type LocationKind = typeof LocationKind.Type

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
export class StepConflict extends Schema.TaggedError<StepConflict>()(
  'StepConflict',
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** A move the story does not allow right now (wrong location, hidden choice, …). */
export class InvalidMove extends Schema.TaggedError<InvalidMove>()(
  'InvalidMove',
  {
    reason: Schema.Literals([
      'wrong-location',
      'scan-required',
      'no-scan',
      'unavailable-choice',
      'finished',
      'unknown-node',
      'missing-target',
      'not-started',
    ]),
    message: Schema.String,
  },
  { httpApiStatus: 422 },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class DocumentHasErrors extends Schema.TaggedError<DocumentHasErrors>()(
  'DocumentHasErrors',
  { message: Schema.String, count: Schema.Number },
  { httpApiStatus: 422 },
) {}

// ---------------------------------------------------------------------------------------------
// Player

export const PlayerChoice = Schema.Struct({ index: Schema.Number, label: Schema.String })

export const PlayerView = Schema.Struct({
  team: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  /** Increments with every move; sent back as `expectedStep`. */
  step: Schema.Number,
  status: Schema.Literals(['playing', 'finished', 'not-ready']),
  node: Schema.optionalKey(
    Schema.Struct({
      id: Schema.String,
      type: NodeType,
      theme: Schema.optionalKey(Schema.String),
      markdown: Schema.String,
      choices: Schema.Array(PlayerChoice),
      scan: Schema.optionalKey(Schema.Number),
    }),
  ),
})
export type PlayerView = typeof PlayerView.Type

export const PlayerSessionCookie = HttpApiSecurity.apiKey({ key: 'gb_session', in: 'cookie' })

export class CurrentTeam extends Context.Service<
  CurrentTeam,
  { readonly sessionId: string; readonly teamId: number }
>()('gamebook/CurrentTeam') {}

export class PlayerAuth extends HttpApiMiddleware.Service<PlayerAuth, { provides: CurrentTeam }>()(
  'gamebook/PlayerAuth',
  { security: { session: PlayerSessionCookie }, error: Unauthorized },
) {}

export class PlayerGroup extends HttpApiGroup.make('player')
  .add(
    HttpApiEndpoint.post('login', '/login', {
      payload: Schema.Struct({ code: Schema.String }),
      success: PlayerView,
      error: [InvalidCode, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.get('state', '/state', { success: PlayerView, error: NotFound }).middleware(PlayerAuth),
    HttpApiEndpoint.post('choose', '/choose', {
      payload: Schema.Struct({ index: Schema.Number, expectedStep: Schema.Number }),
      success: PlayerView,
      error: [StepConflict, InvalidMove, NotFound],
    }).middleware(PlayerAuth),
    HttpApiEndpoint.post('scan', '/scan', {
      payload: Schema.Struct({ code: Schema.String, expectedStep: Schema.Number }),
      success: PlayerView,
      error: [InvalidCode, StepConflict, InvalidMove, NotFound],
    }).middleware(PlayerAuth),
    HttpApiEndpoint.post('logout', '/logout', {}).middleware(PlayerAuth),
  )
  .prefix('/api/player') {}

// ---------------------------------------------------------------------------------------------
// Admin

export const Draft = Schema.Struct({ source: Schema.String, updatedAt: Schema.String })

export const Location = Schema.Struct({ id: Schema.Number, name: Schema.String, kind: LocationKind })
export type Location = typeof Location.Type

export const TeamInput = Schema.Struct({ name: Schema.String, startNode: Schema.String })

export const TeamStatus = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  startNode: Schema.String,
  node: Schema.optionalKey(Schema.String),
  /** False when the team's node no longer exists in the published version. */
  nodeExists: Schema.Boolean,
  state: GameState,
  step: Schema.Number,
  finished: Schema.Boolean,
  updatedAt: Schema.String,
  /** Devices seen in the last two minutes. */
  devices: Schema.Number,
})
export type TeamStatus = typeof TeamStatus.Type

export const LogEntry = Schema.Struct({
  teamId: Schema.Number,
  at: Schema.String,
  action: Schema.String,
  fromNode: Schema.optionalKey(Schema.String),
  toNode: Schema.optionalKey(Schema.String),
  state: GameState,
})
export type LogEntry = typeof LogEntry.Type

export const Overview = Schema.Struct({
  version: Schema.optionalKey(
    Schema.Struct({ id: Schema.Number, publishedAt: Schema.String, source: Schema.String }),
  ),
  teams: Schema.Array(TeamStatus),
  locations: Schema.Array(Location),
  log: Schema.Array(LogEntry),
})
export type Overview = typeof Overview.Type

export const PrintableCode = Schema.Struct({
  kind: Schema.Literals(['T', 'L', 'E']),
  id: Schema.Number,
  label: Schema.String,
  code: Schema.String,
})
export type PrintableCode = typeof PrintableCode.Type

export const AdminSessionCookie = HttpApiSecurity.apiKey({ key: 'gb_admin', in: 'cookie' })

export class AdminAuth extends HttpApiMiddleware.Service<AdminAuth>()('gamebook/AdminAuth', {
  security: { cookie: AdminSessionCookie },
  error: Unauthorized,
}) {}

const teamParams = { id: Schema.Number }

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
    HttpApiEndpoint.get('draft', '/draft', { success: Draft }).middleware(AdminAuth),
    HttpApiEndpoint.put('saveDraft', '/draft', {
      payload: Schema.Struct({ source: Schema.String }),
      success: Draft,
    }).middleware(AdminAuth),
    HttpApiEndpoint.post('publish', '/publish', {
      success: Schema.Struct({ versionId: Schema.Number }),
      error: DocumentHasErrors,
    }).middleware(AdminAuth),
    HttpApiEndpoint.get('overview', '/overview', { success: Overview }).middleware(AdminAuth),
    HttpApiEndpoint.post('createTeam', '/teams', { payload: TeamInput, success: TeamStatus }).middleware(AdminAuth),
    HttpApiEndpoint.patch('updateTeam', '/teams/:id', {
      params: teamParams,
      payload: TeamInput,
      success: TeamStatus,
      error: NotFound,
    }).middleware(AdminAuth),
    HttpApiEndpoint.delete('deleteTeam', '/teams/:id', { params: teamParams, error: NotFound }).middleware(AdminAuth),
    HttpApiEndpoint.post('resetTeam', '/teams/:id/reset', {
      params: teamParams,
      success: TeamStatus,
      error: NotFound,
    }).middleware(AdminAuth),
    HttpApiEndpoint.post('moveTeam', '/teams/:id/move', {
      params: teamParams,
      payload: Schema.Struct({ node: Schema.String, state: GameState }),
      success: TeamStatus,
      error: NotFound,
    }).middleware(AdminAuth),
    HttpApiEndpoint.put('saveLocation', '/locations/:id', {
      params: teamParams,
      payload: Schema.Struct({ name: Schema.String, kind: LocationKind }),
      success: Location,
    }).middleware(AdminAuth),
    HttpApiEndpoint.delete('deleteLocation', '/locations/:id', { params: teamParams }).middleware(AdminAuth),
    HttpApiEndpoint.get('codes', '/codes', { success: Schema.Array(PrintableCode) }).middleware(AdminAuth),
  )
  .prefix('/api/admin') {}

export class Api extends HttpApi.make('gamebook').add(PlayerGroup).add(AdminGroup) {}
