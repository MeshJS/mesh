import { customNetwork, networkConfig } from "@meshsdk/common";

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
const devnet = customNetwork({
  name: "devnet",
  systemStart: "2026-01-01T00:00:00Z",
  slotLengthMs: 200,
  epochLength: 500,
});
const guarded = {
  proposal: {
    governance_action: { value: { policy_hash: activeHash } },
  },
  witness: { type: "plutus" },
};

describe("default governance guardrails", () => {
  it.each(["mainnet", "preprod", "preview"] as const)(
    "adds the guardrail of %s when the provider cannot answer, or has no constitution query",
    async (name) => {
      const part = proposal.parameterChange(parameters);
      await expect(
        withDefaultGuardrails([part], networkConfig(name), {
          fetchConstitution: async () => {
            throw new Error("Query unavailable");
          },
        }),
      ).resolves.toMatchObject([guarded]);
      await expect(
        withDefaultGuardrails([part], networkConfig(name), {}),
      ).resolves.toMatchObject([guarded]);
      await expect(
        withDefaultGuardrails([part], networkConfig(name)),
      ).resolves.toMatchObject([guarded]);
    },
  );

  it("takes an answer of another form as no answer", async () => {
    const parts = [proposal.parameterChange(parameters)];
    for (const answer of [null, "x", { anchor, guardrailScriptHash: 5 }]) {
      const provider = { fetchConstitution: async () => answer as never };
      await expect(
        withDefaultGuardrails(parts, networkConfig("preprod"), provider),
      ).resolves.toMatchObject([guarded]);
      await expect(
        withDefaultGuardrails(parts, devnet, provider),
      ).resolves.toBe(parts);
    }
  });

  it("adds none on another network without an answer, and the constitution's when it answers", async () => {
    const parts = [proposal.parameterChange(parameters)];
    await expect(
      withDefaultGuardrails(parts, devnet, {
        fetchConstitution: async () => {
          throw new Error("Query unavailable");
        },
      }),
    ).resolves.toBe(parts);
    await expect(withDefaultGuardrails(parts, devnet)).resolves.toBe(parts);
    await expect(
      withDefaultGuardrails(parts, devnet, {
        fetchConstitution: async () => ({
          anchor,
          guardrailScriptHash: activeHash.toUpperCase(),
        }),
      }),
    ).resolves.toMatchObject([guarded]);
  });

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
    for (const part of result) expect(part).toMatchObject(guarded);
  });

  it("honours a constitution without a guardrail, and leaves another guardrail UNRESOLVED, naming each proposal", async () => {
    const parts = [
      proposal.parameterChange({ ...parameters, label: "change" }),
      proposal.treasuryWithdrawals({
        ...parameters,
        withdrawals: { [parameters.rewardAccount]: 1n },
      }),
    ];
    const network = networkConfig("mainnet");
    await expect(
      withDefaultGuardrails(parts, network, {
        fetchConstitution: async () => ({ anchor }),
      }),
    ).resolves.toBe(parts);
    const other = "ab".repeat(28);
    await expect(
      withDefaultGuardrails(parts, network, {
        fetchConstitution: async () => ({
          anchor,
          guardrailScriptHash: other,
        }),
      }),
    ).rejects.toMatchObject({
      code: "UNRESOLVED",
      message: expect.stringMatching(/guardrail: null/),
      details: [
        {
          kind: "proposal",
          label: "change",
          gaps: [{ type: "guardrail", scriptHash: other }],
        },
        { kind: "proposal", gaps: [{ type: "guardrail", scriptHash: other }] },
      ],
    });
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
