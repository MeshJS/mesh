import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  resolvePlutusScriptAddress,
} from "@meshsdk/core";
import {
  Address,
  Cardano,
  Crypto,
  HexBlob,
  scriptHashToBech32,
  scriptHashToRewardAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import { MeshTxBuilder } from "../../src";
import {
  addWitnesses,
  auxiliaryScript,
  certificate,
  collateral,
  keySigner,
  mint,
  output,
  proposal,
  referenceInput,
  requiredSigners,
  signedKeyHashes,
  signWitnesses,
  spend,
  toMeshUtxo,
  toUtxo,
  TxBuilder,
  TxError,
  TxErrorCode,
  Utxo,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, alwaysSucceedHash, keyHashHex } from "../test-util";
import { asCbor } from "./utxo-util";

/*
 * Hex of an odd number of digits, wherever CBOR is given: refused at the call with the code of
 * that place, its message quoting none of it, never read with its last digit dropped (which
 * would make of `d879800` the datum `d87980`, of a script and a digit the script alone).
 */

const KEY = "11".repeat(32);
/** The hash of the key `KEY`, checked in `beforeAll` */
const keyHash = "5ae193abe694a607531e20f85d8358ade9a474a4f45ac4e15e962da1";
const address = Cardano.EnterpriseAddress.fromCredentials(0, {
  type: Cardano.CredentialType.KeyHash,
  hash: keyHash as Cardano.Credential["hash"],
})
  .toAddress()
  .toBech32();
const script = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(script, 0);
const scriptStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const cbor = (content: string) => ({ type: "CBOR" as const, content });
const blake = (hex: string) => Crypto.blake2b.hash(HexBlob(hex), 32).toString();
const nativeHash = (hex: string) =>
  Crypto.blake2b.hash(HexBlob(`00${hex}`), 28).toString();

/*
 * Each is CBOR that is taken, and one digit more: read with its last digit dropped, it would be
 * taken as that CBOR
 */
const ODD_DATA = "d879800";
/** `sig` of a key */
const sig = `8200581c${keyHash}`;
const ODD_SCRIPT = `${sig}0`;
const ODD_CODE = `${alwaysSucceedCbor}0`;
const sigHash = nativeHash(sig);
const sigStake = scriptHashToRewardAddress(sigHash, 0);
const action = { txHash: "2".repeat(64), index: 0 };
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };

const funds: Utxo = {
  txHash: "f".repeat(64),
  outputIndex: 0,
  address,
  value: { lovelace: 1_000_000_000n },
};
const ODD_UTXO = `${asCbor(funds)}0`;
const locked: Utxo = {
  txHash: "1".repeat(64),
  outputIndex: 0,
  address: scriptAddress,
  value: { lovelace: 10_000_000n },
  datum: { type: "hash", hash: blake("d87980") },
};

/** Prices every redeemer at fixed units */
const evaluator = {
  evaluateTx: async (tx: string) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({
      tag: ["SPEND", "MINT", "CERT", "REWARD", "VOTE", "PROPOSE"][r.tag()],
      index: Number(r.index()),
      budget: { mem: 1000, steps: 2000 },
    })),
} as unknown as IEvaluator;
const builder = () =>
  new TxBuilder({
    network: "preprod",
    params: DEFAULT_PROTOCOL_PARAMETERS,
    costModels: [
      DEFAULT_V1_COST_MODEL_LIST,
      DEFAULT_V2_COST_MODEL_LIST,
      DEFAULT_V3_COST_MODEL_LIST,
    ],
    evaluator,
  });
const pay = [output({ address, value: { lovelace: 2_000_000n } })];
const payer = { changeAddress: address, utxos: [funds] };

const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
};

/** Refused with `code`, the message quoting `given` nowhere, nor any run of 16 digits of it */
const expectRefused = async (
  what: string,
  run: () => unknown,
  code: TxErrorCode,
  given: string,
) => {
  const error = await caught(run);
  expect([what, TxError.is(error, code)]).toEqual([what, true]);
  const message = (error as Error).message.toLowerCase();
  const quoted =
    given.length <= 16
      ? [given.toLowerCase()]
      : [given.slice(0, 16), given.slice(-16), given.slice(8, 24)].map((run) =>
          run.toLowerCase(),
        );
  expect([what, quoted.filter((run) => message.includes(run))]).toEqual([
    what,
    [],
  ]);
  return error as Error;
};

