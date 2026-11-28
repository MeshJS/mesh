const BRAND = Symbol.for("@meshsdk/common/ProviderError");

/** What a provider throws when a request fails; `message` keeps the provider's own text */
export class ProviderError extends Error {
  readonly name: "ProviderError" = "ProviderError";
  /** The HTTP status, when there was a response */
  declare readonly status?: number;
  /**
   * What went wrong: `"notFound"` the thing asked for is not there, `"rateLimited"` too many
   * requests (429), `"unavailable"` a timeout or a server error (5xx), `"unauthorized"` e.g. a
   * wrong API key, `"rejected"` the ledger refused a submitted transaction, `"invalidRequest"`
   * the request was refused as malformed, `"unsupported"` the provider has no such method
   */
  readonly kind:
    | "notFound"
    | "rateLimited"
    | "unavailable"
    | "unauthorized"
    | "rejected"
    | "invalidRequest"
    | "unsupported";
  /** Worth repeating the same request: timeouts, 5xx and 429 */
  readonly retryable: boolean;
  /** The provider's own answer, e.g. the ledger's reasons for a rejected transaction */
  declare readonly body?: unknown;
  /** The error the request failed with, when there is one */
  declare readonly cause?: unknown;

  /**
   * @param message The provider's own text
   * @param options.retryable Defaults to true for `"rateLimited"` and `"unavailable"`, false
   * for every other kind
   */
  constructor(
    message: string,
    options: {
      kind: ProviderError["kind"];
      status?: number;
      retryable?: boolean;
      body?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.kind = options.kind;
    this.retryable =
      options.retryable ??
      (options.kind === "rateLimited" || options.kind === "unavailable");
    if (options.status !== undefined) this.status = options.status;
    if (options.body !== undefined) this.body = options.body;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /**
   * Whether a value is a `ProviderError`, also one made by another copy of this package, or an
   * instance of a subclass
   */
  static is(error: unknown): error is ProviderError {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as Record<symbol, unknown>)[BRAND] === true
    );
  }
}

Object.defineProperty(ProviderError.prototype, BRAND, { value: true });
