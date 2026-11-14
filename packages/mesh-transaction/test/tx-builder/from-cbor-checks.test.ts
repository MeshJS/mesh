import { randomBytes } from "node:crypto";
import { bech32 } from "bech32";

import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IFetcher,
  NativeScript,
  Protocol,
  resolveNativeScriptHash,
} from "@meshsdk/core";
import {
  Crypto,
  keyHashToRewardAddress,
  toNativeScript,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";

import {
  certificate,
  keySigner,
  output,
  OutputScript,
  proposal,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxError,
  TxPlanError,
  Utxo,
  withdrawal,
} from "../../src/tx-builder";
import { baseAddress, keyHashHex, vrfKeyHashHex } from "../test-util";
import {
  arr,
  arrIndef,
  bytes,
  map,
  tag258,
  tx,
  txHashOf,
  uint,
  vkeyWitness,
} from "./cbor-util";
import { keysSigner, TestKey, testKey } from "./hash-signer-util";
import { asCbor, asMesh, ref } from "./utxo-util";

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const ada = (n: number) => BigInt(n) * 1_000_000n;
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };

/** A builder without a provider: it reads nothing */
const offline = () => new TxBuilder({ network: "preprod", params, costModels });

/** The same base address on mainnet */
const onMainnet = (address: string) => {
  const raw = bech32.fromWords(bech32.decode(address, 200).words);
  raw[0] = raw[0]! | 0x01;
  return bech32.encode("addr", bech32.toWords(raw), 200);
};

let key: TestKey;
let payee: string;
beforeAll(async () => {
  await Crypto.ready();
  key = testKey();
  // A preprod enterprise address of the key, in hex
  payee = `60${key.keyHash}`;
});

let nextHash = 0;
/** A fresh transaction hash */
const hashOf = () => (++nextHash).toString(16).padStart(64, "d");

/** An out ref of a body: the transaction hash and the index */
type Ref = [string, number];

/** An input set with the set tag */
const inputSet = (refs: Ref[]) =>
  tag258(arr(...refs.map(([hash, index]) => arr(bytes(hash), uint(index)))));

/**
 * A body with the set tag that pays 3 ada to each of `to` (addresses in hex) from `inputs`, with
 * collateral inputs and reference inputs when given
 */
const bodyOf = ({
  inputs,
  collateral,
  references,
  to,
  fee = 170_000,
  extra = [],
}: {
  inputs: Ref[];
  collateral?: Ref[];
  references?: Ref[];
  to?: string[];
  fee?: number;
  extra?: [string, string][];
}) =>
  map(
    [uint(0), inputSet(inputs)],
    [
      uint(1),
      arr(
        ...(to ?? [payee]).map((address) =>
          map([uint(0), bytes(address)], [uint(1), uint(3_000_000)]),
        ),
      ),
    ],
    [uint(2), uint(fee)],
    ...extra,
    ...(collateral
      ? [[uint(13), inputSet(collateral)] as [string, string]]
      : []),
    ...(references
      ? [[uint(18), inputSet(references)] as [string, string]]
      : []),
  );

/** The UTxO of an out ref, at the key's address unless said */
const utxoOf = (
  [txHash, outputIndex]: Ref,
  extra: Partial<Utxo> = {},
): Utxo => ({
  txHash,
  outputIndex,
  address: key.address,
  value: { lovelace: ada(10) },
  ...extra,
});

/**
 * A provider whose every call is recorded. `fetchUTxOs` answers from `answers` by the hash
 * asked, in the Mesh form, after `gate` when given
 */
