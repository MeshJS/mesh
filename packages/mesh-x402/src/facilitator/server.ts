import { Hono } from "hono";
import { IFetcher, ISubmitter, Protocol } from "@meshsdk/common";

import { AssetTransferMethod, PaymentRequirements } from "../types/payment-requirements";
import { CardanoNetwork } from "../types/network";
import { PaymentPayload } from "../types/payment-payload";
import { verifyPayment } from "./verify";
import { settlePayment } from "./settle";
import { InMemorySettlementStore, SettlementStore } from "./store";

export type FacilitatorConfig = {
  fetcher: IFetcher;
  submitter: ISubmitter;
  store?: SettlementStore;
  supportedNetworks: CardanoNetwork[];
  supportedMethods?: AssetTransferMethod[];
  /** Resolves live protocol parameters and the current tip's slot for a given network. */
  resolveChainState: (network: CardanoNetwork) => Promise<{ protocol: Protocol; currentSlot: number }>;
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
  const app = new Hono();

  app.post("/verify", async (c) => {
    const { paymentPayload, paymentRequirements } = (await c.req.json()) as FacilitatorRequestBody;
    const { protocol, currentSlot } = await config.resolveChainState(paymentRequirements.network);
    const result = await verifyPayment(paymentPayload, paymentRequirements, config.fetcher, protocol, currentSlot);
    return c.json(result);
  });

  app.post("/settle", async (c) => {
    const { paymentPayload, paymentRequirements } = (await c.req.json()) as FacilitatorRequestBody;
    const { protocol, currentSlot } = await config.resolveChainState(paymentRequirements.network);
    const result = await settlePayment(
      paymentPayload,
      paymentRequirements,
      config.fetcher,
      config.submitter,
      store,
      protocol,
      currentSlot,
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
          assetTransferMethods: config.supportedMethods ?? ["default", "masumi", "script"],
          areFeesSponsored: false,
          l1Confirmations: { minimum: 0, maximum: 20 },
        },
      })),
      extensions: [],
      signers: {},
    }),
  );

  return app;
};
