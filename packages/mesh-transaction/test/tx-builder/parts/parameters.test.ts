import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/core";
import { keyHashToRewardAddress } from "@meshsdk/core-cst";

import {
  auxiliaryScript,
  certificate,
  collateral,
  CollateralParams,
  CollateralPart,
  collateralReturn,
  donation,
  guard,
  message,
  metadata,
  mint,
  networkId,
  output,
  proposal,
  referenceInput,
  ReferenceInputParams,
  ReferenceInputPart,
  spend,
  treasuryValue,
  TxBuilder,
  TxBuildError,
  TxError,
  TxPart,
  TxPartError,
  Utxo,
  validity,
  vote,
  withdrawal,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress, keyHashHex } from "../../test-util";
import { ref } from "../utxo-util";

const address = baseAddress(1);
const stake = keyHashToRewardAddress(keyHashHex(5), 0);
const txHash = "ab".repeat(32);
const plutus = { code: alwaysSucceedCbor, version: "V3" as const };
const utxo: Utxo = {
  txHash,
  outputIndex: 0,
  address,
  value: { lovelace: 5_000_000n },
};

/** `referenceInput` and `collateral` as they take a UTxO, never linked to a step of a plan */
const read: (params: ReferenceInputParams) => ReferenceInputPart =
  referenceInput;
const putUp: (params: CollateralParams) => CollateralPart = collateral;

/** Every part builder, by name */
const builders: [string, (params: never) => TxPart][] = [
  ["output", output],
  ["referenceInput", read],
  ["collateral", putUp],
  ["collateralReturn", collateralReturn],
  ["validity", validity],
  ["metadata", metadata],
  ["message", message],
  ["auxiliaryScript", auxiliaryScript],
  ["donation", donation],
  ["treasuryValue", treasuryValue],
  ["networkId", networkId],
  ["vote", vote],
  ...(
    [
      ["spend", spend],
      ["mint", mint],
      ["withdrawal", withdrawal],
      ["guard", guard],
      ["certificate", certificate],
      ["proposal", proposal],
    ] as const
  ).flatMap(([group, members]) =>
    Object.entries(members).map(
      ([name, build]): [string, (params: never) => TxPart] => [
        `${group}.${name}`,
        build as (params: never) => TxPart,
      ],
    ),
  ),
];

/** The kind a part builder makes: the group, or the builder's own name */
const kindOf = (name: string) => {
  const kind = name.split(".")[0]!;
  return kind === "message" ? "metadata" : kind;
};

const partError = (build: () => unknown): TxPartError => {
  try {
    build();
  } catch (error) {
    expect(TxError.is(error)).toBe(true);
    expect(error).toBeInstanceOf(TxPartError);
    return error as TxPartError;
  }
  throw new Error("expected a TxPartError");
};