const fakeProvider = (
  answers: Record<string, unknown> = {},
  { gate }: { gate?: Promise<void> } = {},
) => {
  const calls: string[] = [];
  const asked: string[] = [];
  let open = 0;
  let mostOpen = 0;
  const record =
    (name: string, answer: (...args: never[]) => unknown) =>
    async (...args: never[]) => {
      calls.push(name);
      return answer(...args);
    };
  const provider = {
    fetchUTxOs: async (hash: string) => {
      calls.push("fetchUTxOs");
      asked.push(hash);
      open++;
      mostOpen = Math.max(mostOpen, open);
      try {
        if (gate) await gate;
        const answer = answers[hash];
        if (answer instanceof Error) throw answer;
        return Array.isArray(answer)
          ? answer.map((entry) =>
              typeof entry === "object" && entry !== null && "txHash" in entry
                ? asMesh(entry as Utxo)
                : entry,
            )
          : (answer ?? []);
      } finally {
        open--;
      }
    },
    fetchAddressUTxOs: record("fetchAddressUTxOs", () => []),
    fetchAccountInfo: record("fetchAccountInfo", () => ({})),
    fetchAssetAddresses: record("fetchAssetAddresses", () => []),
    fetchAssetMetadata: record("fetchAssetMetadata", () => ({})),
    fetchBlockInfo: record("fetchBlockInfo", () => ({})),
    fetchCollectionAssets: record("fetchCollectionAssets", () => ({})),
    fetchProtocolParameters: record("fetchProtocolParameters", () => params),
    fetchCostModels: record("fetchCostModels", () => costModels),
    fetchTxInfo: record("fetchTxInfo", () => ({})),
    fetchGovernanceProposal: record("fetchGovernanceProposal", () => ({})),
    get: record("get", () => ({})),
    submitTx: record("submitTx", () => "00"),
  };
  return {
    provider: provider as unknown as IFetcher,
    calls,
    asked,
    mostOpen: () => mostOpen,
  };
};

const online = (provider: IFetcher) =>
  new TxBuilder({ network: "preprod", provider, params, costModels });

const caught = async (run: () => unknown): Promise<any> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};

const expectBuildError = (error: unknown, code: string) => {
  expect(error).toBeInstanceOf(TxBuildError);
  expect(TxError.is(error, code as never)).toBe(true);
};

