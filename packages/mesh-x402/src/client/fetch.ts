import { MeshWallet } from "@meshsdk/wallet";

import { toNetworkId, tryNormalizeCardanoNetwork } from "../types/network";
import { PaymentRequirements, X402ChallengeResponse } from "../types/payment-requirements";
import { PAYMENT_SIGNATURE_HEADER, encodePaymentSignatureHeader } from "../types/payment-payload";
import { PAYMENT_RESPONSE_HEADER, decodePaymentResponseHeader, PaymentResponse } from "../types/payment-response";
import { X402Error } from "../types/errors";
import { buildPaymentPayload, ChainContext } from "./build";
import { signPayment } from "./sign";

/** Response header carrying the base64-encoded `PaymentRequired` object of a 402. */
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";

export type FetchWithPaymentOptions = {
  /** Picks which `accepts[]` entry to pay. Default: first entry matching the wallet's network. */
  selectRequirement?: (accepts: PaymentRequirements[]) => PaymentRequirements | undefined;
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
      return r.scheme === "exact" && network !== null && toNetworkId(network) === walletNetworkId;
    });

const fromBase64 = (value: string): string => Buffer.from(value, "base64").toString("utf-8");

/**
 * Reads the 402's `PaymentRequired` object. Per spec it is the base64 JSON in the
 * `PAYMENT-REQUIRED` response header; a JSON body is accepted as a fallback for servers that
 * only echo it there.
 */
const readChallenge = async (response: Response): Promise<X402ChallengeResponse> => {
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
  const initial = await fetch(input, init);
  if (initial.status !== 402) return { response: initial };

  const challenge = await readChallenge(initial);
  if (challenge.x402Version !== 2 || !Array.isArray(challenge.accepts)) {
    throw new X402Error("NO_ACCEPTABLE_REQUIREMENT", "402 response is not an x402 v2 PaymentRequired object");
  }
  const select = options.selectRequirement ?? defaultSelectRequirement(await wallet.getNetworkId());
  const chosen = select(challenge.accepts);
  if (!chosen) {
    throw new X402Error("NO_ACCEPTABLE_REQUIREMENT", "No PaymentRequirements entry matched this wallet");
  }

  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const built = await buildPaymentPayload(chosen, wallet, { url, ...challenge.resource }, chain);
  const signed = await signPayment(wallet, built);

  const headers = new Headers(init?.headers);
  headers.set(PAYMENT_SIGNATURE_HEADER, encodePaymentSignatureHeader(signed));

  const response = await fetch(input, { ...init, headers });
  const responseHeader = response.headers.get(PAYMENT_RESPONSE_HEADER);
  return {
    response,
    paymentResponse: responseHeader ? decodePaymentResponseHeader(responseHeader) : undefined,
  };
};
