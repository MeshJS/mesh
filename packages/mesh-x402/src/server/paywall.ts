import { PAYMENT_REQUIRED_HEADER } from "../client/fetch";
import { encodeHeaderJson } from "../encoding";
import { FacilitatorClient } from "../facilitator/client";
import { CardanoNetwork } from "../types/network";
import {
  decodePaymentSignatureHeader,
  PAYMENT_SIGNATURE_HEADER,
  PaymentPayload,
} from "../types/payment-payload";
import {
  getAssetTransferMethod,
  PaymentRequirements,
  ResourceInfo,
  X402ChallengeResponse,
} from "../types/payment-requirements";
import {
  encodePaymentResponseHeader,
  PAYMENT_RESPONSE_HEADER,
  PaymentResponse,
} from "../types/payment-response";
import { masumiTermsDigestOf } from "./offers";

/** Key under which an issued offer is remembered: `termsDigest` for Masumi (spec), else the offer's identity. */
export const offerKey = (r: PaymentRequirements): string =>
  getAssetTransferMethod(r) === "masumi"
    ? masumiTermsDigestOf(r)
    : [r.network, r.payTo, r.amount, r.asset, getAssetTransferMethod(r)].join(
        "|",
      );

/** Default cap on remembered offers; the oldest are evicted first. */
export const DEFAULT_MAX_OFFERS = 10_000;

/**
 * In-memory record of the offers a server issued - the source of the "trusted requirements" the
 * facilitator checks against. Bounded: every unpaid request can add a (Masumi) offer, so the oldest are
 * evicted beyond `maxOffers`. Use a durable shared store behind `PaywallConfig.trusted` for production.
 */
export class OfferBook {
  private readonly offers = new Map<string, PaymentRequirements>();
  constructor(private readonly maxOffers: number = DEFAULT_MAX_OFFERS) {}

  record(r: PaymentRequirements): void {
    const key = offerKey(r);
    this.offers.delete(key); // re-recording refreshes its age
    this.offers.set(key, r);
    while (this.offers.size > this.maxOffers)
      this.offers.delete(this.offers.keys().next().value as string);
  }

  get(accepted: PaymentRequirements): PaymentRequirements | undefined {
    try {
      return this.offers.get(offerKey(accepted));
    } catch {
      return undefined;
    }
  }
}

export type PaywallHooks = {
  onChallenge?: (req: Request, challenge: X402ChallengeResponse) => void;
  onTrusted?: (req: Request, trusted: PaymentRequirements) => void;
  /** Payment refused (unknown offer, failed verify, or failed/timed-out settle). */
  onRejected?: (
    req: Request,
    reason: string,
    response: PaymentResponse,
  ) => void;
  onPaid?: (req: Request, response: PaymentResponse) => void;
};

export type PaywallConfig = {
  network: CardanoNetwork;
  /** Facilitator, or a per-request factory (e.g. to attach tracing headers). */
  facilitator: FacilitatorClient | ((req: Request) => FacilitatorClient);
  /** Builds the offer for an unpaid request. It is recorded in `book` automatically. */
  issue: (req: Request) => PaymentRequirements | Promise<PaymentRequirements>;
  /** Produces the paid content once settlement succeeded. */
  serve: (req: Request, paid: PaymentResponse) => Response | Promise<Response>;
  /** Overrides the trusted-requirements lookup (default: the `book` entry for `payload.accepted`). Never return the client's own copy. */
  trusted?: (
    req: Request,
    payload: PaymentPayload,
  ) =>
    PaymentRequirements | undefined | Promise<PaymentRequirements | undefined>;
  book?: OfferBook;
  resource?: (req: Request) => ResourceInfo;
  pollMs?: number;
  timeoutMs?: number;
  hooks?: PaywallHooks;
};

/**
 * Framework-neutral x402 resource-server handler `(Request) => Response`. Unpaid: issues a 402 with the
 * `PAYMENT-REQUIRED` header. Paid: loads the trusted offer, asks the facilitator to verify, settles
 * (retrying while pending), then serves the content with a `PAYMENT-RESPONSE` header.
 */
export const createPaywall = (config: PaywallConfig) => {
  const book = config.book ?? new OfferBook();
  const hooks = config.hooks ?? {};

  return async (req: Request): Promise<Response> => {
    const facilitator =
      typeof config.facilitator === "function"
        ? config.facilitator(req)
        : config.facilitator;
    const signature = req.headers.get(PAYMENT_SIGNATURE_HEADER);

    if (!signature) {
      const requirements = await config.issue(req);
      book.record(requirements);
      const challenge: X402ChallengeResponse = {
        x402Version: 2,
        error: "PAYMENT-SIGNATURE header is required",
        resource: config.resource?.(req) ?? { url: req.url },
        accepts: [requirements],
      };
      hooks.onChallenge?.(req, challenge);
      return Response.json(challenge, {
        status: 402,
        headers: { [PAYMENT_REQUIRED_HEADER]: encodeHeaderJson(challenge) },
      });
    }

    const reject = (reason: string, transaction = "") => {
      const response: PaymentResponse = {
        success: false,
        network: config.network,
        transaction,
        extra: { status: "pending", confirmations: -1 },
        errorReason: reason,
      };
      hooks.onRejected?.(req, reason, response);
      return Response.json(
        { error: reason },
        {
          status: 402,
          headers: {
            [PAYMENT_RESPONSE_HEADER]: encodePaymentResponseHeader(response),
          },
        },
      );
    };

    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(signature);
    } catch {
      return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }

    const trusted = config.trusted
      ? await config.trusted(req, payload)
      : book.get(payload.accepted);
    if (!trusted) return reject("UNKNOWN_OFFER");
    hooks.onTrusted?.(req, trusted);

    // `payload.resource` is client-supplied and unsigned; the facilitator uses it for Masumi registry
    // endpoint checks, so hand it this server's own resource instead.
    const resource = config.resource?.(req) ?? { url: req.url };
    const body = {
      paymentPayload: { ...payload, resource },
      paymentRequirements: trusted,
    };

    let settled: PaymentResponse;
    try {
      const verified = await facilitator.verify(body);
      if (!verified.isValid) return reject(verified.invalidReason);
      settled = await facilitator.settleUntilFinal(body, {
        pollMs: config.pollMs,
        timeoutMs: config.timeoutMs,
      });
    } catch {
      return reject("FACILITATOR_UNAVAILABLE");
    }
    if (!settled.success)
      return reject(
        settled.errorReason ?? "SETTLE_FAILED",
        settled.transaction,
      );

    hooks.onPaid?.(req, settled);
    const content = await config.serve(req, settled);
    const headers = new Headers(content.headers);
    headers.set(PAYMENT_RESPONSE_HEADER, encodePaymentResponseHeader(settled));
    return new Response(content.body, { status: content.status, headers });
  };
};
