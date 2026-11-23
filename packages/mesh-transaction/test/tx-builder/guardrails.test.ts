import { networkConfig } from "@meshsdk/common";

import { proposal } from "../../src/tx-builder";
import { withDefaultGuardrails } from "../../src/tx-builder/guardrails";
import { alwaysSucceedCbor, rewardAddress } from "../test-util";

const activeHash = "fa24fb305126805cf2164c161d852a0e7330cf988f1fe558cf7d4a64";
const parameters = {
  rewardAccount: rewardAddress(1),
  anchor: { url: "https://example.com/proposal", dataHash: "ab".repeat(32) },
  updates: { max_tx_size: 16384 },
};
const anchor = {
  anchorUrl: parameters.anchor.url,
  anchorDataHash: parameters.anchor.dataHash,
};

describe("default governance guardrails", () => {
  it.each(["preprod", "preview"] as const)(
    "adds the verified witness for %s when the provider is unavailable",
    async (name) => {
      const part = proposal.parameterChange(parameters);
      await expect(
        withDefaultGuardrails([part], networkConfig(name), {
          fetchConstitution: async () => {
            throw new Error("Query unavailable");
          },
        }),
      ).resolves.toMatchObject([
        {
          proposal: {
            governance_action: { value: { policy_hash: activeHash } },
          },
          witness: { type: "plutus" },
        },
      ]);
    },
  );

  it("checks a governance query once per build and honours the active hash", async () => {
    const network = networkConfig("preprod");
    const fetchConstitution = jest
      .fn()
      .mockResolvedValue({ anchor, guardrailScriptHash: activeHash });
    const change = proposal.parameterChange(parameters);
    const withdrawal = proposal.treasuryWithdrawals({
      ...parameters,
      withdrawals: { [parameters.rewardAccount]: 1n },
    });
    const result = await withDefaultGuardrails([change, withdrawal], network, {
      fetchConstitution,
    });
    expect(fetchConstitution).toHaveBeenCalledTimes(1);
    for (const part of result) {
      expect(part).toMatchObject({
        proposal: { governance_action: { value: { policy_hash: activeHash } } },
        witness: { type: "plutus" },
      });
    }
  });

  it("honours a constitution without a guardrail and rejects unknown hashes", async () => {
    const parts = [proposal.parameterChange(parameters)];
    const network = networkConfig("preview");
    await expect(
      withDefaultGuardrails(parts, network, {
        fetchConstitution: async () => ({ anchor }),
      }),
    ).resolves.toBe(parts);
    await expect(
      withDefaultGuardrails(parts, network, {
        fetchConstitution: async () => ({
          anchor,
          guardrailScriptHash: "ab".repeat(28),
        }),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_FAILED" });
  });

  it("leaves an explicit witness, explicit null, and info actions alone", async () => {
    const fetchConstitution = jest.fn();
    const parts = [
      proposal.parameterChange({
        ...parameters,
        guardrail: {
          plutus: { code: alwaysSucceedCbor, version: "V3" },
          redeemer: { data: { type: "CBOR", content: "d87980" } },
        },
      }),
      proposal.parameterChange({ ...parameters, guardrail: null }),
      proposal.info(parameters),
    ];
    await expect(
      withDefaultGuardrails(parts, networkConfig("preprod"), {
        fetchConstitution,
      }),
    ).resolves.toBe(parts);
    expect(fetchConstitution).not.toHaveBeenCalled();
  });
});
