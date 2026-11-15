import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  Protocol,
} from "@meshsdk/core";

import {
  BuildOptions,
  BuiltTx,
  certificate,
  collateral,
  collateralReturn,
  guard,
  minFee,
  output,
  proposal,
  referenceInput,
  requiredSigners,
  spend,
  toMeshUtxo,
  toUtxo,
  TxBuilder,
  TxError,
  Utxo,
  utxosAfter,
  withdrawal,
} from "../../src/tx-builder";
import { baseAddress, rewardAddress } from "../test-util";
import { pay, setup } from "./plan/plan-emulator-util";
import {
  BECH32_KEY,
  caught,
  HEX_KEY,
  leakOf,
  MARKERS,
} from "./secret-text-util";

// A text given where an address is taken may be a key or a recovery phrase given by mistake.
// Every error raised for such a text is searched for the text and for any 8 characters of it.

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const stake = rewardAddress(1);
const anchor = { url: "https://example.com/r.json", dataHash: "cd".repeat(32) };
const txHash = "b7".repeat(32);
const funds: Utxo = {
  txHash: "a1".repeat(32),
  outputIndex: 0,
  address: wallet,
  value: { lovelace: 100_000_000n },
};
const payment = output({ address: recipient, value: { lovelace: 2_000_000n } });

const offline = () =>
  new TxBuilder({ network: "preprod", params, costModels, evaluator: null });
const buildWith = (options: Partial<BuildOptions>) =>
  offline().build([payment], {
    payer: { changeAddress: wallet, utxos: [funds] },
    ...options,
  });

/** A UTxO held at the text, in the builder's form */
const ownAt = (text: string) => ({
  txHash,
  outputIndex: 0,
  address: text,
  value: { lovelace: 5_000_000n },
});
/** A UTxO held at the text, in the Mesh form */
const meshAt = (text: string) => ({
  input: { txHash, outputIndex: 0 },
  output: {
    address: text,
    amount: [{ unit: "lovelace", quantity: "5000000" }],
  },
});

let built: BuiltTx;
beforeAll(async () => {
  built = await buildWith({});
});

