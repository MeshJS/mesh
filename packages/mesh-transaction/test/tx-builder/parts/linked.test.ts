import {
  DEFAULT_PROTOCOL_PARAMETERS,
  mConStr0,
  NativeScript,
  resolveNativeScriptAddress,
} from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import type {
  CollateralPart,
  Linked,
  LinkedPart,
  PartsInput,
  ReferenceInputPart,
  SpendPart,
  StepChange,
  StepOutput,
  TxPart,
  Utxo,
} from "../../../src/tx-builder";
import {
  assembleTxPrototype,
  collateral,
  collateralReturn,
  output,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxPartError,
  unresolved,
} from "../../../src/tx-builder";
import {
  decodeParts,
  encodeParts,
  UnreadContent,
} from "../../../src/tx-builder/plan/json";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
} from "../../test-util";

const keyAddress = baseAddress(1);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const plutusAddress = resolvePlutusScriptAddress(plutusScript, 0);
const nativeScript: NativeScript = { type: "all", scripts: [] };
const nativeAddress = resolveNativeScriptAddress(nativeScript, 0);
const redeemer = { data: mConStr0([]) };

const vault: StepOutput = { step: "lock", output: "vault" };
const second: StepOutput = { step: "swap", output: 1 };
const change: StepChange = { step: "lock", change: true };

/** A UTxO given in full, at an address */
const at = (address: string): Utxo => ({
  txHash: "ab".repeat(32),
  outputIndex: 0,
  address,
  value: { lovelace: 5_000_000n },
});

const partError = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    return error as TxPartError;
  }
  throw new Error("expected a TxPartError");
};

/** Whether a value and everything in it is frozen */
const deepFrozen = (value: unknown): boolean =>
  typeof value !== "object" ||
  value === null ||
  (Object.isFrozen(value) &&
    Object.values(value as object).every((member) => deepFrozen(member)));

/** Every linked part the builders make, one of each form */
const everyForm = (): LinkedPart[] => [
  spend.pubKey({ utxo: vault, label: "by label" }),
  spend.pubKey({ utxo: second }),
  spend.pubKey({ utxo: change, label: "all the change" }),
  spend.native({ utxo: vault, script: nativeScript }),
  spend.plutus({ utxo: vault, script: plutusScript, redeemer }),
  spend.plutus({
    utxo: second,
    script: plutusScript,
    redeemer: { ...redeemer, exUnits: { mem: 1, steps: 2 } },
    datum: "inline",
    label: "unlock",
  }),
  referenceInput({ utxo: vault }),
  collateral({ utxo: second, label: "collateral" }),
];

