import {
  applyCborEncoding,
  mConStr0,
  PlutusScript,
  resolveScriptHash,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
} from "@meshsdk/core-cst";

import {
  auxiliaryScript,
  certificate,
  mint,
  output,
  proposal,
  spend,
  TxPartError,
  vote,
  withdrawal,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  rewardAddress,
} from "../../test-util";

// One program in each form `code` may take
const double = alwaysSucceedCbor;
const single = double.slice(4);
const flat = single.slice(4);
const triple = applyCborEncoding(double);
const forms = { flat, single, double };

// A program of version 1.0.0, the version of Plutus V1 and V2 scripts
const v2Double = "4e4d01000033222220051200120011";
const v2Forms = {
  flat: v2Double.slice(4),
  single: v2Double.slice(2),
  double: v2Double,
};

const redeemer = { data: mConStr0([]) };
const anchor = { url: "https://example.com/r.json", dataHash: "cd".repeat(32) };
const action = { txHash: "a".repeat(64), index: 0 };
const scriptAddress = resolvePlutusScriptAddress(
  { code: double, version: "V3" },
  0,
);
const scriptUtxo: UTxO = {
  input: { txHash: "a".repeat(64), outputIndex: 0 },
  output: {
    address: scriptAddress,
    amount: [{ unit: "lovelace", quantity: "5000000" }],
  },
};
const plutusStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);

const v3 = (code: string): PlutusScript => ({ code, version: "V3" });

const expectScriptError = (
  build: () => unknown,
  part: string,
  label: string,
  message: RegExp,
) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    expect(error).toMatchObject({ code: "INVALID_SCRIPT", part, label });
    expect((error as Error).message).toMatch(message);
    return;
  }
  throw new Error("expected an INVALID_SCRIPT error");
};