/** Every place a text is taken as an address, each raising its error for the text */
const PLACES: readonly {
  name: string;
  run: (text: string) => unknown;
  code: string;
}[] = [
  {
    name: "the address of an output",
    run: (text) => output({ address: text, value: { lovelace: 2_000_000n } }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the address of a collateral return",
    run: (text) => collateralReturn({ address: text }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the address of a key guard",
    run: (text) => guard.pubKey({ address: text }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the reward address of a withdrawal",
    run: (text) => withdrawal.pubKey({ rewardAddress: text, amount: 1n }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the stake of a certificate",
    run: (text) => certificate.stakeRegistration({ stake: text }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the reward account of a proposal",
    run: (text) => proposal.info({ rewardAccount: text, anchor }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "a reward account of a treasury withdrawal",
    run: (text) =>
      proposal.treasuryWithdrawals({
        rewardAccount: stake,
        anchor,
        withdrawals: { [text]: 1n },
      }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the address of a spent UTxO",
    run: (text) => spend.pubKey({ utxo: ownAt(text) }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the address of a spent Mesh UTxO",
    run: (text) => spend.pubKey({ utxo: meshAt(text) }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the address of a reference input",
    run: (text) => referenceInput({ utxo: ownAt(text) }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "the address of a collateral input",
    run: (text) => collateral({ utxo: ownAt(text) }),
    code: "INVALID_ADDRESS",
  },
  {
    name: "toUtxo",
    run: (text) => toUtxo(ownAt(text)),
    code: "INVALID_OPTION",
  },
  {
    name: "toMeshUtxo",
    run: (text) => toMeshUtxo(meshAt(text)),
    code: "INVALID_OPTION",
  },
  {
    name: "a payer given as an address",
    run: (text) => buildWith({ payer: text }),
    code: "INVALID_OPTION",
  },
  {
    name: "the change address of a payer snapshot",
    run: (text) =>
      buildWith({ payer: { changeAddress: text, utxos: [funds] } }),
    code: "INVALID_OPTION",
  },
  {
    name: "a UTxO of a payer snapshot",
    run: (text) =>
      buildWith({ payer: { changeAddress: wallet, utxos: [ownAt(text)] } }),
    code: "INVALID_OPTION",
  },
  {
    name: "the change address a wallet answers with",
    run: (text) =>
      buildWith({
        payer: { getChangeAddress: async () => text, getUtxos: async () => [] },
      }),
    code: "WALLET_FAILED",
  },
  {
    name: "sendAllTo",
    run: (text) => buildWith({ sendAllTo: text }),
    code: "INVALID_OPTION",
  },
  {
    name: "a UTxO of knownUtxos",
    run: (text) => buildWith({ knownUtxos: [ownAt(text)] }),
    code: "INVALID_OPTION",
  },
  {
    name: "an output marked change of a transaction of after",
    run: (text) =>
      buildWith({
        after: {
          txHash,
          inputs: [],
          outputs: [{ ...ownAt(text), change: true }],
          change: [],
        } as never,
      }),
    code: "INVALID_OPTION",
  },
  {
    name: "the change address of finalize",
    run: (text) =>
      offline().finalize(built.prototype, {
        inputs: [funds],
        changeAddress: text,
      }),
    code: "INVALID_OPTION",
  },
  {
    name: "an input of finalize",
    run: (text) =>
      offline().finalize(built.prototype, { inputs: [ownAt(text)] }),
    code: "INVALID_OPTION",
  },
  {
    name: "an input of minFee",
    run: (text) =>
      minFee(built.prototype, {
        params,
        vkeyWitnesses: 1,
        inputs: [ownAt(text)],
      }),
    code: "INVALID_OPTION",
  },
  {
    name: "a UTxO of utxosAfter",
    run: (text) => utxosAfter([ownAt(text)], built),
    code: "INVALID_OPTION",
  },
  {
    name: "a spent UTxO of requiredSigners",
    run: (text) => requiredSigners(built.tx, [ownAt(text)]),
    code: "INVALID_OPTION",
  },
];

describe("a text given as an address that is none", () => {
  for (const place of PLACES)
    for (const marker of MARKERS)
      it(`stays out of the error: ${place.name}, ${marker.name}`, async () => {
        const error = await caught(() => place.run(marker.text));
        expect(TxError.is(error, place.code as never)).toBe(true);
        expect(leakOf(error, marker.secret)).toBeUndefined();
      });

  it("is told by its shape and type", async () => {
    const error = await caught(() => buildWith({ sendAllTo: HEX_KEY }));
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as TxError).message).toBe(
      "invalid sendAllTo: expected a payment address, in bech32 or hex; got 64 hex digits that is not a payment address",
    );
    expect((error as TxError & { details: unknown }).details).toEqual({
      option: "sendAllTo",
      value: "string",
      allowed: "a payment address, in bech32 or hex",
    });
    expect((error as Error).cause).toBeUndefined();

    const part = await caught(() =>
      output({ address: BECH32_KEY, value: { lovelace: 1n } }),
    );
    expect((part as Error).message).toBe(
      `output: invalid address: expected an address in bech32, base58 or hex; got text of ${BECH32_KEY.length} characters with the prefix ed25519e_sk`,
    );
  });
});

describe("a text given as an address of a step that is none", () => {
  it("stays out of the error of plan and of add", async () => {
    const { builder, wallet: payer } = await setup();
    for (const marker of MARKERS) {
      const made = await caught(() =>
        builder.plan(
          { a: { parts: pay(), sendAllTo: marker.text } },
          { payer },
        ),
      );
      expect(TxError.is(made, "INVALID_OPTION")).toBe(true);
      expect(leakOf(made, marker.secret)).toBeUndefined();
    }
    const plan = await builder.plan(pay(), { payer });
    for (const marker of MARKERS) {
      const added = await caught(() =>
        plan.add({ b: { parts: pay(), sendAllTo: marker.text } }),
      );
      expect(TxError.is(added, "INVALID_OPTION")).toBe(true);
      expect(leakOf(added, marker.secret)).toBeUndefined();
    }
  });
});
