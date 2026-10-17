// The three ways a call to the platform can fail, as the screens need to tell them apart.
//
// `offline` — the request never got an answer: the network, DNS or CORS stopped it, or the timeout
// fired. `refused` — the platform answered with its own error contract, `{code, message}`, and the
// screen acts on the code. `unknown` — it answered, but with something the contract does not describe
// (a 5xx, a proxy's HTML, a body of the wrong shape), which no screen can act on.
export type ApiErrorKind = 'offline' | 'refused' | 'unknown';

/** The kind of failure, as a value a pure module can answer with. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** The status the platform answered, when it answered at all. */
  readonly status: number | null;
  /** The `code` of the error body — `invalid_credentials`, `invalid_token`, … — when there is one. */
  readonly code: string | null;

  constructor(kind: ApiErrorKind, status: number | null, code: string | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

/** How a caught value failed. Never throws: a value that is not an `ApiError` is `unknown`. */
export function failureOf(error: unknown): ApiErrorKind {
  return error instanceof ApiError ? error.kind : 'unknown';
}

/** Whether the platform refused with one specific code. A network failure has no code, so it is not. */
export function isRefused(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.kind === 'refused' && error.code === code;
}
