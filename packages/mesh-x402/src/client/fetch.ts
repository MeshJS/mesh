import { MeshWallet } from "@meshsdk/wallet";

import { fromBase64 } from "../encoding";
import { X402Error } from "../types/errors";
import { toNetworkId, tryNormalizeCardanoNetwork } from "../types/network";
import {
  encodePaymentSignatureHeader,
  PAYMENT_SIGNATURE_HEADER,
  PaymentPayload,
} from "../types/payment-payload";
import {
  PaymentRequirements,
  X402ChallengeResponse,
} from "../types/payment-requirements";
import {
  decodePaymentResponseHeader,
  PAYMENT_RESPONSE_HEADER,
  PaymentResponse,
} from "../types/payment-response";
import { buildPaymentPayload, ChainContext } from "./build";
import { signPayment } from "./sign";

/** Response header carrying the base64-encoded `PaymentRequired` object of a 402. */
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";

export type FetchWithPaymentOptions = {
  /** Picks which `accepts[]` entry to pay. Default: first entry matching the wallet's network. */
  selectRequirement?: (
    accepts: PaymentRequirements[],
  ) => PaymentRequirements | undefined;
  /** Custom `fetch` (default: global). Lets callers observe or instrument both requests. */
  fetch?: typeof fetch;
  /** Called with the decoded 402 challenge. */
  onChallenge?: (challenge: X402ChallengeResponse) => void;
  /** Called with the signed payload just before the paid retry. */
  onSigned?: (payload: PaymentPayload) => void;
};

export type FetchWithPaymentResult = {
  response: Response;
  paymentResponse?: PaymentResponse;
};

const defaultSelectRequirement =
  (walletNetworkId: number) =>
  (accepts: PaymentRequirements[]): PaymentRequirements | undefined =>
    accepts.find((r) => {
      const network = tryNormalizeCardanoNetwork(r.network);
      return (
        r.scheme === "exact" &&
        network !== null &&
        toNetworkId(network) === walletNetworkId
      );
    });

/**
 * Reads the 402's `PaymentRequired` object. Per spec it is the base64 JSON in the
 * `PAYMENT-REQUIRED` response header; a JSON body is accepted as a fallback for servers that
 * only echo it there.
 */
const readChallenge = async (
  response: Response,
): Promise<X402ChallengeResponse> => {
  const header = response.headers.get(PAYMENT_REQUIRED_HEADER);
  if (header) return JSON.parse(fromBase64(header)) as X402ChallengeResponse;
  return (await response.json()) as X402ChallengeResponse;
};

/**
 * Wraps `fetch`: issues the request, and on a 402 response, builds+signs a payment for one
 * of the challenge's `accepts[]` entries and retries with the `PAYMENT-SIGNATURE` header.
 * Returns both the final `Response` and the decoded `PAYMENT-RESPONSE` header, when present.
 */
export const fetchWithPayment = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  wallet: MeshWallet,
  chain: ChainContext,
  options: FetchWithPaymentOptions = {},
): Promise<FetchWithPaymentResult> => {
  const doFetch = options.fetch ?? fetch;
  const initial = await doFetch(input, init);
  if (initial.status !== 402) return { response: initial };

  const challenge = await readChallenge(initial);
  if (challenge.x402Version !== 2 || !Array.isArray(challenge.accepts)) {
    throw new X402Error(
      "NO_ACCEPTABLE_REQUIREMENT",
      "402 response is not an x402 v2 PaymentRequired object",
    );
  }
  options.onChallenge?.(challenge);
  const select =
    options.selectRequirement ??
    defaultSelectRequirement(await wallet.getNetworkId());
  const chosen = select(challenge.accepts);
  if (!chosen) {
    throw new X402Error(
      "NO_ACCEPTABLE_REQUIREMENT",
      "No PaymentRequirements entry matched this wallet",
    );
  }

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const built = await buildPaymentPayload(
    chosen,
    wallet,
    { url, ...challenge.resource },
    chain,
  );
  const signed = await signPayment(wallet, built);

  options.onSigned?.(signed);
  const headers = new Headers(init?.headers);
  headers.set(PAYMENT_SIGNATURE_HEADER, encodePaymentSignatureHeader(signed));

  const response = await doFetch(input, { ...init, headers });
  const responseHeader = response.headers.get(PAYMENT_RESPONSE_HEADER);
  return {
    response,
    paymentResponse: responseHeader
      ? decodePaymentResponseHeader(responseHeader)
      : undefined,
  };
};
