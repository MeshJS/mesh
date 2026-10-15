import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";

import { createFacilitatorApp } from "../../src/facilitator/server";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";

const app = createFacilitatorApp({
  fetcher: new FakeFetcher(),
  submitter: new FakeSubmitter(),
  supportedNetworks: ["cardano:preprod"],
  resolveChainState: async () => ({
    protocol: DEFAULT_PROTOCOL_PARAMETERS,
    currentSlot: 1_000_000,
  }),
});
const post = (path: string, body: string) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("facilitator HTTP surface", () => {
  it("advertises the settleable confirmation range and no fee sponsorship", async () => {
    const body = await (await app.request("/supported")).json();
    expect(body.kinds[0].extra).toEqual({
      assetTransferMethods: ["default", "masumi", "script"],
      areFeesSponsored: false,
      l1Confirmations: { minimum: 0, maximum: 20 },
    });
  });

  it("answers malformed bodies with 400 INVALID_PAYLOAD instead of throwing", async () => {
    for (const path of ["/verify", "/settle"]) {
      for (const body of ["not json", "{}"]) {
        const res = await post(path, body);
        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain("INVALID_PAYLOAD");
      }
    }
  });

  it("rejects a network this facilitator does not serve", async () => {
    const res = await post(
      "/verify",
      JSON.stringify({
        paymentPayload: {},
        paymentRequirements: { network: "cardano:mainnet", extra: {} },
      }),
    );
    expect(res.status).toBe(400);
  });
});