describe("parts linked to an earlier step", () => {
  it("are plain frozen data holding the link in place of the input", () => {
    const parts = everyForm();
    expect(parts[0]).toEqual({
      kind: "spend",
      link: { step: "lock", output: "vault" },
      witness: { type: "key" },
      label: "by label",
    });
    expect(parts[1]).toEqual({
      kind: "spend",
      link: { step: "swap", output: 1 },
      witness: { type: "key" },
    });
    expect(parts[2]).toEqual({
      kind: "spend",
      link: { step: "lock", change: true },
      witness: { type: "key" },
      label: "all the change",
    });
    expect(parts[3]).toMatchObject({
      kind: "spend",
      link: vault,
      witness: { type: "native", script: { type: "attached" } },
    });
    expect(parts[4]).toMatchObject({
      kind: "spend",
      link: vault,
      witness: { type: "plutus", script: { type: "attached", version: "V3" } },
    });
    expect(parts[6]).toEqual({ kind: "referenceInput", link: vault });
    expect(parts[7]).toEqual({
      kind: "collateral",
      link: second,
      label: "collateral",
    });
    for (const part of parts) {
      expect(part).not.toHaveProperty("input");
      expect(part).not.toHaveProperty("utxo");
      expect(deepFrozen(part)).toBe(true);
      // Nothing but data: the same after a trip through JSON text
      expect(JSON.parse(JSON.stringify(encodeParts([part])))).toEqual(
        encodeParts([part]),
      );
    }
  });

  it("keeps a copy of the link, which a later change to the given object does not reach", () => {
    const given = { step: "lock", output: "vault" as string | number };
    const part = spend.pubKey({ utxo: given });
    given.output = 3;
    expect(part.link).toEqual({ step: "lock", output: "vault" });
    expect(part.link).not.toBe(given);
  });

  it("takes all the change of a step in spend.pubKey only", () => {
    const refusals = [
      () => spend.native({ utxo: change as never, script: nativeScript }),
      () =>
        spend.plutus({
          utxo: change as never,
          script: plutusScript,
          redeemer,
        }),
      () => referenceInput({ utxo: change as never }),
      () => collateral({ utxo: change as never }),
    ];
    for (const refused of refusals) {
      const error = partError(refused);
      expect(error.code).toBe("INVALID_OUT_REF");
      expect(error.message).toContain("spend.pubKey only");
    }
  });

  it.each([
    ["an empty step", { step: "", output: "vault" }],
    ["a step that is not a text", { step: 1, output: "vault" }],
    ["neither output nor change", { step: "lock" }],
    ["both output and change", { step: "lock", output: 0, change: true }],
    ["change that is not true", { step: "lock", change: false }],
    ["a negative position", { step: "lock", output: -1 }],
    ["a position that is not whole", { step: "lock", output: 1.5 }],
    ["a position past the last output", { step: "lock", output: 0x10000 }],
    ["an output that is null", { step: "lock", output: null }],
    ["a member of a UTxO beside it", { step: "lock", output: 0, txHash: "ab" }],
  ])("refuses a link with %s: INVALID_OUT_REF", (_, link) => {
    const error = partError(() => spend.pubKey({ utxo: link as never }));
    expect(error.code).toBe("INVALID_OUT_REF");
  });

  it("leaves to the build of the step the checks that read the output, and runs the others", () => {
    // The lock is checked for an output given in full, and not for a link
    expect(
      partError(() => spend.pubKey({ utxo: at(plutusAddress) })).code,
    ).toBe("WITNESS_MISMATCH");
    expect(() => spend.pubKey({ utxo: vault })).not.toThrow();
    expect(partError(() => collateral({ utxo: at(nativeAddress) })).code).toBe(
      "WITNESS_MISMATCH",
    );
    expect(() => collateral({ utxo: vault })).not.toThrow();
    expect(
      partError(() =>
        spend.native({ utxo: at(keyAddress), script: nativeScript }),
      ).code,
    ).toBe("WITNESS_MISMATCH");
    expect(() =>
      spend.native({ utxo: vault, script: nativeScript }),
    ).not.toThrow();

    // The datum: worked out from the output, so absent until the link is filled in; a datum
    // named is checked against the output then
    expect(
      partError(() =>
        spend.plutus({
          utxo: at(plutusAddress),
          script: plutusScript,
          redeemer,
          datum: "inline",
        }),
      ).code,
    ).toBe("DATUM_MISMATCH");
    const linked = spend.plutus({
      utxo: vault,
      script: plutusScript,
      redeemer,
      datum: "inline",
    });
    expect(linked.witness).toMatchObject({ datum: { type: "inline" } });
    const open = spend.plutus({ utxo: vault, script: plutusScript, redeemer });
    expect(open.witness).not.toHaveProperty("datum");

    // The script hash of a reference script: taken from the lock of an output in full only
    const byReference = spend.plutus({
      utxo: vault,
      script: {
        reference: { txHash: "cd".repeat(32), outputIndex: 0 },
        version: "V3",
      },
      redeemer,
    });
    expect(byReference.witness).toMatchObject({
      script: { type: "reference" },
    });
    expect(
      (byReference.witness as { script: { scriptHash?: string } }).script
        .scriptHash,
    ).toBeUndefined();
    const inFull = spend.plutus({
      utxo: {
        ...at(plutusAddress),
        datum: { type: "inline", data: { type: "CBOR", content: "d87980" } },
      },
      script: {
        reference: { txHash: "cd".repeat(32), outputIndex: 0 },
        version: "V3",
      },
      redeemer,
    });
    expect(
      (inFull.witness as { script: { scriptHash?: string } }).script.scriptHash,
    ).toBe(alwaysSucceedHash);

    // What does not read the output is checked at once
    expect(
      partError(() =>
        spend.plutus({
          utxo: vault,
          script: { code: alwaysSucceedCbor, version: "V2" },
          redeemer,
          datum: "none",
        }),
      ).code,
    ).toBe("DATUM_MISMATCH");
    expect(
      partError(() =>
        spend.plutus({
          utxo: vault,
          script: { code: "zz", version: "V3" },
          redeemer,
        }),
      ).code,
    ).toBe("INVALID_SCRIPT");
    expect(
      partError(() => spend.pubKey({ utxo: vault, label: 1 as never })).code,
    ).toBe("INVALID_DATA");
  });

  it("has the gap link, and the gaps of its witness that do not read the output", () => {
    const [byLabel, , all, native, plutus, withUnits, read, put] = everyForm();
    expect(unresolved(byLabel!)).toEqual([{ type: "link", link: vault }]);
    expect(unresolved(all!)).toEqual([{ type: "link", link: change }]);
    expect(unresolved(native!)).toEqual([{ type: "link", link: vault }]);
    expect(unresolved(plutus!)).toEqual([
      { type: "link", link: vault },
      { type: "exUnits" },
    ]);
    expect(unresolved(withUnits!)).toEqual([{ type: "link", link: second }]);
    expect(unresolved(read!)).toEqual([{ type: "link", link: vault }]);
    expect(unresolved(put!)).toEqual([{ type: "link", link: second }]);
    const byReference = spend.native({
      utxo: vault,
      script: { reference: { txHash: "cd".repeat(32), outputIndex: 0 } },
    });
    expect(unresolved(byReference)).toEqual([
      { type: "link", link: vault },
      {
        type: "scriptReference",
        input: { transaction_id: "cd".repeat(32), index: 0 },
      },
    ]);
  });
});

