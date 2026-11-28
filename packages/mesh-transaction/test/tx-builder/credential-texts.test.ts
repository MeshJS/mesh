import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  Protocol,
} from "@meshsdk/core";

import {
  auxiliaryScript,
  BuildOptions,
  BuiltTx,
  certificate,
  donation,
  guard,
  message,
  metadata,
  minFee,
  mint,
  networkId,
  output,
  outputOf,
  proposal,
  referenceInput,
  requiredSigners,
  spend,
  toUtxo,
  TxBuilder,
  TxError,
  Utxo,
  utxosAfter,
  validity,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  rewardAddress,
  vrfKeyHashHex,
} from "../test-util";
import {
  BECH32_KEY,
  caught,
  HEX_EXTENDED_KEY,
  HEX_KEY,
  KEY_FILE_CBOR,
  leakOf,
  MARKERS,
  PHRASE,
} from "./secret-text-util";

// A text given where a credential, a key hash, a script hash, a pool id, a DRep id or a
// transaction hash is taken, or where a number, a function or an object is taken, may be a key
// or a recovery phrase given by mistake. Every error raised for such a text is searched for the
// text and for any 8 characters of it.

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const stake = rewardAddress(1);
const plutus = { code: alwaysSucceedCbor, version: "V3" as const };
const redeemer = { data: { alternative: 0, fields: [] } };
const anchor = { url: "https://example.com/r.json", dataHash: "cd".repeat(32) };
const txHash = "b7".repeat(32);
const action = { txHash, index: 0 };
const funds: Utxo = {
  txHash: "a1".repeat(32),
  outputIndex: 0,
  address: wallet,
  value: { lovelace: 100_000_000n },
};
/** A UTxO given whole that holds a Plutus V3 reference script */
const scriptHolder: Utxo = {
  ...funds,
  outputIndex: 1,
  script: {
    type: "plutus",
    version: "V3",
    code: alwaysSucceedCbor,
    hash: alwaysSucceedHash,
  },
};
const payment = output({ address: recipient, value: { lovelace: 2_000_000n } });
const poolParams = {
  operator: keyHashHex(7),
  vrfKeyHash: vrfKeyHashHex(1),
  pledge: "1000000",
  cost: "340000000",
  margin: [1, 100] as [number, number],
  relays: [],
  owners: [keyHashHex(8)],
  rewardAddress: stake,
};

const offline = () =>
  new TxBuilder({ network: "preprod", params, costModels, evaluator: null });
const buildWith = (options: Partial<BuildOptions>) =>
  offline().build([payment], {
    payer: { changeAddress: wallet, utxos: [funds] },
    ...options,
  });

let built: BuiltTx;
beforeAll(async () => {
  built = await buildWith({});
});

/** A UTxO in the builder's form with one member replaced */
const ownWith = (member: Record<string, unknown>) => ({
  ...funds,
  ...member,
});

/**
 * Every place a text is taken as a credential, a hash or an id, or where a number, a function or
 * an object is taken, each raising its error for the text. A place that takes a 32-byte hash in
 * hex takes a key of 64 hex digits as one, and an asset unit takes any hex of 28 to 60 bytes:
 * `takes` lists the markers a place reads as what it takes, which it is not given
 */
