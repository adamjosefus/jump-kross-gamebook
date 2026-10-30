import { Api } from '@gamebook/api';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient } from 'effect/http';
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

/**
 * Runs a typed API call as a Promise for TanStack Query. Failures reject with the tagged error
 * itself (`{ _tag: 'StepConflict', message }`), so callers can branch on `_tag`.
 */
export const api = <A, E>(
  call: (client: Client) => Effect.Effect<A, E>,
  options?: { readonly signal?: AbortSignal },
): Promise<A> =>
  runtime.runPromise(
    Effect.gen(function* () {
      return yield* call(yield* ApiClient);
    }),
    options?.signal === undefined ? undefined : { signal: options.signal },
  );

export interface ApiError {
  readonly _tag: string;
  readonly message?: string;
  readonly reason?: string;
}

export const isApiError = (error: unknown, tag?: string): error is ApiError =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  (tag === undefined || error._tag === tag);

export const errorMessage = (error: unknown): string =>
  isApiError(error) && typeof error.message === 'string' && error.message !== ''
    ? error.message
    : 'Něco se pokazilo. Zkuste to znovu.';
