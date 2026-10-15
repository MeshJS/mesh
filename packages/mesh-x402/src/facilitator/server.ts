import { Hono } from "hono";

import { IFetcher, ISubmitter, Protocol } from "@meshsdk/common";

import { CardanoNetwork, tryNormalizeCardanoNetwork } from "../types/network";
import { PaymentPayload } from "../types/payment-payload";
import {
  AssetTransferMethod,
  PaymentRequirements,
} from "../types/payment-requirements";
import { settlePayment } from "./settle";
import { InMemorySettlementStore, SettlementStore } from "./store";
import {
  DEFAULT_L1_CONFIRMATION_RANGE,
  VerifyOptions,
  verifyPayment,
} from "./verify";

export type FacilitatorConfig = {
  fetcher: IFetcher;
  submitter: ISubmitter;
  store?: SettlementStore;
  supportedNetworks: CardanoNetwork[];
  supportedMethods?: AssetTransferMethod[];
  /** Range of `confirmationPolicy.l1Confirmations` this facilitator settles; advertised in `/supported`. Default `{ minimum: 0, maximum: 20 }` (mempool settlement, `-1`, is opt-in). */
  l1Confirmations?: { minimum: number; maximum: number };
  /** Explicit approval of non-default Masumi deployments. Default: only the canonical deployment is accepted. */
  allowMasumiDeployment?: VerifyOptions["allowMasumiDeployment"];
  /** Independently validates a non-empty Masumi `agentIdentifier`. Default: registry claims are rejected. */
  validateRegistryClaim?: VerifyOptions["validateRegistryClaim"];
  /** Resolves live protocol parameters and the current tip's slot for a given network. */
  resolveChainState: (
    network: CardanoNetwork,
  ) => Promise<{ protocol: Protocol; currentSlot: number }>;
};

/**
 * Request body for `/verify` and `/settle`: the client-submitted `paymentPayload` plus the
 * resource server's own `paymentRequirements` for the offer it actually made. The facilitator
 * checks the transaction against `paymentRequirements`, and separately confirms
 * `paymentPayload.accepted` matches it exactly - never trusting `paymentPayload.accepted`
 * alone, since it travels inside the same request the client controls.
 */
export type FacilitatorRequestBody = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

/** Builds a Hono app exposing the facilitator's `POST /verify`, `POST /settle`, `GET /supported`. */
export const createFacilitatorApp = (config: FacilitatorConfig): Hono => {
  const store = config.store ?? new InMemorySettlementStore();
  const options: VerifyOptions = {
    l1Confirmations: config.l1Confirmations ?? DEFAULT_L1_CONFIRMATION_RANGE,
    allowMasumiDeployment: config.allowMasumiDeployment,
    validateRegistryClaim: config.validateRegistryClaim,
  };
  const supported = new Set(config.supportedNetworks);
  const methods = config.supportedMethods ?? ["default", "masumi", "script"];
  const app = new Hono();

  /** Parses the body and resolves chain state; `null` => reply 400. CIP-34 aliases normalize to the canonical id. */
  const readRequest = async (raw: Request) => {
    let body: FacilitatorRequestBody;
    try {
      body = (await raw.json()) as FacilitatorRequestBody;
    } catch {
      return null;
    }
    const network = tryNormalizeCardanoNetwork(
      body?.paymentRequirements?.network,
    );
    if (
      !body?.paymentPayload ||
      !body.paymentRequirements ||
      !network ||
      !supported.has(network)
    )
      return null;
    const method =
      body.paymentRequirements.extra?.assetTransferMethod ?? "default";
    if (!methods.includes(method)) return null;
    return { body, ...(await config.resolveChainState(network)) };
  };

  app.post("/verify", async (c) => {
    const request = await readRequest(c.req.raw);
    if (!request)
      return c.json({ isValid: false, invalidReason: "INVALID_PAYLOAD" }, 400);
    const result = await verifyPayment(
      request.body.paymentPayload,
      request.body.paymentRequirements,
      config.fetcher,
      request.protocol,
      request.currentSlot,
      options,
    );
    return c.json(result);
  });

  app.post("/settle", async (c) => {
    const request = await readRequest(c.req.raw);
    if (!request)
      return c.json(
        {
          success: false,
          errorReason: "INVALID_PAYLOAD",
          transaction: "",
          network: "",
        },
        400,
      );
    const result = await settlePayment(
      request.body.paymentPayload,
      request.body.paymentRequirements,
      config.fetcher,
      config.submitter,
      store,
      request.protocol,
      request.currentSlot,
      options,
    );
    return c.json(result);
  });

  app.get("/supported", (c) =>
    c.json({
      kinds: config.supportedNetworks.map((network) => ({
        x402Version: 2,
        scheme: "exact",
        network,
        extra: {
          assetTransferMethods: methods,
          areFeesSponsored: false,
          l1Confirmations: options.l1Confirmations,
        },
      })),
      extensions: [],
      signers: {},
    }),
  );

  return app;
};