describe("a part linked to an earlier step outside a plan", () => {
  const pay = output({
    address: keyAddress,
    value: { lovelace: 2_000_000n },
  });
  const linked = spend.pubKey({ utxo: vault, label: "unlock" });
  const read = referenceInput({ utxo: second });
  const unresolvedDetails = [
    {
      kind: "spend",
      label: "unlock",
      gaps: [{ type: "link", link: vault }],
    },
    { kind: "referenceInput", gaps: [{ type: "link", link: second }] },
  ];

  /** A builder whose provider counts the requests it is asked */
  const counting = () => {
    const asked: string[] = [];
    const provider = new Proxy(
      {},
      {
        get: (_, name) =>
          typeof name === "string" && name !== "then"
            ? (...args: unknown[]) => {
                asked.push(name);
                void args;
                throw new Error("no request is expected");
              }
            : undefined,
      },
    );
    const builder = new TxBuilder({
      network: "preprod",
      params: { ...DEFAULT_PROTOCOL_PARAMETERS },
      provider: provider as never,
    });
    return { builder, asked };
  };

  const refusal = async (run: () => unknown) => {
    let caught: unknown;
    try {
      await run();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TxBuildError);
    const error = caught as TxBuildError<"UNRESOLVED">;
    expect(error.code).toBe("UNRESOLVED");
    expect(error.message).toContain(
      "a part linked to an earlier step is filled in only by the plan that builds the step",
    );
    return error;
  };

  it("is UNRESOLVED from build, with the gap link of each linked part, before any request", async () => {
    const { builder, asked } = counting();
    const error = await refusal(() =>
      builder.build([pay, [linked, false, [read]]] as unknown as PartsInput, {
        payer: { changeAddress: keyAddress, utxos: [] },
      }),
    );
    expect(error.details).toEqual(unresolvedDetails);
    expect(asked).toEqual([]);
    // One part alone, not in a list
    const alone = await refusal(() =>
      builder.build(linked as unknown as PartsInput, {
        payer: { changeAddress: keyAddress, utxos: [] },
      }),
    );
    expect(alone.details).toEqual([unresolvedDetails[0]]);
  });

  it("is UNRESOLVED from add and from a plan of the builder", async () => {
    const { builder } = counting();
    await refusal(() => builder.add(linked as never));
    await refusal(() =>
      builder.plan([linked] as never, {
        payer: { changeAddress: keyAddress, utxos: [] },
      }),
    );
  });

  it("is UNRESOLVED from assembleTxPrototype, listed with the other incomplete parts", async () => {
    const error = await refusal(() =>
      assembleTxPrototype(
        [
          pay,
          collateralReturn({ address: keyAddress }),
          linked,
          read,
        ] as unknown as TxPart[],
        { fee: 0n },
      ),
    );
    expect(error.details).toEqual([
      { kind: "collateralReturn", gaps: [{ type: "totalCollateral" }] },
      ...unresolvedDetails,
    ]);
  });

  it("is refused also when it holds an input beside the link", async () => {
    const both = {
      ...linked,
      input: { transaction_id: "ab".repeat(32), index: 0 },
    };
    const { builder } = counting();
    const error = await refusal(() =>
      builder.build([both] as unknown as PartsInput, {
        payer: { changeAddress: keyAddress, utxos: [] },
      }),
    );
    expect(error.details).toEqual([unresolvedDetails[0]]);
  });
});