beforeAll(async () => {
  await Crypto.ready();
  expect(
    Crypto.Ed25519PrivateKey.fromNormalHex(KEY).toPublic().hash().hex(),
  ).toBe(keyHash);
});

describe("Hex of an odd number of digits", () => {
  it("is refused as Plutus data given as CBOR, INVALID_DATA at the part call, by every part", async () => {
    const witness = { plutus: script, redeemer: { data: cbor(ODD_DATA) } };
    const parts: [string, () => unknown][] = [
      [
        "spend.plutus, its redeemer",
        () =>
          spend.plutus({
            utxo: locked,
            script,
            redeemer: { data: cbor(ODD_DATA) },
            datum: { data: cbor("d87980") },
          }),
      ],
      [
        "spend.plutus, its datum",
        () =>
          spend.plutus({
            utxo: locked,
            script,
            redeemer: { data: cbor("d87980") },
            datum: { data: cbor(ODD_DATA) },
          }),
      ],
      [
        "mint.plutus",
        () =>
          mint.plutus({
            script,
            redeemer: { data: cbor(ODD_DATA) },
            assets: { "01": 1n },
          }),
      ],
      [
        "withdrawal.plutus",
        () =>
          withdrawal.plutus({
            rewardAddress: scriptStake,
            amount: 0n,
            script,
            redeemer: { data: cbor(ODD_DATA) },
          }),
      ],
      [
        "a certificate's witness",
        () =>
          certificate.stakeDelegation({
            stake: scriptStake,
            pool: keyHashHex(2),
            witness,
          }),
      ],
      [
        "a vote's witness",
        () =>
          vote({
            voter: { drep: { type: "SCRIPT", value: alwaysSucceedHash } },
            votes: [{ action, vote: "yes" }],
            witness,
          }),
      ],
      [
        "a proposal's guardrail",
        () =>
          proposal.treasuryWithdrawals({
            rewardAccount: scriptStake,
            anchor,
            withdrawals: { [scriptStake]: 1n },
            guardrail: witness,
          }),
      ],
      [
        "an inline datum",
        () =>
          output({
            address,
            value: { lovelace: 2_000_000n },
            datum: { type: "inline", data: cbor(ODD_DATA) },
          }),
      ],
      [
        "a datum by hash",
        () =>
          output({
            address,
            value: { lovelace: 2_000_000n },
            datum: { type: "hash", data: cbor(ODD_DATA), embed: true },
          }),
      ],
    ];
    for (const [what, make] of parts) {
      const error = await expectRefused(what, make, "INVALID_DATA", ODD_DATA);
      expect([what, error.message]).toEqual([
        what,
        expect.stringContaining(
          "invalid Plutus data: the CBOR given is not hex of whole bytes: it has an odd number of digits",
        ),
      ]);
    }
    // In upper case, and longer
    for (const data of [ODD_DATA.toUpperCase(), `d8799f${"01".repeat(40)}ff0`])
      await expectRefused(
        data,
        () =>
          mint.plutus({
            script,
            redeemer: { data: cbor(data) },
            assets: { "01": 1n },
          }),
        "INVALID_DATA",
        data.toLowerCase(),
      );
  });

  it("is refused at the build when a redeemer function answers it, INVALID_REDEEMER", async () => {
    const error = await expectRefused(
      "a redeemer function",
      () =>
        builder().build(
          [
            mint.plutus({
              script,
              redeemer: { data: () => cbor(ODD_DATA) },
              assets: { "01": 1n },
            }),
          ],
          { payer },
        ),
      "INVALID_REDEEMER",
      ODD_DATA,
    );
    expect(error).toMatchObject({ details: { reason: "invalidData" } });
  });

  it("is refused as a native script given as CBOR, INVALID_SCRIPT at the part call, by every part", async () => {
    const parts: [string, (script: string) => unknown][] = [
      [
        "spend.native",
        (script) =>
          spend.native({
            utxo: {
              ...funds,
              txHash: "e".repeat(64),
              address: scriptHashToBech32(sigHash, undefined, 0),
            },
            script,
          }),
      ],
      [
        "mint.native",
        (script) => mint.native({ script, assets: { "41": 1n } }),
      ],
      [
        "withdrawal.native",
        (script) =>
          withdrawal.native({ rewardAddress: sigStake, amount: 0n, script }),
      ],
      [
        "a certificate's witness",
        (script) =>
          certificate.stakeDeregistration({
            stake: sigStake,
            witness: { native: script },
          }),
      ],
      [
        "a vote's witness",
        (script) =>
          vote({
            voter: { drep: { type: "SCRIPT", value: sigHash } },
            votes: [{ action, vote: "yes" }],
            witness: { native: script },
          }),
      ],
      [
        "a proposal's guardrail",
        (script) =>
          proposal.treasuryWithdrawals({
            rewardAccount: sigStake,
            anchor,
            withdrawals: { [sigStake]: 1n },
            guardrail: { native: script },
          }),
      ],
    ];
    for (const [what, make] of parts) {
      // The script less its last digit is taken
      expect(() => make(sig)).not.toThrow();
      for (const given of [ODD_SCRIPT, ODD_SCRIPT.toUpperCase()]) {
        const error = await expectRefused(
          what,
          () => make(given),
          "INVALID_SCRIPT",
          ODD_SCRIPT,
        );
        expect([what, error.message]).toEqual([
          what,
          expect.stringContaining(
            "invalid native script: the CBOR given is not hex of whole bytes: it has an odd number of digits",
          ),
        ]);
      }
    }
  });

  it("is refused as a Plutus script's code, INVALID_SCRIPT at the part call", async () => {
    const odd = { code: ODD_CODE, version: "V3" as const };
    const witness = { plutus: odd, redeemer: { data: cbor("d87980") } };
    const parts: [string, () => unknown][] = [
      [
        "spend.plutus",
        () =>
          spend.plutus({
            utxo: locked,
            script: odd,
            redeemer: { data: cbor("d87980") },
            datum: { data: cbor("d87980") },
          }),
      ],
      [
        "mint.plutus",
        () =>
          mint.plutus({
            script: odd,
            redeemer: { data: cbor("d87980") },
            assets: { "01": 1n },
          }),
      ],
      [
        "withdrawal.plutus",
        () =>
          withdrawal.plutus({
            rewardAddress: scriptStake,
            amount: 0n,
            script: odd,
            redeemer: { data: cbor("d87980") },
          }),
      ],
      [
        "a certificate's witness",
        () =>
          certificate.stakeDelegation({
            stake: scriptStake,
            pool: keyHashHex(2),
            witness,
          }),
      ],
      [
        "a vote's witness",
        () =>
          vote({
            voter: { drep: { type: "SCRIPT", value: alwaysSucceedHash } },
            votes: [{ action, vote: "yes" }],
            witness,
          }),
      ],
      [
        "a proposal's guardrail",
        () =>
          proposal.treasuryWithdrawals({
            rewardAccount: scriptStake,
            anchor,
            withdrawals: { [scriptStake]: 1n },
            guardrail: witness,
          }),
      ],
      [
        "an output's reference script",
        () =>
          output({
            address,
            value: { lovelace: 20_000_000n },
            scriptRef: odd,
          }),
      ],
      ["an auxiliary script", () => auxiliaryScript({ script: odd })],
    ];
    for (const [what, make] of parts)
      await expectRefused(what, make, "INVALID_SCRIPT", ODD_CODE);
  });

  it("is refused in a UTxO given in any form, its CBOR and its datum and script", async () => {
    const mesh = (member: Record<string, string>) => ({
      input: { txHash: funds.txHash, outputIndex: 0 },
      output: {
        address,
        amount: [{ unit: "lovelace", quantity: "5000000" }],
        ...member,
      },
    });
    const forms: [string, unknown, TxErrorCode, string][] = [
      [
        "an inline datum",
        { ...funds, datum: { type: "inline", data: cbor(ODD_DATA) } },
        "INVALID_DATA",
        ODD_DATA,
      ],
      [
        "a native script",
        {
          ...funds,
          script: { type: "native", cbor: ODD_SCRIPT, hash: sigHash },
        },
        "INVALID_SCRIPT",
        ODD_SCRIPT,
      ],
      [
        "a Plutus script",
        {
          ...funds,
          script: {
            type: "plutus",
            version: "V3",
            code: ODD_CODE,
            hash: alwaysSucceedHash,
          },
        },
        "INVALID_SCRIPT",
        ODD_CODE,
      ],
      [
        "an unknown script",
        {
          ...funds,
          script: { type: "unknown", scriptRef: `8200${ODD_SCRIPT}` },
        },
        "INVALID_SCRIPT",
        ODD_SCRIPT,
      ],
      [
        "a Mesh UTxO's plutusData",
        mesh({ plutusData: ODD_DATA }),
        "INVALID_DATA",
        ODD_DATA,
      ],
      [
        "a Mesh UTxO's scriptRef",
        mesh({ scriptRef: `8200${ODD_SCRIPT}` }),
        "INVALID_SCRIPT",
        ODD_SCRIPT,
      ],
      ["its CBOR", ODD_UTXO, "INVALID_OUT_REF", ODD_UTXO],
    ];
    for (const [what, utxo, code, odd] of forms) {
      await expectRefused(
        `${what}: toUtxo`,
        () => toUtxo(utxo as never),
        "INVALID_OPTION",
        odd,
      );
      await expectRefused(
        `${what}: toMeshUtxo`,
        () => toMeshUtxo(utxo as never),
        "INVALID_OPTION",
        odd,
      );
      await expectRefused(
        `${what}: spend.pubKey`,
        () => spend.pubKey({ utxo: utxo as never }),
        code,
        odd,
      );
    }
    for (const [what, make] of [
      ["referenceInput", () => referenceInput({ utxo: ODD_UTXO })],
      ["collateral", () => collateral({ utxo: ODD_UTXO })],
    ] as const)
      await expectRefused(what, make, "INVALID_OUT_REF", ODD_UTXO);
  });

  it("is refused as a UTxO in CBOR given to a build, fromCbor and requiredSigners, or answered by a wallet", async () => {
    const tx = (await builder().build(pay, { payer })).tx;
    await expectRefused(
      "a payer's UTxOs",
      () => builder().build(pay, { payer: { ...payer, utxos: [ODD_UTXO] } }),
      "INVALID_OPTION",
      ODD_UTXO,
    );
    await expectRefused(
      "knownUtxos",
      () => builder().fromCbor(tx, { knownUtxos: [ODD_UTXO] }),
      "INVALID_OPTION",
      ODD_UTXO,
    );
    await expectRefused(
      "the UTxOs spent, of requiredSigners",
      () => requiredSigners(tx, [ODD_UTXO]),
      "INVALID_OPTION",
      ODD_UTXO,
    );
    const hexAddress = Address.fromString(address)!.toBytes().toString();
    const cip30 = {
      getNetworkId: async () => 0,
      getChangeAddress: async () => hexAddress,
      getUtxos: async () => [ODD_UTXO],
      signTx: async () => "a0",
    };
    await expectRefused(
      "a wallet's getUtxos",
      () => builder().build(pay, { payer: cip30 }),
      "WALLET_FAILED",
      ODD_UTXO,
    );
    // Too little to be collateral, so the wallet is asked for it
    const dust: Utxo = { ...funds, value: { lovelace: 100_000n } };
    const getCollateral = jest.fn(async () => [ODD_UTXO]);
    const error = await expectRefused(
      "a wallet's getCollateral",
      () =>
        builder().build(
          [
            spend.plutus({
              utxo: locked,
              script,
              redeemer: {
                data: cbor("d87980"),
                exUnits: { mem: 1000, steps: 2000 },
              },
              datum: { data: cbor("d87980") },
            }),
          ],
          {
            payer: {
              ...cip30,
              getUtxos: async () => [asCbor(dust)],
              getCollateral,
            },
          },
        ),
      "INSUFFICIENT_COLLATERAL",
      ODD_UTXO,
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(error.message).toContain(
      "getCollateral answered with what is not a list of UTxOs",
    );
  });

  it("is refused as a transaction, INVALID_OPTION at every call that reads one", async () => {
    const b = builder();
    const built = await b.build(pay, { payer });
    const odd = `${built.tx}0`;
    const calls: [string, () => unknown][] = [
      ["fromCbor", () => b.fromCbor(odd, { knownUtxos: [funds] })],
      ["fromCbor blind", () => b.fromCbor(odd, { blind: true })],
      ["requiredSigners", () => requiredSigners(odd, [funds])],
      ["signedKeyHashes", () => signedKeyHashes(odd)],
      ["addWitnesses", () => addWitnesses(odd, "a0")],
      ["signWitnesses", () => signWitnesses(keySigner(KEY), odd)],
      ["a step of a plan", () => b.plan({ given: odd })],
    ];
    for (const [what, call] of calls)
      await expectRefused(what, call, "INVALID_OPTION", odd);
    const json = JSON.parse(
      JSON.stringify(built.toJSON(), (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
    await expectRefused(
      "the transaction of a record",
      () => b.restore({ ...json, built: { ...json.built, tx: odd } }),
      "INVALID_STATE",
      odd,
    );
    await expectRefused(
      "a transaction given to addWitnesses of a BuiltTx",
      () => built.addWitnesses(odd),
      "INVALID_WITNESS",
      odd,
    );
  });

  it("is refused as a witness set, given or answered by a signer", async () => {
    const b = builder();
    const built = await b.build(pay, { payer });
    const witnessSet = await signWitnesses(keySigner(KEY), built.tx);
    expect(witnessSet).not.toBe("a0");
    const odd = `${witnessSet}0`;
    await expectRefused(
      "addWitnesses",
      () => addWitnesses(built.tx, odd),
      "INVALID_WITNESS",
      odd,
    );
    await expectRefused(
      "addWitnesses of a BuiltTx",
      () => built.addWitnesses(odd),
      "INVALID_WITNESS",
      odd,
    );
    const blind = await b.fromCbor(built.tx, { blind: true });
    await expectRefused(
      "addWitnesses of a BlindTx",
      () => blind.addWitnesses(odd),
      "INVALID_WITNESS",
      odd,
    );
    await expectRefused(
      "a signer's answer",
      () => built.sign({ signers: { signTx: async () => odd } as never }),
      "SIGNER_FAILED",
      odd,
    );
    const json = JSON.parse(
      JSON.stringify(built.toJSON(), (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
    await expectRefused(
      "the witnesses of a record",
      () => b.restore({ ...json, witnesses: odd }),
      "INVALID_STATE",
      odd,
    );
    await expectRefused(
      "the witness set of a record",
      () => b.restore({ ...json, witnessSet: odd }),
      "INVALID_OPTION",
      odd,
    );
    // The witness set less that digit is taken
    await built.addWitnesses(witnessSet);
    expect(built.missing).toEqual([]);
  });

  it("is refused as the cborHex of a signing key, INVALID_OPTION", async () => {
    for (const key of [
      `5820${KEY}0`,
      JSON.stringify({
        type: "PaymentSigningKeyShelley_ed25519",
        description: "",
        cborHex: `5820${KEY}0`,
      }),
    ])
      await expectRefused(
        "keySigner",
        () => keySigner(key),
        "INVALID_OPTION",
        KEY,
      );
  });

  it("is refused by the old MeshTxBuilder, whose scripts and data go through the parts", async () => {
    const old = () =>
      new MeshTxBuilder({ params: DEFAULT_PROTOCOL_PARAMETERS }).txIn(
        funds.txHash,
        0,
        [{ unit: "lovelace", quantity: "1000000000" }],
        address,
      );
    await expectRefused(
      "mintingScript",
      () =>
        old()
          .mint("1", sigHash, "41")
          .mintingScript(ODD_SCRIPT)
          .changeAddress(address)
          .complete(),
      "INVALID_SCRIPT",
      ODD_SCRIPT,
    );
    await expectRefused(
      "txOutInlineDatumValue",
      () =>
        old()
          .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
          .txOutInlineDatumValue(ODD_DATA, "CBOR")
          .changeAddress(address)
          .complete(),
      "INVALID_DATA",
      ODD_DATA,
    );
  });
});
