import { Api } from '@gamebook/api';
import { Cause, Context, Effect, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient, HttpClientError } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';

class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  'gamebook/ApiClient',
) {}

const runtime = ManagedRuntime.make(
  Layer.effect(ApiClient, HttpApiClient.make(Api)).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: 'same-origin' })),
  ),
);

export type Client = ApiClient['Service'];

export interface ApiError {
  readonly _tag: string;
  readonly message?: string;
  readonly reason?: string;
}

/** Errors the API declares; their messages are written for the user. */
const DECLARED: ReadonlySet<string> = new Set([
  'Unauthorized',
  'InvalidCode',
  'StepConflict',
  'InvalidMove',
  'NotFound',
  'GameNotStarted',
  'GameClosed',
  'DeviceBanned',
  'DeviceNotBannable',
  'TeamFinished',
]);

const OFFLINE =
  'Nepodařilo se spojit se serverem. Zkontrolujte připojení k internetu a zkuste to znovu.';
const TIMED_OUT = 'Server dlouho neodpovídá. Zkontrolujte připojení k internetu a zkuste to znovu.';

/**
 * How long a request may take. In the field a connection often hangs rather than fails: the
 * packets go nowhere and the socket stays open, so without a limit a button would spin for
 * minutes and the game would look frozen.
 */
const TIMEOUT = '15 seconds';
const MISCONFIGURED =
  'Server není nastavený, takže hra teď nejde spustit. Dejte vědět organizátorům.';
const SERVER_DOWN =
  'Na serveru se něco pokazilo. Zkuste to za chvíli znovu, a když to nepomůže, dejte vědět organizátorům.';
const UNEXPECTED =
  'Server poslal odpověď, které aplikace nerozumí. Nejspíš vyšla nová verze, zkuste stránku načíst znovu.';

const isMisconfigured = (body: unknown) =>
  typeof body === 'object' &&
  body !== null &&
  '_tag' in body &&
  body._tag === 'ServerMisconfigured';

/**
 * Turns what is not a declared API error (no connection, a crashed or misconfigured server, a
 * response the client cannot decode) into an `ApiError` whose message tells a player what happened
 * and what to do. The technical error, and a misconfigured server's own message, go to the console.
 */
const understandable = async (error: unknown): Promise<unknown> => {
  if (isApiError(error) && DECLARED.has(error._tag)) return error;
  console.error(error);
  if (Cause.isTimeoutError(error))
    return { _tag: 'Offline', message: TIMED_OUT } satisfies ApiError;
  if (!HttpClientError.isHttpClientError(error))
    return { _tag: 'UnexpectedResponse', message: UNEXPECTED } satisfies ApiError;
  // The request never got an answer: no network, or the server did not respond at all.
  if (error.reason._tag === 'TransportError')
    return { _tag: 'Offline', message: OFFLINE } satisfies ApiError;
  const response = error.response;
  if (response === undefined || response.status < 500)
    return { _tag: 'UnexpectedResponse', message: UNEXPECTED } satisfies ApiError;
  const body: unknown = await Effect.runPromise(response.json).catch(() => undefined);
  if (isMisconfigured(body)) {
    console.error(body);
    return { _tag: 'ServerMisconfigured', message: MISCONFIGURED } satisfies ApiError;
  }
  return { _tag: 'ServerError', message: SERVER_DOWN } satisfies ApiError;
};

/**
 * Runs a typed API call as a Promise for TanStack Query. Failures reject with the tagged error
 * itself (`{ _tag: 'StepConflict', message }`), so callers can branch on `_tag`; anything else
 * rejects as an `ApiError` with an understandable message.
 */
export const api = <A, E>(
  call: (client: Client) => Effect.Effect<A, E>,
  options?: { readonly signal?: AbortSignal },
): Promise<A> =>
  runtime
    .runPromise(
      Effect.gen(function* () {
        return yield* call(yield* ApiClient);
      }).pipe(Effect.timeout(TIMEOUT)),
      options?.signal === undefined ? undefined : { signal: options.signal },
    )
    .catch(async (error: unknown) => {
      // A cancelled query is TanStack's own doing; it expects the rejection as it is.
      if (options?.signal?.aborted === true) throw error;
      throw await understandable(error);
    });

export const isApiError = (error: unknown, tag?: string): error is ApiError =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  (tag === undefined || error._tag === tag);

export const errorMessage = (error: unknown): string =>
  isApiError(error) && typeof error.message === 'string' && error.message !== ''
    ? error.message
    : 'Něco se pokazilo. Zkuste to znovu.';
