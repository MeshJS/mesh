import type { IFetcher } from "@meshsdk/common";
import {
  CachedFetcher,
  customNetwork,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  networkConfig,
} from "@meshsdk/common";
import { scriptHashToRewardAddress } from "@meshsdk/core-cst";

import { proposal, TxBuilder } from "../../src/tx-builder";
import { withDefaultGuardrails } from "../../src/tx-builder/guardrails";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  rewardAddress,
} from "../test-util";

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
    for (const answer of [
      null,
      "x",
      [],
      {},
      { guardrailScriptHash: activeHash },
      { anchor, guardrailScriptHash: 5 },
      { anchor, guardrailScriptHash: "" },
      { anchor, guardrailScriptHash: "zz".repeat(28) },
      { anchor, guardrailScriptHash: ` ${activeHash}` },
    ]) {
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
      message: expect.stringMatching(
        /proposal "change" \(guardrail\).*the script the constitution names/,
      ),
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

describe("the default guardrail in a build", () => {
  const unused = () => {
    throw new Error("not read by this build");
  };
  /** A provider, wrapped in a cache, that answers only the constitution */
  const providerOf = (fetchConstitution: () => Promise<unknown>) =>
    new CachedFetcher({
      fetchAddressUTxOs: unused,
      fetchUTxOs: unused,
      fetchProtocolParameters: unused,
      fetchConstitution,
    } as unknown as IFetcher);
  const builderOf = (provider: IFetcher) =>
    new TxBuilder({
      network: "preprod",
      provider,
      params: DEFAULT_PROTOCOL_PARAMETERS,
      costModels: [
        DEFAULT_V1_COST_MODEL_LIST,
        DEFAULT_V2_COST_MODEL_LIST,
        DEFAULT_V3_COST_MODEL_LIST,
      ],
    });
  const payer = {
    changeAddress: baseAddress(0),
    utxos: [
      {
        txHash: "0".repeat(64),
        outputIndex: 0,
        address: baseAddress(0),
        value: { lovelace: 2_000_000_000_000n },
      },
    ],
  };
  const change = proposal.parameterChange({
    rewardAccount: scriptHashToRewardAddress(alwaysSucceedHash, 0),
    anchor: parameters.anchor,
    updates: parameters.updates,
    deposit: 1_000_000_000n,
  });

  it("reads the constitution once, past the cache, and runs its guardrail as a Plutus script", async () => {
    const fetchConstitution = jest.fn(async () => ({
      anchor,
      guardrailScriptHash: activeHash,
    }));
    const built = await builderOf(providerOf(fetchConstitution)).build(change, {
      payer,
    });
    expect(fetchConstitution).toHaveBeenCalledTimes(1);
    expect(built.redeemers).toMatchObject([
      { tag: "VOTING_PROPOSAL", index: 0 },
    ]);
    expect(built.redeemers[0]!.exUnits.mem).toBeGreaterThan(0n);
    expect(built.collateral).toBeDefined();
    expect(built.parts.find((part) => part.kind === "proposal")).toMatchObject(
      guarded,
    );
  });

  it("is ABORTED while the constitution is read", async () => {
    const controller = new AbortController();
    const build = builderOf(providerOf(() => new Promise(() => {}))).build(
      change,
      { payer, signal: controller.signal },
    );
    controller.abort();
    await expect(build).rejects.toMatchObject({ code: "ABORTED" });
  });
});