describe("the parameters of the part builders", () => {
  it.each(builders)(
    "%s refuses parameters that are not an object",
    (name, build) => {
      for (const params of [undefined, null, 5, "x"]) {
        const error = partError(() => build(params as never));
        expect(error.code).toBe("INVALID_DATA");
        expect(error.part).toBe(kindOf(name));
      }
    },
  );

  it.each(builders)("%s refuses a label that is not a string", (_, build) => {
    const error = partError(() => build({ label: 5 } as never));
    expect(error.code).toBe("INVALID_DATA");
    expect(error.message).toContain("invalid label 5");
  });

  it.each(builders)(
    "%s gives a TxPartError, never a raw error, for missing members",
    (name, build) => {
      expect(partError(() => build({} as never)).part).toBe(kindOf(name));
    },
  );

  it("refuses members of another shape with the member's code", () => {
    const cases: [() => unknown, string][] = [
      [() => output({ address, value: null as never }), "INVALID_VALUE"],
      [() => output({ address, value: [null] as never }), "INVALID_VALUE"],
      [
        () => output({ address, value: { lovelace: 1n }, datum: 5 as never }),
        "INVALID_DATA",
      ],
      [() => spend.pubKey({ utxo: null as never }), "INVALID_OUT_REF"],
      [
        () =>
          spend.plutus({
            utxo,
            script: null as never,
            redeemer: { data: 1 },
          }),
        "INVALID_SCRIPT",
      ],
      [
        () =>
          spend.plutus({
            utxo: ref(utxo),
            script: plutus,
            redeemer: null as never,
          }),
        "INVALID_DATA",
      ],
      [
        () =>
          spend.plutus({
            utxo: ref(utxo),
            script: plutus,
            redeemer: { data: 1 },
            datum: null as never,
          }),
        "INVALID_DATA",
      ],
      [
        () =>
          spend.plutus({
            utxo: ref(utxo),
            script: plutus,
            redeemer: { data: 1, exUnits: 5 as never },
          }),
        "INVALID_DATA",
      ],
      [
        () =>
          mint.native({
            script: { type: "nope" } as never,
            assets: { "6d": 1n },
          }),
        "INVALID_SCRIPT",
      ],
      [
        () =>
          mint.plutus({
            script: plutus,
            assets: 5 as never,
            redeemer: { data: 1 },
          }),
        "INVALID_VALUE",
      ],
      [() => auxiliaryScript({ script: null as never }), "INVALID_SCRIPT"],
      [() => vote({ voter: null as never, votes: [] }), "INVALID_DATA"],
      [
        () =>
          vote({
            voter: { drep: { type: "KEY", value: keyHashHex(1) } },
            votes: [null as never],
          }),
        "INVALID_DATA",
      ],
      [
        () =>
          certificate.stakeDelegation({
            stake: null as never,
            pool: keyHashHex(2),
          }),
        "INVALID_DATA",
      ],
      [
        () => proposal.info({ rewardAccount: stake, anchor: null as never }),
        "INVALID_DATA",
      ],
      [
        () =>
          certificate.poolRegistration({
            params: {
              operator: keyHashHex(3),
              vrfKeyHash: "cd".repeat(32),
              pledge: "0",
              cost: "340000000",
              margin: [0, 1],
              owners: [],
              rewardAddress: stake,
              relays: [null as never],
            },
          } as never),
        "INVALID_DATA",
      ],
    ];
    for (const [build, code] of cases) expect(partError(build).code).toBe(code);
  });
});

describe("a part put together by hand", () => {
  const builder = new TxBuilder({
    network: "preprod",
    params: { ...DEFAULT_PROTOCOL_PARAMETERS },
  });
  const payer = { changeAddress: address, utxos: [utxo] };

  it.each([
    [{ kind: "output" }, "output"],
    [{ kind: "spend", witness: { type: "key" } }, "input"],
    [
      { kind: "mint", policyId: keyHashHex(1), witness: { type: "key" } },
      "assets",
    ],
    [{ kind: "output", output: null }, "output"],
  ])(
    "is refused as INVALID_OPTION parts when it lacks a member: %j",
    async (part, member) => {
      for (const call of [
        () => builder.build([part as never], { payer }),
        async () => builder.add(part as never),
      ]) {
        const error = await call().then(
          () => {
            throw new Error("expected INVALID_OPTION");
          },
          (thrown: unknown) => thrown,
        );
        expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
        const invalid = error as TxBuildError<"INVALID_OPTION">;
        expect(invalid.details.option).toBe("parts");
        expect(invalid.details.value).toBe("object");
        expect(invalid.message).toContain(`without ${member}`);
      }
    },
  );

  it("is taken as it is when it has every member, as a copy of a made part", async () => {
    const made = output({ address, value: { lovelace: 2_000_000n } });
    const copy = JSON.parse(JSON.stringify(made)) as TxPart;
    const built = await builder.build([copy], { payer });
    expect(built.prototype.body.outputs[0]).toEqual(made.output);
  });
});