const PLACES: readonly {
  name: string;
  run: (text: string) => unknown;
  code: string;
  takes?: readonly string[];
}[] = [
  // Credentials and key hashes
  {
    name: "the stake credential of scriptAddress, as text",
    run: (text) => offline().scriptAddress(plutus, text),
    code: "INVALID_OPTION",
  },
  {
    name: "the stake credential of scriptAddress, as a credential",
    run: (text) =>
      offline().scriptAddress(plutus, { type: "KEY", value: text }),
    code: "INVALID_OPTION",
  },
  {
    name: "the credential of rewardAddress, as text",
    run: (text) => offline().rewardAddress(text),
    code: "INVALID_OPTION",
  },
  {
    name: "the credential of rewardAddress, as a credential",
    run: (text) => offline().rewardAddress({ type: "SCRIPT", value: text }),
    code: "INVALID_OPTION",
  },
  {
    name: "the stake credential of a certificate",
    run: (text) =>
      certificate.stakeRegistration({ stake: { type: "KEY", value: text } }),
    code: "INVALID_DATA",
  },
  {
    name: "a committee credential",
    run: (text) =>
      certificate.committeeHotAuth({
        cold: { type: "KEY", value: text },
        hot: { type: "KEY", value: keyHashHex(3) },
      }),
    code: "INVALID_DATA",
  },
  {
    name: "a DRep id",
    run: (text) => certificate.voteDelegation({ stake, drep: text }),
    code: "INVALID_DATA",
  },
  {
    name: "a DRep key hash",
    run: (text) =>
      certificate.voteDelegation({
        stake,
        drep: { type: "KEY_HASH", value: text },
      }),
    code: "INVALID_DATA",
  },
  {
    name: "the DRep of a DRep registration",
    run: (text) => certificate.drepRegistration({ drep: text }),
    code: "INVALID_DATA",
  },
  {
    name: "a pool id",
    run: (text) => certificate.stakeDelegation({ stake, pool: text }),
    code: "INVALID_DATA",
  },
  {
    name: "the operator of a pool",
    run: (text) =>
      certificate.poolRegistration({
        params: { ...poolParams, operator: text },
      }),
    code: "INVALID_DATA",
  },
  {
    name: "an owner of a pool",
    run: (text) =>
      certificate.poolRegistration({
        params: { ...poolParams, owners: [text] },
      }),
    code: "INVALID_DATA",
  },
  {
    name: "the VRF key hash of a pool",
    run: (text) =>
      certificate.poolRegistration({
        params: { ...poolParams, vrfKeyHash: text },
      }),
    code: "INVALID_DATA",
    takes: [HEX_KEY],
  },
  {
    name: "the metadata hash of a pool",
    run: (text) =>
      certificate.poolRegistration({
        params: {
          ...poolParams,
          metadata: { URL: "https://example.com/p.json", hash: text },
        },
      }),
    code: "INVALID_DATA",
    takes: [HEX_KEY],
  },
  {
    name: "the pledge of a pool",
    run: (text) =>
      certificate.poolRegistration({ params: { ...poolParams, pledge: text } }),
    code: "INVALID_VALUE",
  },
  {
    name: "the owners of a pool, as text",
    run: (text) =>
      certificate.poolRegistration({
        params: { ...poolParams, owners: text as never },
      }),
    code: "INVALID_DATA",
  },
  {
    name: "a pool voter",
    run: (text) =>
      vote({ voter: { pool: text }, votes: [{ action, vote: "yes" }] }),
    code: "INVALID_DATA",
  },
  {
    name: "a DRep voter",
    run: (text) =>
      vote({ voter: { drep: text }, votes: [{ action, vote: "yes" }] }),
    code: "INVALID_DATA",
  },
  {
    name: "a committee voter",
    run: (text) =>
      vote({
        voter: { committee: { type: "KEY", value: text } },
        votes: [{ action, vote: "yes" }],
      }),
    code: "INVALID_DATA",
  },
  {
    name: "the voter, as text",
    run: (text) =>
      vote({ voter: text as never, votes: [{ action, vote: "yes" }] }),
    code: "INVALID_DATA",
  },
  {
    name: "the key hash of a guard",
    run: (text) => guard.pubKey({ keyHash: text }),
    code: "INVALID_DATA",
  },
  // Script hashes
  {
    name: "the policy id of a mint",
    run: (text) =>
      mint.plutus({
        script: plutus,
        redeemer,
        assets: { abcd: 1n },
        policyId: text,
      }),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the script hash of a referenced script",
    run: (text) =>
      spend.plutus({
        utxo: funds,
        script: { reference: { txHash, outputIndex: 1 }, scriptHash: text },
        redeemer,
      } as never),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the policy hash of a proposal",
    run: (text) =>
      proposal.parameterChange({
        rewardAccount: stake,
        anchor,
        updates: { minFeeA: 44 } as never,
        policyHash: text,
      }),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the guardrail script hash of a constitution",
    run: (text) =>
      proposal.newConstitution({
        rewardAccount: stake,
        anchor,
        constitution: { anchor, scriptHash: text },
      }),
    code: "INVALID_SCRIPT",
  },
  // Transaction hashes and other 32-byte hashes
  {
    name: "the transaction hash of an out ref",
    run: (text) => referenceInput({ utxo: { txHash: text, outputIndex: 0 } }),
    code: "INVALID_OUT_REF",
    takes: [HEX_KEY],
  },
  {
    name: "the transaction hash of a governance action",
    run: (text) =>
      vote({
        voter: { pool: keyHashHex(1) },
        votes: [{ action: { txHash: text, index: 0 }, vote: "yes" }],
      }),
    code: "INVALID_DATA",
    takes: [HEX_KEY],
  },
  {
    name: "the data hash of an anchor",
    run: (text) =>
      proposal.info({
        rewardAccount: stake,
        anchor: { url: anchor.url, dataHash: text },
      }),
    code: "INVALID_DATA",
    takes: [HEX_KEY],
  },
  {
    name: "the datum hash of an output",
    run: (text) =>
      output({
        address: recipient,
        value: { lovelace: 2_000_000n },
        datum: { type: "hash", hash: text },
      }),
    code: "INVALID_DATA",
    takes: [HEX_KEY],
  },
  {
    name: "the transaction hash of a UTxO",
    run: (text) => toUtxo(ownWith({ txHash: text })),
    code: "INVALID_OPTION",
    takes: [HEX_KEY],
  },
  {
    name: "the datum hash of a UTxO",
    run: (text) => toUtxo(ownWith({ datum: { type: "hash", hash: text } })),
    code: "INVALID_OPTION",
    takes: [HEX_KEY],
  },
  {
    name: "the script hash of a UTxO's reference script",
    run: (text) =>
      toUtxo(
        ownWith({
          script: { type: "unknown", scriptRef: "8200", hash: text },
        }),
      ),
    code: "INVALID_OPTION",
  },
  {
    name: "the dataHash of a Mesh UTxO",
    run: (text) =>
      toUtxo({
        input: { txHash, outputIndex: 0 },
        output: {
          address: wallet,
          amount: [{ unit: "lovelace", quantity: "5000000" }],
          plutusData: "d87980",
          dataHash: text,
        },
      }),
    code: "INVALID_OPTION",
  },
  // Numbers and units given as text
  {
    name: "the quantity of a Mesh UTxO",
    run: (text) =>
      toUtxo({
        input: { txHash, outputIndex: 0 },
        output: {
          address: wallet,
          amount: [{ unit: "lovelace", quantity: text }],
        },
      }),
    code: "INVALID_OPTION",
  },
  {
    name: "the unit of a UTxO",
    run: (text) =>
      toUtxo(ownWith({ value: { lovelace: 1_000_000n, [text]: 1n } })),
    code: "INVALID_OPTION",
    takes: [HEX_KEY, KEY_FILE_CBOR],
  },
  {
    name: "the output index of an out ref",
    run: (text) =>
      referenceInput({ utxo: { txHash, outputIndex: text as never } }),
    code: "INVALID_OUT_REF",
  },
  {
    name: "a quantity of an output",
    run: (text) =>
      output({
        address: recipient,
        value: [{ unit: "lovelace", quantity: text }],
      }),
    code: "INVALID_VALUE",
  },
  {
    name: "a unit of an output",
    run: (text) =>
      output({
        address: recipient,
        value: { lovelace: 2_000_000n, [`${text}zz`]: 1n },
      }),
    code: "INVALID_VALUE",
  },
  {
    name: "the value of an output",
    run: (text) => output({ address: recipient, value: text as never }),
    code: "INVALID_VALUE",
  },
  {
    name: "an asset name of a mint",
    run: (text) =>
      mint.plutus({ script: plutus, redeemer, assets: { [`${text}zz`]: 1n } }),
    code: "INVALID_VALUE",
  },
  {
    name: "a quantity of a mint",
    run: (text) =>
      mint.plutus({
        script: plutus,
        redeemer,
        assets: { abcd: text as never },
      }),
    code: "INVALID_VALUE",
  },
  {
    name: "the amount of a withdrawal",
    run: (text) =>
      withdrawal.pubKey({ rewardAddress: stake, amount: text as never }),
    code: "INVALID_VALUE",
  },
  {
    name: "the deposit of a certificate",
    run: (text) =>
      certificate.stakeRegistration({ stake, deposit: text as never }),
    code: "INVALID_VALUE",
  },
  {
    name: "the amount of a donation",
    run: (text) => donation({ amount: text as never }),
    code: "INVALID_VALUE",
  },
  {
    name: "a metadata label",
    run: (text) => metadata({ metadataLabel: text as never, value: 1n }),
    code: "INVALID_DATA",
  },
  {
    name: "a slot of validity",
    run: (text) => validity({ invalidBefore: text as never }),
    code: "INVALID_DATA",
  },
  {
    name: "a time of validity",
    run: (text) => validity({ from: text as never }),
    code: "INVALID_DATA",
  },
  {
    name: "the epoch of a pool retirement",
    run: (text) =>
      certificate.poolRetirement({ pool: keyHashHex(7), epoch: text as never }),
    code: "INVALID_DATA",
  },
  {
    name: "the execution units of a redeemer",
    run: (text) =>
      mint.plutus({
        script: plutus,
        redeemer: { ...redeemer, exUnits: { mem: text, steps: 1 } as never },
        assets: { abcd: 1n },
      }),
    code: "INVALID_DATA",
  },
  {
    name: "the redeemer, as text",
    run: (text) =>
      mint.plutus({
        script: plutus,
        redeemer: text as never,
        assets: { abcd: 1n },
      }),
    code: "INVALID_DATA",
  },
  {
    name: "a treasury withdrawal amount",
    run: (text) =>
      proposal.treasuryWithdrawals({
        rewardAccount: stake,
        anchor,
        withdrawals: { [stake]: text as never },
      }),
    code: "INVALID_VALUE",
  },
  {
    name: "a protocol parameter given as text",
    run: (text) =>
      proposal.parameterChange({
        rewardAccount: stake,
        anchor,
        updates: { minFeeA: text } as never,
      }),
    code: "INVALID_VALUE",
  },
  // Options of the builder and arguments of its functions
  {
    name: "the network of a builder",
    run: (text) => new TxBuilder({ network: text as never }),
    code: "INVALID_OPTION",
  },
  {
    name: "the build option fee",
    run: (text) => buildWith({ fee: text as never }),
    code: "INVALID_OPTION",
  },
  {
    name: "the build option trace",
    run: (text) => buildWith({ trace: text as never }),
    code: "INVALID_OPTION",
  },
  {
    name: "the build option canSelect",
    run: (text) => buildWith({ canSelect: text as never }),
    code: "INVALID_OPTION",
  },
  {
    name: "the build option registeredPools",
    run: (text) => buildWith({ registeredPools: [text, 1] as never }),
    code: "INVALID_OPTION",
  },
  {
    name: "the build option extraKeyWitnesses",
    run: (text) => buildWith({ extraKeyWitnesses: text as never }),
    code: "INVALID_OPTION",
  },
  {
    name: "the parts of a build, as text",
    run: (text) =>
      offline().build(text as never, {
        payer: { changeAddress: wallet, utxos: [funds] },
      }),
    code: "INVALID_OPTION",
  },
  {
    name: "the time of slotAt",
    run: (text) => offline().slotAt(text as never),
    code: "INVALID_OPTION",
  },
  {
    name: "the round of slotAt",
    run: (text) => offline().slotAt(0, text as never),
    code: "INVALID_OPTION",
  },
  {
    name: "the slot of timeAt",
    run: (text) => offline().timeAt(text as never),
    code: "INVALID_OPTION",
  },
  {
    name: "a deadline of the builder's plan defaults",
    run: (text) =>
      new TxBuilder({
        network: "preprod",
        params,
        costModels,
        evaluator: null,
        planDefaults: { ttlMs: text as never },
      }),
    code: "INVALID_OPTION",
  },
  {
    name: "the prototype of minFee",
    run: (text) =>
      minFee(text as never, { params, vkeyWitnesses: 1, inputs: [] }),
    code: "INVALID_OPTION",
  },
  {
    name: "the key witnesses of minFee",
    run: (text) =>
      minFee(built.prototype, { params, vkeyWitnesses: text as never }),
    code: "INVALID_OPTION",
  },
  {
    name: "the UTxOs of utxosAfter, as text",
    run: (text) => utxosAfter(text as never, built),
    code: "INVALID_OPTION",
  },
  {
    name: "the built transaction of outputOf, as text",
    run: (text) => outputOf(text as never, "a"),
    code: "INVALID_OPTION",
  },
  {
    name: "the spent UTxOs of requiredSigners, as text",
    run: (text) => requiredSigners(built.tx, text as never),
    code: "INVALID_OPTION",
  },
  {
    name: "the witness of a script credential, as text",
    run: (text) =>
      certificate.stakeDeregistration({
        stake: { type: "SCRIPT", value: keyHashHex(3) },
        witness: text as never,
      }),
    code: "WITNESS_MISMATCH",
  },
  {
    name: "the script of an auxiliary script, as text",
    run: (text) => auxiliaryScript({ script: text as never }),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the datum of a Plutus spend, as text",
    run: (text) =>
      spend.plutus({
        utxo: { txHash, outputIndex: 0 },
        script: plutus,
        redeemer,
        datum: text,
      } as never),
    code: "INVALID_DATA",
  },
  // Texts given where one of a few names is taken, or as what is not a text
  {
    name: "the network of networkId",
    run: (text) => networkId({ network: text as never }),
    code: "INVALID_DATA",
  },
  {
    name: "a pool metadata URL too long",
    run: (text) =>
      certificate.poolRegistration({
        params: {
          ...poolParams,
          metadata: { URL: text + text, hash: "cd".repeat(32) },
        },
      } as never),
    code: "INVALID_DATA",
  },
  {
    name: "the Plutus version of a spend script",
    run: (text) =>
      spend.plutus({
        utxo: { txHash, outputIndex: 0 },
        script: { code: alwaysSucceedCbor, version: text },
        redeemer,
        datum: "inline",
      } as never),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the Plutus version of a mint script",
    run: (text) =>
      mint.plutus({
        script: { code: alwaysSucceedCbor, version: text },
        assets: { "": 1n },
        redeemer,
      } as never),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the Plutus version of an auxiliary script",
    run: (text) =>
      auxiliaryScript({
        script: { code: alwaysSucceedCbor, version: text } as never,
      }),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the Plutus version of scriptAddress",
    run: (text) =>
      offline().scriptAddress({
        code: alwaysSucceedCbor,
        version: text,
      } as never),
    code: "INVALID_OPTION",
  },
  {
    name: "the Plutus version of a script in a reference UTxO given whole",
    run: (text) =>
      spend.plutus({
        utxo: { txHash, outputIndex: 0 },
        script: { reference: scriptHolder, version: text },
        redeemer,
        datum: "inline",
      } as never),
    code: "INVALID_SCRIPT",
  },
  {
    name: "a label given as a list",
    run: (text) =>
      output({
        address: recipient,
        value: { lovelace: 2_000_000n },
        label: [text] as never,
      }),
    code: "INVALID_DATA",
  },
  {
    name: "a label given as a String object",
    run: (text) =>
      output({
        address: recipient,
        value: { lovelace: 2_000_000n },
        label: new String(text) as never,
      }),
    code: "INVALID_DATA",
  },
  {
    name: "a message entry given as a list",
    run: (text) => message({ text: [[text]] as never }),
    code: "INVALID_DATA",
  },
  {
    name: "a message text given as a String object",
    run: (text) => message({ text: new String(text) as never }),
    code: "INVALID_DATA",
  },
  {
    name: "the datum type of a spent UTxO",
    run: (text) =>
      spend.pubKey({ utxo: { ...funds, datum: { type: text } } as never }),
    code: "INVALID_DATA",
  },
  {
    name: "the script type of a spent UTxO",
    run: (text) =>
      spend.pubKey({ utxo: { ...funds, script: { type: text } } as never }),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the script version of a spent UTxO",
    run: (text) =>
      spend.pubKey({
        utxo: {
          ...funds,
          script: {
            type: "plutus",
            version: text,
            code: alwaysSucceedCbor,
            hash: "00".repeat(28),
          },
        } as never,
      }),
    code: "INVALID_SCRIPT",
  },
  {
    name: "the type of a native script",
    run: (text) => auxiliaryScript({ script: { type: text } as never }),
    code: "INVALID_SCRIPT",
  },
];