describe("the encoding of a part linked to an earlier step", () => {
  const encoded = () =>
    JSON.parse(JSON.stringify(encodeParts(everyForm()))) as Record<
      string,
      unknown
    >[];

  it("is read back as it was, with links, and frozen", () => {
    const json = encoded();
    expect(json[0]).toEqual({
      kind: "spend",
      link: { step: "lock", output: "vault" },
      witness: { type: "key" },
      label: "by label",
    });
    const read = decodeParts(json, { links: true });
    expect(read).toEqual(everyForm());
    for (const part of read) expect(deepFrozen(part)).toBe(true);
    // Beside the parts that are not linked
    const plain = spend.pubKey({ utxo: at(keyAddress) });
    expect(
      decodeParts(JSON.parse(JSON.stringify(encodeParts([plain, ...read]))), {
        links: true,
      }),
    ).toEqual([plain, ...everyForm()]);
  });

  it("is not read where links are not: link is a member this library does not read there", () => {
    expect(() => decodeParts(encoded())).toThrow(UnreadContent);
    expect(() => decodeParts(encoded())).toThrow(
      /parts\[0\]\.link, a member this library does not know/,
    );
  });

  it.each([
    [
      "a link beside an input",
      {
        kind: "spend",
        link: vault,
        input: { transaction_id: "ab".repeat(32), index: 0 },
        witness: { type: "key" },
      },
    ],
    [
      "a link beside a UTxO",
      { kind: "referenceInput", link: vault, utxo: at(keyAddress) },
    ],
    [
      "all the change in a reference input",
      { kind: "referenceInput", link: change },
    ],
    ["all the change in collateral", { kind: "collateral", link: change }],
    [
      "all the change in a spend by script",
      {
        kind: "spend",
        link: change,
        witness: encoded()[3]!.witness,
      },
    ],
    [
      "a link in a part of another kind",
      {
        ...(encodeParts([
          output({ address: keyAddress, value: { lovelace: 2_000_000n } }),
        ])[0] as object),
        link: vault,
      },
    ],
    ["a spend without a witness", { kind: "spend", link: vault }],
    ["an empty step", { kind: "collateral", link: { step: "", output: 0 } }],
    [
      "neither output nor change",
      { kind: "collateral", link: { step: "lock" } },
    ],
    [
      "both output and change",
      {
        kind: "spend",
        link: { step: "lock", output: 0, change: true },
        witness: { type: "key" },
      },
    ],
    [
      "change that is not true",
      {
        kind: "spend",
        link: { step: "lock", change: false },
        witness: { type: "key" },
      },
    ],
    [
      "a negative position",
      { kind: "collateral", link: { step: "lock", output: -1 } },
    ],
    [
      "a position past the last output",
      { kind: "collateral", link: { step: "lock", output: 0x10000 } },
    ],
    [
      "a member of the link it does not know",
      { kind: "collateral", link: { step: "lock", output: 0, txHash: "ab" } },
    ],
  ])("refuses %s", (_, part) => {
    expect(() => decodeParts([part], { links: true })).toThrow(UnreadContent);
  });
});

describe("the types of a part linked to an earlier step", () => {
  it("take a link only where the overloads say", () => {
    // Only compiled, never run: the compiler checks the lines below
    const typed = (
      builder: TxBuilder,
      ref: { txHash: string; outputIndex: number },
    ) => {
      const key: Linked<SpendPart> = spend.pubKey({ utxo: vault });
      const all: Linked<SpendPart> = spend.pubKey({ utxo: change });
      const byRef: SpendPart = spend.pubKey({ utxo: ref });
      const native: Linked<SpendPart> = spend.native({
        utxo: vault,
        script: nativeScript,
      });
      const plutus: Linked<SpendPart> = spend.plutus({
        utxo: vault,
        script: plutusScript,
        redeemer,
      });
      const read: Linked<ReferenceInputPart> = referenceInput({ utxo: vault });
      const put: Linked<CollateralPart> = collateral({ utxo: vault });
      const any: LinkedPart[] = [key, all, native, plutus, read, put];

      // @ts-expect-error all the change goes to spend.pubKey only
      spend.native({ utxo: change, script: nativeScript });
      // @ts-expect-error all the change goes to spend.pubKey only
      spend.plutus({ utxo: change, script: plutusScript, redeemer });
      // @ts-expect-error all the change goes to spend.pubKey only
      referenceInput({ utxo: change });
      // @ts-expect-error all the change goes to spend.pubKey only
      collateral({ utxo: change });
      // @ts-expect-error a linked part is no TxPart
      const part: TxPart = key;
      // @ts-expect-error build takes no linked part
      void builder.build(key);
      // @ts-expect-error build takes no linked part in a list
      void builder.build([byRef, key]);
      // @ts-expect-error add takes no linked part
      builder.add(read);
      // @ts-expect-error assembleTxPrototype takes no linked part
      assembleTxPrototype([put], { fee: 0n });
      // @ts-expect-error a link names a step
      spend.pubKey({ utxo: { output: "vault" } });
      return [any, part, byRef];
    };
    expect(typeof typed).toBe("function");
  });
});