describe("Plutus script code", () => {
  const partsOf = (code: string) => ({
    mint: mint.plutus({
      script: v3(code),
      redeemer,
      assets: { "01": 1n },
    }),
    spend: spend.plutus({ utxo: scriptUtxo, script: v3(code), redeemer }),
    withdrawal: withdrawal.plutus({
      rewardAddress: plutusStake,
      amount: 0n,
      script: v3(code),
      redeemer,
    }),
  });

  it("gives one part, with the blueprint's hash, for the flat program and one or two wrappings", () => {
    const expected = partsOf(double);
    for (const code of Object.values(forms))
      expect(partsOf(code)).toEqual(expected);

    expect(expected.mint.policyId).toBe(alwaysSucceedHash);
    expect(expected.spend.witness).toMatchObject({
      script: { scriptHash: alwaysSucceedHash, cbor: double },
    });
    expect(expected.withdrawal.witness).toMatchObject({
      script: { scriptHash: alwaysSucceedHash },
    });
  });

  it("takes a deeper wrapping and upper-case hex as well", () => {
    const expected = partsOf(double);

    expect(partsOf(triple)).toEqual(expected);
    expect(partsOf(double.toUpperCase())).toEqual(expected);
  });

  it("gives one witness for certificates, votes and guardrails", () => {
    const witnessed = (code: string) => {
      const witness = { plutus: v3(code), redeemer };
      return [
        certificate.stakeRegistration({
          stake: plutusStake,
          deposit: 2_000_000n,
          witness,
        }),
        vote({
          voter: { committee: { type: "SCRIPT", value: alwaysSucceedHash } },
          votes: [{ action, vote: "no" }],
          witness,
        }),
        proposal.parameterChange({
          rewardAccount: rewardAddress(1),
          anchor,
          updates: { max_tx_size: 16384 },
          guardrail: witness,
        }),
      ];
    };

    const expected = witnessed(double);
    expect(witnessed(single)).toEqual(expected);
    expect(witnessed(flat)).toEqual(expected);
    expect(expected[2]).toMatchObject({
      proposal: {
        governance_action: { value: { policy_hash: alwaysSucceedHash } },
      },
    });
  });

  it("gives one reference script and one auxiliary script", () => {
    const scriptRef = resolveScriptRef(v3(double));
    for (const code of Object.values(forms)) {
      expect(
        output({
          address: baseAddress(1),
          value: { lovelace: 2_000_000n },
          scriptRef: v3(code),
        }).output.script_ref,
      ).toBe(scriptRef);
      expect(auxiliaryScript({ script: v3(code) }).script).toEqual({
        type: "plutus",
        version: "V3",
        cbor: double,
      });
    }
  });

  it("gives one part for the forms of a version 1.0.0 program", () => {
    const partOf = (code: string) =>
      mint.plutus({
        script: { code, version: "V2" },
        redeemer,
        assets: { "01": 1n },
      });

    const expected = partOf(v2Forms.double);
    expect(expected.policyId).toBe(resolveScriptHash(v2Double, "V2"));
    expect(partOf(v2Forms.single)).toEqual(expected);
    expect(partOf(v2Forms.flat)).toEqual(expected);
  });

  describe("that is not a script", () => {
    let consoleError: jest.SpyInstance;
    beforeEach(() => {
      consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => consoleError.mockRestore());

    it.each([
      ["a character that is not hex", "zz"],
      ["a script followed by junk", `${double}zz`],
      ["a script followed by half a byte", `${double}0`],
      ["nothing", ""],
      ["bytes that are not CBOR", "ffff00"],
      ["a CBOR array", "83010203"],
      ["a program of an unknown version", "0102003322"],
    ])("is INVALID_SCRIPT at the call, with nothing logged: %s", (_, code) => {
      expectScriptError(
        () =>
          spend.plutus({
            utxo: scriptUtxo.input,
            script: v3(code),
            redeemer,
            label: "lock",
          }),
        "spend",
        "lock",
        /^spend "lock": invalid Plutus V3 script: /,
      );
      expectScriptError(
        () =>
          output({
            address: baseAddress(1),
            value: { lovelace: 2_000_000n },
            scriptRef: v3(code),
            label: "published",
          }),
        "output",
        "published",
        /^output "published": invalid reference script: /,
      );
      expectScriptError(
        () => auxiliaryScript({ script: v3(code), label: "aux" }),
        "auxiliaryScript",
        "aux",
        /^auxiliaryScript "aux": invalid Plutus V3 script: /,
      );
      expect(consoleError).not.toHaveBeenCalled();
    });

    const holding = (scriptRef: string): UTxO => ({
      input: { txHash: "c".repeat(64), outputIndex: 0 },
      output: { ...scriptUtxo.output, address: baseAddress(1), scriptRef },
    });
    // A version no script has: the code reads, the script cannot be made
    const v4 = (code: string) =>
      ({ code, version: "V4" }) as unknown as PlutusScript;
    it.each([
      [
        "a program of an unknown version",
        () =>
          spend.plutus({
            utxo: scriptUtxo,
            script: v3("0102003322"),
            redeemer,
          }),
      ],
      [
        "a script of an unknown language",
        () => spend.plutus({ utxo: scriptUtxo, script: v4(double), redeemer }),
      ],
      [
        "a reference script of an unknown language",
        () =>
          output({
            address: baseAddress(1),
            value: { lovelace: 2_000_000n },
            scriptRef: v4(double),
          }),
      ],
      [
        "an auxiliary script of an unknown language",
        () => auxiliaryScript({ script: v4(double) }),
      ],
      [
        "a native script that is not CBOR",
        () => mint.native({ script: "ffff00", assets: { "": 1n } }),
      ],
      [
        "a pool id that does not parse",
        () =>
          certificate.stakeDelegation({ stake: plutusStake, pool: "pool1x" }),
        // The message names the pool id, not what the parser said
        false,
      ],
    ])(
      "keeps the error it was rejected for as the cause: %s",
      (_, build, quotesCause = true) => {
        try {
          build();
        } catch (error) {
          expect(error).toBeInstanceOf(TxPartError);
          const { cause, message } = error as TxPartError;
          expect(cause).toBeInstanceOf(Error);
          expect(message.endsWith((cause as Error).message)).toBe(quotesCause);
          return;
        }
        throw new Error("expected a part error");
      },
    );

    it("refuses a reference UTxO whose script is not CBOR: it holds a script this library cannot read", () => {
      // Carried as a script of no known form, it is never decoded again, so there is no cause
      for (const scriptRef of ["ffff00", "820401"]) {
        let error: unknown;
        try {
          spend.plutus({
            utxo: scriptUtxo,
            script: { reference: holding(scriptRef) },
            redeemer,
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(TxPartError);
        expect((error as TxPartError).code).toBe("INVALID_SCRIPT");
        expect((error as TxPartError).message).toContain(
          "holds a reference script this library cannot read",
        );
      }
    });
  });
});