describe("a text given as a credential, a hash, an id or a number that is none", () => {
  for (const place of PLACES)
    for (const marker of MARKERS)
      if (!place.takes?.includes(marker.text))
        it(`stays out of the error: ${place.name}, ${marker.name}`, async () => {
          const error = await caught(() => place.run(marker.text));
          expect(TxError.is(error, place.code as never)).toBe(true);
          expect(leakOf(error, marker.secret)).toBeUndefined();
        });

  it("is told by its shape, and details.value by its type", async () => {
    const error = await caught(() => offline().scriptAddress(plutus, HEX_KEY));
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as TxError).message).toBe(
      'invalid stake: expected a bech32 reward address, or a credential { type: "KEY" | "SCRIPT", value: <28-byte hash in hex> } (invalid reward address: expected a reward address in bech32 or hex; got 64 hex digits)',
    );
    expect((error as TxError & { details: unknown }).details).toEqual({
      option: "stake",
      value: "string",
      allowed:
        'a bech32 reward address, or a credential { type: "KEY" | "SCRIPT", value: <28-byte hash in hex> }',
    });

    const credential = await caught(() =>
      offline().rewardAddress({ type: "KEY", value: HEX_EXTENDED_KEY }),
    );
    expect((credential as TxError & { details: unknown }).details).toEqual(
      expect.objectContaining({ option: "credential", value: "object" }),
    );
    expect((credential as TxError).message).toContain(
      "got the value 128 hex digits",
    );

    const drep = await caught(() =>
      certificate.voteDelegation({ stake, drep: BECH32_KEY }),
    );
    expect((drep as Error).message).toBe(
      `certificate: invalid DRep id: expected a DRep id in bech32; got text of ${BECH32_KEY.length} characters with the prefix ed25519e_sk`,
    );
    expect((drep as Error).cause).toBeUndefined();

    const pool = await caught(() =>
      certificate.stakeDelegation({ stake, pool: HEX_KEY }),
    );
    expect((pool as Error).message).toBe(
      "certificate: invalid pool id: expected a pool id in bech32 or a 28-byte key hash in hex; got 64 hex digits",
    );
    expect((pool as Error).cause).toBeUndefined();

    const fee = await caught(() => buildWith({ fee: HEX_KEY as never }));
    expect((fee as TxError).message).toBe(
      "invalid fee: expected a bigint of lovelace, 0 or more; got 64 hex digits",
    );
    expect((fee as TxError & { details: unknown }).details).toEqual({
      option: "fee",
      value: "string",
      allowed: "a bigint of lovelace, 0 or more",
    });
  });

  it("names the few values a place takes, and the shape of what was given", async () => {
    const network = await caught(() =>
      networkId({ network: HEX_KEY as never }),
    );
    expect((network as Error).message).toBe(
      'networkId: invalid network: expected "mainnet" or "testnet"; got 64 hex digits',
    );
    const version = await caught(() =>
      auxiliaryScript({
        script: { code: alwaysSucceedCbor, version: HEX_KEY } as never,
      }),
    );
    expect((version as Error).message).toMatch(
      /^auxiliaryScript: invalid Plutus script of the version 64 hex digits, not V1, V2 or V3: /,
    );
    const reference = await caught(() =>
      spend.plutus({
        utxo: { txHash, outputIndex: 0 },
        script: { reference: scriptHolder, version: "V2" },
        redeemer,
        datum: "inline",
      } as never),
    );
    expect((reference as Error).message).toBe(
      "spend: version V2 does not match the reference script's V3",
    );
    const label = await caught(() =>
      output({
        address: recipient,
        value: { lovelace: 2_000_000n },
        label: [PHRASE] as never,
      }),
    );
    expect((label as Error).message).toBe(
      "output: invalid label a value of type object: expected a string",
    );
  });

  it("names a number given by mistake as it is", async () => {
    const fee = await caught(() => buildWith({ fee: -1n }));
    expect((fee as TxError).message).toBe(
      "invalid fee: expected a bigint of lovelace, 0 or more; got -1n",
    );
    expect(
      (fee as TxError & { details: { value: unknown } }).details.value,
    ).toBe(-1n);
  });
});