/** The message, details and stack of an error and of every cause under it, as text */
const everything = (error: unknown): string => {
  const texts: string[] = [];
  let at: unknown = error;
  for (let depth = 0; at !== undefined && at !== null && depth < 10; depth++) {
    if (at instanceof Error) {
      texts.push(at.message, at.stack ?? "");
      const details = (at as { details?: unknown }).details;
      if (details !== undefined)
        texts.push(
          JSON.stringify(details, (_, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
        );
      at = (at as { cause?: unknown }).cause;
    } else {
      texts.push(String(at));
      break;
    }
  }
  return texts.join("\n");
};

/** A native script as an output holds it for reference */
const nativeRefOf = (script: NativeScript): OutputScript => ({
  type: "native",
  cbor: toNativeScript(script).toCbor().toString(),
  hash: resolveNativeScriptHash(script),
});

describe("TxBuilder.fromCbor › the UTxOs", () => {
  it("reads each transaction its inputs come from once, all at once, through the shared cache, and calls nothing else of the provider", async () => {
    const [a, b] = [hashOf(), hashOf()];
    const inputs: Ref[] = [
      [a, 0],
      [b, 0],
      [a, 1],
    ];
    const collateral: Ref[] = [[b, 1]];
    const references: Ref[] = [[a, 2]];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { provider, calls, asked, mostOpen } = fakeProvider(
      {
        [a]: [utxoOf([a, 0]), utxoOf([a, 1]), utxoOf([a, 2])],
        [b]: [utxoOf([b, 0]), utxoOf([b, 1])],
      },
      { gate },
    );
    const builder = online(provider);
    const pending = builder.fromCbor(
      tx(bodyOf({ inputs, collateral, references })),
    );
    // Both reads are asked before either is answered
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect([...asked].sort()).toEqual([a, b].sort());
    release();
    const built = await pending;
    expect(mostOpen()).toBe(2);
    expect(calls).toEqual(["fetchUTxOs", "fetchUTxOs"]);
    expect(built.inputs.map(ref)).toEqual(
      inputs.map(([txHash, outputIndex]) => ({ txHash, outputIndex })),
    );
    expect(built.collateral?.inputs.map(ref)).toEqual([
      { txHash: b, outputIndex: 1 },
    ]);
    expect(built.referenceInputs.map(ref)).toEqual([
      { txHash: a, outputIndex: 2 },
    ]);
  });

  it("answers a second call from the cache, on the same builder and on another over the same provider", async () => {
    const a = hashOf();
    const { provider, calls } = fakeProvider({ [a]: [utxoOf([a, 0])] });
    const given = tx(bodyOf({ inputs: [[a, 0]] }));
    const first = await online(provider).fromCbor(given);
    expect(calls).toEqual(["fetchUTxOs"]);
    const builder = online(provider);
    const again = await builder.fromCbor(given);
    const other = await online(provider).fromCbor(given);
    expect(calls).toEqual(["fetchUTxOs"]);
    expect(again.inputs).toEqual(first.inputs);
    expect(other.inputs).toEqual(first.inputs);
  });

  it("uses knownUtxos as given, in each form of a UTxO, looks none of them up and reads only the rest", async () => {
    const [a, b, c, d] = [hashOf(), hashOf(), hashOf(), hashOf()];
    const known = {
      own: utxoOf([a, 0], { value: { lovelace: ada(7) } }),
      mesh: utxoOf([b, 0], { value: { lovelace: ada(8) } }),
      cbor: utxoOf([c, 0], { value: { lovelace: ada(9) } }),
    };
    const unknown = utxoOf([d, 0], { value: { lovelace: ada(11) } });
    const { provider, calls, asked } = fakeProvider({
      // A provider that would answer otherwise for the known ones
      [a]: [utxoOf([a, 0], { value: { lovelace: ada(1) } })],
      [b]: [utxoOf([b, 0], { value: { lovelace: ada(1) } })],
      [c]: [utxoOf([c, 0], { value: { lovelace: ada(1) } })],
      [d]: [unknown],
    });
    const built = await online(provider).fromCbor(
      tx(
        bodyOf({
          inputs: [
            [a, 0],
            [b, 0],
            [c, 0],
            [d, 0],
          ],
        }),
      ),
      {
        knownUtxos: [known.own, asMesh(known.mesh), asCbor(known.cbor)],
      },
    );
    expect(calls).toEqual(["fetchUTxOs"]);
    expect(asked).toEqual([d]);
    expect(built.inputs).toEqual([known.own, known.mesh, known.cbor, unknown]);
    // Upper-case hex in a known UTxO names the same out ref
    const upper = await offline().fromCbor(tx(bodyOf({ inputs: [[a, 0]] })), {
      knownUtxos: [{ ...known.own, txHash: a.toUpperCase() }],
    });
    expect(upper.inputs).toEqual([known.own]);
  });

  it("takes of the provider's answer only outputs of the transaction asked for, each under its own out ref, and never in place of a known UTxO", async () => {
    const [a, b, c] = [hashOf(), hashOf(), hashOf()];
    const forged = { address: baseAddress(3), value: { lovelace: ada(999) } };
    const known = utxoOf([b, 0]);
    const { provider } = fakeProvider({
      // The answer for a holds its own output, and forged outputs of b and c
      [a]: [utxoOf([a, 0]), utxoOf([b, 0], forged), utxoOf([c, 0], forged)],
      [c]: [],
    });
    // b is known: the forged b is not taken in its place
    const built = await online(provider).fromCbor(
      tx(
        bodyOf({
          inputs: [
            [a, 0],
            [b, 0],
          ],
        }),
      ),
      { knownUtxos: [known] },
    );
    expect(built.inputs).toEqual([utxoOf([a, 0]), known]);
    // a#0 is known and a#1 is not: the answer read for a#1 lists a#0 otherwise, and the known
    // one stays
    const sibling = utxoOf([a, 0], { value: { lovelace: ada(7) } });
    const both = await online(
      fakeProvider({ [a]: [utxoOf([a, 0], forged), utxoOf([a, 1])] }).provider,
    ).fromCbor(
      tx(
        bodyOf({
          inputs: [
            [a, 0],
            [a, 1],
          ],
        }),
      ),
      { knownUtxos: [sibling] },
    );
    expect(both.inputs).toEqual([sibling, utxoOf([a, 1])]);
    // c is read from its own transaction, which does not list it: the forged c is not taken
    const error = await caught(() =>
      online(
        fakeProvider({
          [a]: [utxoOf([a, 0]), utxoOf([c, 0], forged)],
          [c]: [],
        }).provider,
      ).fromCbor(
        tx(
          bodyOf({
            inputs: [
              [a, 0],
              [c, 0],
            ],
          }),
        ),
      ),
    );
    expectBuildError(error, "UTXO_NOT_FOUND");
    expect(error.details.input).toEqual({ txHash: c, outputIndex: 0 });
    // An output of the transaction asked for under another index is not taken for the one named
    const shifted = await caught(() =>
      online(fakeProvider({ [a]: [utxoOf([a, 1])] }).provider).fromCbor(
        tx(bodyOf({ inputs: [[a, 0]] })),
      ),
    );
    expectBuildError(shifted, "UTXO_NOT_FOUND");
    expect(shifted.details.input).toEqual({ txHash: a, outputIndex: 0 });
  });

  it("is INVALID_OPTION (knownUtxos) for two entries that name one output and differ, in either order, and takes repeats that are alike in any form", async () => {
    const a = hashOf();
    const given = tx(bodyOf({ inputs: [[a, 0]] }));
    const first = utxoOf([a, 0]);
    for (const second of [
      utxoOf([a, 0], { value: { lovelace: ada(11) } }),
      utxoOf([a, 0], { address: baseAddress(3) }),
      utxoOf([a, 0], {
        value: { lovelace: ada(10), [`${"cc".repeat(28)}41`]: 1n },
      }),
    ])
      for (const knownUtxos of [
        [first, second],
        [second, first],
      ]) {
        const error = await caught(() =>
          offline().fromCbor(given, { knownUtxos }),
        );
        expectBuildError(error, "INVALID_OPTION");
        expect(error.details).toEqual({
          option: "knownUtxos",
          value: "object",
          allowed:
            "a list of UTxOs in which the entries that name one output are alike",
        });
        expect(error.message).toBe(
          `invalid knownUtxos: two entries name the output ${a}#0 and differ`,
        );
      }
    const made = await offline().fromCbor(given, {
      knownUtxos: [
        first,
        asMesh(first),
        asCbor(first),
        { ...first, txHash: a.toUpperCase() },
      ],
    });
    expect(made.inputs).toEqual([first]);
  });

  it("does not use a known UTxO the transaction does not name", async () => {
    const [a, b] = [hashOf(), hashOf()];
    const built = await offline().fromCbor(tx(bodyOf({ inputs: [[a, 0]] })), {
      knownUtxos: [utxoOf([a, 0]), utxoOf([b, 0])],
    });
    expect(built.inputs).toEqual([utxoOf([a, 0])]);
    expect(built.referenceInputs).toEqual([]);
    expect(built.collateral).toBeUndefined();
    expect(JSON.stringify(built.toJSON())).not.toContain(b);
  });

  it("is UTXO_NOT_FOUND with the out ref for an input, a collateral input and a reference input that is neither known nor found, the first in the body's order", async () => {
    const [a, b, c] = [hashOf(), hashOf(), hashOf()];
    const cases: [Parameters<typeof bodyOf>[0], Ref, string][] = [
      [{ inputs: [[a, 0]] }, [a, 0], "spends"],
      [
        { inputs: [[b, 0]], collateral: [[a, 0]] },
        [a, 0],
        "puts up as collateral",
      ],
      [{ inputs: [[b, 0]], references: [[a, 0]] }, [a, 0], "reads"],
      // Missing everywhere: the input comes first, then the collateral input
      [
        { inputs: [[c, 0]], collateral: [[a, 0]], references: [[a, 1]] },
        [c, 0],
        "spends",
      ],
      [
        { inputs: [[b, 0]], collateral: [[a, 0]], references: [[a, 1]] },
        [a, 0],
        "puts up as collateral",
      ],
    ];
    for (const [shape, [txHash, outputIndex], role] of cases) {
      const { provider } = fakeProvider({ [b]: [utxoOf([b, 0])] });
      const error = await caught(() =>
        online(provider).fromCbor(tx(bodyOf(shape))),
      );
      expectBuildError(error, "UTXO_NOT_FOUND");
      expect(error.details).toEqual({ input: { txHash, outputIndex } });
      expect(error.message).toContain(role);
      expect(error.message).toContain("knownUtxos");
    }
  });

  it("is UTXO_NOT_FOUND with the provider's error as cause for a read that fails, an answer that is not a list, an entry that is not a UTxO", async () => {
    const a = hashOf();
    const failure = new Error("the provider is down");
    for (const answer of [failure, { not: "a list" }, [{ broken: true }]]) {
      const error = await caught(() =>
        online(fakeProvider({ [a]: answer }).provider).fromCbor(
          tx(bodyOf({ inputs: [[a, 0]] })),
        ),
      );
      expectBuildError(error, "UTXO_NOT_FOUND");
      expect(error.details).toEqual({ input: { txHash: a, outputIndex: 0 } });
      expect(error.cause).toBeDefined();
      if (answer === failure) expect(error.cause).toBe(failure);
    }
  });

  it("is MISSING_FETCHER on a builder without a provider for a UTxO that is not known, and makes the object without any request with every UTxO known", async () => {
    const [a, b] = [hashOf(), hashOf()];
    const given = tx(
      bodyOf({
        inputs: [[a, 0]],
        collateral: [[b, 0]],
        references: [[b, 1]],
      }),
    );
    const error = await caught(() =>
      offline().fromCbor(given, { knownUtxos: [utxoOf([a, 0])] }),
    );
    expectBuildError(error, "MISSING_FETCHER");
    expect(error.message).toContain(`${b}#0`);
    expect(error.message).toContain(`${b}#1`);
    expect(error.message).toContain("knownUtxos");
    const all = [utxoOf([a, 0]), utxoOf([b, 0]), utxoOf([b, 1])];
    const built = await offline().fromCbor(given, { knownUtxos: all });
    expect(built.inputs).toEqual([all[0]]);
    // On a builder with a provider, nothing is read either
    const { provider, calls } = fakeProvider();
    await online(provider).fromCbor(given, { knownUtxos: all });
    expect(calls).toEqual([]);
  });

  it("finds the native script a spent input or a reference input holds, and lists its keys for signers", async () => {
    const scriptKey = testKey();
    const native: NativeScript = { type: "sig", keyHash: scriptKey.keyHash };
    const scriptAddress = offline().scriptAddress(native);
    const script = nativeRefOf(native);
    const [a, b] = [hashOf(), hashOf()];
    const holding = {
      // The spent input holds its own script
      spent: [utxoOf([a, 0], { address: scriptAddress, script })],
      // A reference input holds it
      read: [
        utxoOf([a, 0], { address: scriptAddress }),
        utxoOf([b, 0], { script }),
      ],
    };
    for (const [shape, knownUtxos] of [
      [{ inputs: [[a, 0]] as Ref[] }, holding.spent],
      [
        { inputs: [[a, 0]] as Ref[], references: [[b, 0]] as Ref[] },
        holding.read,
      ],
    ] as const) {
      const built = await offline().fromCbor(tx(bodyOf(shape)), {
        knownUtxos,
      });
      expect(built.signers.nativeScripts).toHaveLength(1);
      expect(built.signers.keys).toEqual([]);
      expect(built.missing).toEqual([]);
      // A signer is asked for the key the script names
      const { signer, requests } = keysSigner("object", scriptKey);
      await built.sign({ signers: signer });
      expect(requests[0]!.keys).toEqual([
        { keyHash: scriptKey.keyHash, roles: ["nativeScript"] },
      ]);
    }
    // Without the holder, no script is listed
    const without = await offline().fromCbor(tx(bodyOf({ inputs: [[a, 0]] })), {
      knownUtxos: [utxoOf([a, 0], { address: scriptAddress })],
    });
    expect(without.signers.nativeScripts).toEqual([]);
  });
});

describe("TxBuilder.fromCbor › the network", () => {
  const stake = keyHashToRewardAddress(keyHashHex(5), 0);
  const mainnetStake = keyHashToRewardAddress(keyHashHex(5), 1);
  const payerUtxo = (): Utxo => ({
    txHash: hashOf(),
    outputIndex: 0,
    address: baseAddress(1),
    value: { lovelace: ada(1000) },
  });

  /** A preprod build, its prototype changed by `edit`, written again */
  const edited = async (
    parts: Parameters<TxBuilder["build"]>[0],
    edit: (body: any) => void,
  ) => {
    const utxo = payerUtxo();
    const built = await offline().build(parts, {
      payer: { changeAddress: baseAddress(1), utxos: [utxo] },
    });
    const prototype = structuredClone(built.prototype);
    edit(prototype.body);
    return {
      tx: transactionPrototypeToHex(prototype),
      knownUtxos: [...built.inputs, ...built.referenceInputs],
    };
  };

  const mismatch = async (given: { tx: string; knownUtxos: Utxo[] }) => {
    const error = await caught(() =>
      offline().fromCbor(given.tx, { knownUtxos: given.knownUtxos }),
    );
    expectBuildError(error, "NETWORK_MISMATCH");
    expect(error.details.expected).toEqual({ name: "preprod", networkId: 0 });
    return error.details.found;
  };

  it("is NETWORK_MISMATCH for an output, a collateral return, a withdrawal, a pool's reward account and a proposal's reward account, each with its role", async () => {
    const mainnet = onMainnet(baseAddress(2));
    const pay = output({
      address: baseAddress(2),
      value: { lovelace: ada(5) },
    });
    expect(
      await mismatch(
        await edited([pay], (body) => {
          body.outputs[0].address = mainnet;
        }),
      ),
    ).toEqual([{ role: "output", address: mainnet, networkId: 1 }]);
    expect(
      await mismatch(
        await edited([pay], (body) => {
          body.collateral = [body.inputs[0]];
          body.collateral_return = {
            address: mainnet,
            amount: { coin: "5000000" },
          };
        }),
      ),
    ).toEqual([{ role: "collateralReturn", address: mainnet, networkId: 1 }]);
    const withdrawn = await edited(
      [pay, withdrawal.pubKey({ rewardAddress: stake, amount: 0n })],
      (body) => {
        body.withdrawals = { [mainnetStake]: "0" };
      },
    );
    expect(await mismatch(withdrawn)).toEqual([
      { role: "withdrawal", address: mainnetStake, networkId: 1 },
    ]);
    const pool = await edited(
      [
        pay,
        certificate.poolRegistration({
          params: {
            operator: keyHashHex(7),
            vrfKeyHash: vrfKeyHashHex(1),
            pledge: "1000000",
            cost: "340000000",
            margin: [1, 100],
            relays: [],
            owners: [keyHashHex(8)],
            rewardAddress: stake,
          },
        }),
      ],
      (body) => {
        body.certs[0].value.pool_params.reward_account = mainnetStake;
      },
    );
    expect(await mismatch(pool)).toEqual([
      { role: "rewardAccount", address: mainnetStake, networkId: 1 },
    ]);
    const proposed = await edited(
      [pay, proposal.info({ rewardAccount: stake, anchor, deposit: 1n })],
      (body) => {
        body.voting_proposals[0].reward_account = mainnetStake;
      },
    );
    expect(await mismatch(proposed)).toEqual([
      { role: "rewardAccount", address: mainnetStake, networkId: 1 },
    ]);
    const treasury = await edited(
      [
        pay,
        proposal.treasuryWithdrawals({
          rewardAccount: stake,
          anchor,
          deposit: 1n,
          withdrawals: { [stake]: 5n },
        }),
      ],
      (body) => {
        body.voting_proposals[0].governance_action.value.withdrawals = {
          [mainnetStake]: "5",
        };
      },
    );
    expect(await mismatch(treasury)).toEqual([
      { role: "rewardAccount", address: mainnetStake, networkId: 1 },
    ]);
  });

  it("is NETWORK_MISMATCH for a known UTxO, whether the transaction names it or not, and for a UTxO read", async () => {
    const [a, b] = [hashOf(), hashOf()];
    const mainnet = onMainnet(baseAddress(1));
    const given = tx(bodyOf({ inputs: [[a, 0]] }));
    for (const knownUtxos of [
      [utxoOf([a, 0], { address: mainnet })],
      [utxoOf([a, 0]), utxoOf([b, 0], { address: mainnet })],
    ]) {
      const error = await caught(() =>
        offline().fromCbor(given, { knownUtxos }),
      );
      expectBuildError(error, "NETWORK_MISMATCH");
      expect(error.details.found).toEqual([
        { role: "utxo", address: mainnet, networkId: 1 },
      ]);
    }
    const { provider } = fakeProvider({
      [a]: [utxoOf([a, 0], { address: mainnet })],
    });
    const error = await caught(() => online(provider).fromCbor(given));
    expectBuildError(error, "NETWORK_MISMATCH");
    expect(error.details.found).toEqual([
      { role: "utxo", address: mainnet, networkId: 1 },
    ]);
  });

  it("is NETWORK_MISMATCH with the role body for a body that states another network id, and takes one that states the builder's", async () => {
    const a = hashOf();
    const knownUtxos = [utxoOf([a, 0])];
    const stating = (id: number) =>
      tx(bodyOf({ inputs: [[a, 0]], extra: [[uint(15), uint(id)]] }));
    const error = await caught(() =>
      offline().fromCbor(stating(1), { knownUtxos }),
    );
    expectBuildError(error, "NETWORK_MISMATCH");
    expect(error.details.found).toEqual([{ role: "body", networkId: 1 }]);
    expect(error.message).toContain(
      "and the transaction is of another network: its body states network id 1",
    );
    const built = await offline().fromCbor(stating(0), { knownUtxos });
    expect(built.network).toEqual({ name: "preprod", networkId: 0 });
  });
});

describe("TxBuilder.fromCbor › what it refuses, and what it does not judge", () => {
  const expectRefusedTx = (error: any, given: unknown) => {
    expectBuildError(error, "INVALID_OPTION");
    expect(error.details).toEqual({
      option: "tx",
      value: given === null ? "null" : typeof given,
      allowed: "a transaction in CBOR hex",
    });
    if (typeof given === "string" && given.length >= 16) {
      const text = everything(error);
      expect(text).not.toContain(given);
      expect(text.toLowerCase()).not.toContain(given.toLowerCase());
      // Not even 8 bytes of it
      for (let i = 0; i + 16 <= given.length; i += 2)
        expect(text.toLowerCase()).not.toContain(
          given.slice(i, i + 16).toLowerCase(),
        );
    }
  };

  it("is INVALID_OPTION (tx) with the JavaScript type alone for what is not a transaction, and the text given is in no message, details or cause", async () => {
    const a = hashOf();
    const valid = tx(bodyOf({ inputs: [[a, 0]] }));
    const values: unknown[] = [
      // A private key in hex, and its extended form
      randomBytes(32).toString("hex"),
      randomBytes(64).toString("hex"),
      // A bech32 text
      bech32.encode("ed25519_sk", bech32.toWords(randomBytes(32))),
      "not hex at all",
      42,
      undefined,
      null,
      { tx: valid },
      // A witness set
      map([uint(0), arr(vkeyWitness(key, a))]),
      // A transaction hash
      txHashOf(bodyOf({ inputs: [[a, 0]] })),
      // Bytes after a transaction
      `${valid}00`,
      // A transaction cut short
      valid.slice(0, -2),
    ];
    for (const given of values) {
      const error = await caught(() =>
        offline().fromCbor(given as string, {
          knownUtxos: [utxoOf([a, 0])],
        }),
      );
      expectRefusedTx(error, given);
    }
  });

  it("is INVALID_OPTION (tx) for a transaction of indefinite length and for a key witness written as an array of indefinite length", async () => {
    const a = hashOf();
    const body = bodyOf({ inputs: [[a, 0]] });
    const indefinite = arrIndef(body, map(), "f5", "f6");
    const witness = arrIndef(bytes(key.vkey), bytes(key.sign(txHashOf(body))));
    const indefiniteWitness = tx(body, map([uint(0), arr(witness)]));
    for (const given of [indefinite, indefiniteWitness])
      expectRefusedTx(
        await caught(() =>
          offline().fromCbor(given, { knownUtxos: [utxoOf([a, 0])] }),
        ),
        given,
      );
  });

  it("is INVALID_OPTION (tx) for a transaction whose validity flag is false", async () => {
    const a = hashOf();
    const given = tx(bodyOf({ inputs: [[a, 0]] }), map(), { valid: "f4" });
    const error = await caught(() =>
      offline().fromCbor(given, { knownUtxos: [utxoOf([a, 0])] }),
    );
    expectRefusedTx(error, given);
    expect(error.message).toContain("validity flag is false");
    // The same transaction marked valid is taken
    await offline().fromCbor(tx(bodyOf({ inputs: [[a, 0]] })), {
      knownUtxos: [utxoOf([a, 0])],
    });
  });

  it("is INVALID_OPTION (tx) with a message of its own for a transaction that proposes a parameter change", async () => {
    const utxo: Utxo = {
      txHash: hashOf(),
      outputIndex: 0,
      address: baseAddress(1),
      value: { lovelace: ada(1000) },
    };
    const built = await offline().build(
      [
        proposal.parameterChange({
          rewardAccount: keyHashToRewardAddress(keyHashHex(57), 0),
          anchor,
          updates: { max_tx_size: 16384 },
          deposit: 1n,
        }),
      ],
      { payer: { changeAddress: baseAddress(1), utxos: [utxo] } },
    );
    const error = await caught(() =>
      offline().fromCbor(built.tx, { knownUtxos: [utxo] }),
    );
    expectRefusedTx(error, built.tx);
    expect(error.message).toBe(
      "the transaction proposes a protocol parameter change, which this library does not read from CBOR; the transaction itself may be valid",
    );
    expect(error.cause).toBeUndefined();
  });

  it("is INVALID_OPTION (options) with the JavaScript type alone for options that are a string, null, a list or a signer, and for a member it does not know, whose value is not quoted", async () => {
    const a = hashOf();
    const given = tx(bodyOf({ inputs: [[a, 0]] }));
    const secret = randomBytes(32).toString("hex");
    // Each with whether it is a signer
    const values: [unknown, string, boolean][] = [
      [secret, "string", false],
      [null, "null", false],
      [[utxoOf([a, 0])], "object", false],
      [keySigner(secret), "object", true],
      [keysSigner("callback", key).signer, "function", true],
      [{ knownUtxos: [utxoOf([a, 0])], knownUtxo: secret }, "object", false],
      [{ signers: secret }, "object", false],
    ];
    for (const [options, value, signer] of values) {
      const error = await caught(() =>
        offline().fromCbor(given, options as never),
      );
      expectBuildError(error, "INVALID_OPTION");
      expect(error.details).toEqual({
        option: "options",
        value,
        allowed: "an object { knownUtxos? }",
      });
      expect(everything(error)).not.toContain(secret);
      // A signer given in place of the options is told where a signer goes
      expect(
        error.message.includes(
          "; a signer is given to sign() of the object it returns",
        ),
      ).toBe(signer);
    }
  });

  it("is INVALID_OPTION (knownUtxos) for what is not a list of UTxOs", async () => {
    const a = hashOf();
    const given = tx(bodyOf({ inputs: [[a, 0]] }));
    for (const knownUtxos of [
      "abc",
      42,
      { txHash: a },
      [42],
      [{ txHash: a }],
    ]) {
      const error = await caught(() =>
        offline().fromCbor(given, { knownUtxos: knownUtxos as never }),
      );
      expectBuildError(error, "INVALID_OPTION");
      expect(error.details.option).toBe("knownUtxos");
    }
  });

  it("makes no request before it refuses a transaction of another network or one that holds a signature of another body", async () => {
    const a = hashOf();
    const { provider, calls } = fakeProvider({ [a]: [utxoOf([a, 0])] });
    const builder = online(provider);
    const mainnet = `61${key.keyHash}`;
    const other = await caught(() =>
      builder.fromCbor(tx(bodyOf({ inputs: [[a, 0]], to: [mainnet] }))),
    );
    expectBuildError(other, "NETWORK_MISMATCH");
    const stating = await caught(() =>
      builder.fromCbor(
        tx(bodyOf({ inputs: [[a, 0]], extra: [[uint(15), uint(1)]] })),
      ),
    );
    expectBuildError(stating, "NETWORK_MISMATCH");
    const body = bodyOf({ inputs: [[a, 0]] });
    const elsewhere = txHashOf(bodyOf({ inputs: [[a, 1]] }));
    const signer = testKey();
    const stale = await caught(() =>
      builder.fromCbor(
        tx(body, map([uint(0), arr(vkeyWitness(signer, elsewhere))])),
      ),
    );
    expect(stale).toBeInstanceOf(TxPlanError);
    expect(TxError.is(stale, "INVALID_WITNESS")).toBe(true);
    expect(stale.details).toEqual({
      reason: "wrongBody",
      argument: 0,
      keyHash: signer.keyHash,
    });
    expect(calls).toEqual([]);
    // The same body signed rightly is read
    await builder.fromCbor(
      tx(body, map([uint(0), arr(vkeyWitness(signer, txHashOf(body)))])),
    );
    expect(calls).toEqual(["fetchUTxOs"]);
  });

  it("makes the object of a transaction the ledger refuses: a fee of 1 lovelace, outputs above the inputs, a validity interval that has ended", async () => {
    const a = hashOf();
    const tiny = await offline().fromCbor(
      tx(bodyOf({ inputs: [[a, 0]], fee: 1 })),
      { knownUtxos: [utxoOf([a, 0])] },
    );
    expect(tiny.fee).toBe(1n);
    // 3 ada out of 1 ada in
    const above = await offline().fromCbor(tx(bodyOf({ inputs: [[a, 0]] })), {
      knownUtxos: [utxoOf([a, 0], { value: { lovelace: ada(1) } })],
    });
    expect(above.outputs[0]!.value.lovelace).toBe(ada(3));
    expect(above.inputs[0]!.value.lovelace).toBe(ada(1));
    const ended = await offline().fromCbor(
      tx(bodyOf({ inputs: [[a, 0]], extra: [[uint(3), uint(1)]] })),
      { knownUtxos: [utxoOf([a, 0])] },
    );
    expect(ended.validity?.invalidHereafter).toBe(1);
    expect(ended.warnings).toEqual([]);
  });

  it("does not read the parts the builder holds from add", async () => {
    const a = hashOf();
    const elsewhere = hashOf();
    const builder = offline().add(
      output({ address: baseAddress(2), value: { lovelace: ada(5) } }),
      // A part given by reference only: a build without a provider could not read it
      referenceInput({ utxo: { txHash: elsewhere, outputIndex: 0 } }),
      spend.pubKey({ utxo: { txHash: elsewhere, outputIndex: 1 } }),
    );
    const built = await builder.fromCbor(tx(bodyOf({ inputs: [[a, 0]] })), {
      knownUtxos: [utxoOf([a, 0])],
    });
    expect(built.parts).toEqual([]);
    expect(built.outputs.map((o) => o.address)).toEqual([key.address]);
    expect(built.inputs).toEqual([utxoOf([a, 0])]);
    expect(built.referenceInputs).toEqual([]);
  });
});
