import {
  mConStr0,
  NativeScript,
  resolveNativeScriptAddress,
  TransactionPrototype,
  UTxO,
} from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  transactionPrototypeFromHex,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";

import {
  collateral,
  collateralReturn,
  output,
  referenceInput,
  spend,
  TxPart,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";

/**
 * Puts parts into a transaction the simplest way that is still valid CBOR, to show their
 * fragments are what `TransactionPrototype` expects. Not an assembler: no balancing, sorting
 * or fee calculation.
 */
const toPrototype = (parts: TxPart[]): TransactionPrototype => {
  const proto: TransactionPrototype = {
    body: { inputs: [], outputs: [], fee: "200000" },
    witness_set: {},
    is_valid: true,
  };
  const { body, witness_set: ws } = proto;
  for (const part of parts) {
    switch (part.kind) {
      case "spend": {
        body.inputs.push(part.input);
        const { witness } = part;
        if (witness.type === "native") {
          if (witness.script.type === "attached")
            (ws.native_scripts ??= []).push(witness.script.script);
          else (body.reference_inputs ??= []).push(witness.script.input);
        }
        if (witness.type === "plutus") {
          if (witness.script.type === "attached") {
            const key =
              `plutus_${witness.script.version.toLowerCase()}_scripts` as const;
            (ws[key] ??= []).push(witness.script.cbor);
          } else (body.reference_inputs ??= []).push(witness.script.input);
          if (witness.datum?.type === "provided")
            (ws.plutus_data ??= { elems: [] }).elems.push(
              witness.datum.data.type === "CBOR" ? witness.datum.data.hex : "",
            );
          (ws.redeemers ??= []).push({
            tag: { type: "SPEND" },
            index: String(body.inputs.length - 1),
            data: witness.redeemer.data,
            ex_units: witness.redeemer.exUnits ?? { mem: "0", steps: "0" },
          });
        }
        break;
      }
      case "referenceInput":
        (body.reference_inputs ??= []).push(part.input);
        break;
      case "collateral":
        (body.collateral ??= []).push(part.input);
        break;
      case "collateralReturn":
        body.collateral_return = {
          address: part.address,
          amount: { coin: "1000000" },
        };
        body.total_collateral = part.totalCollateral;
        break;
      case "output":
        body.outputs.push({
          ...part.output,
          amount: {
            ...part.output.amount,
            coin: part.output.amount.coin ?? "1500000",
          },
        });
        if (part.embeddedDatum?.type === "CBOR")
          (ws.plutus_data ??= { elems: [] }).elems.push(part.embeddedDatum.hex);
        break;
    }
  }
  return proto;
};

const keyAddress = baseAddress(1);
const nativeScript: NativeScript = { type: "all", scripts: [] };
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const at = (outputIndex: number, address: string, extra = {}): UTxO => ({
  input: { txHash: "a".repeat(64), outputIndex },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: "5000000" }],
    ...extra,
  },
});

describe("parts as TransactionPrototype fragments", () => {
  it("survive encoding to CBOR and decoding back", () => {
    const parts: TxPart[] = [
      spend.pubKey({ utxo: at(0, keyAddress) }),
      spend.native({
        utxo: at(1, resolveNativeScriptAddress(nativeScript, 0)),
        script: nativeScript,
      }),
      spend.plutus({
        utxo: at(2, resolvePlutusScriptAddress(plutusScript, 0), {
          dataHash:
            "923918e403bf43c34b4ef6b48eb2ee04babed17320d8d1b9ff9ad086e86f44ec",
        }),
        script: plutusScript,
        datum: { data: mConStr0([]) },
        redeemer: {
          data: mConStr0([]),
          exUnits: { mem: 7000, steps: 3000000 },
        },
      }),
      referenceInput({ utxo: { txHash: "c".repeat(64), outputIndex: 0 } }),
      collateral({ utxo: at(3, keyAddress) }),
      collateralReturn({ address: keyAddress, totalCollateral: 4_000_000n }),
      output({
        address: keyAddress,
        value: { lovelace: 2_000_000n, ["d".repeat(56) + "01"]: 5n },
        datum: { type: "inline", data: mConStr0([]) },
        scriptRef: nativeScript,
      }),
      output({
        address: keyAddress,
        value: [],
        datum: { type: "hash", data: 42, embed: true },
      }),
    ];
    const proto = toPrototype(parts);

    const decoded = transactionPrototypeFromHex(
      transactionPrototypeToHex(proto),
    );

    expect(decoded.body.inputs).toEqual(proto.body.inputs);
    expect(decoded.body.reference_inputs).toEqual(proto.body.reference_inputs);
    expect(decoded.body.collateral).toEqual(proto.body.collateral);
    expect(decoded.body.total_collateral).toEqual("4000000");
    expect(decoded.body.outputs).toEqual([
      {
        address: keyAddress,
        amount: {
          coin: "2000000",
          multiasset: { ["d".repeat(56)]: { "01": "5" } },
        },
        plutus_data: {
          type: "DATA",
          value: {
            type: "MANUAL",
            data: { type: "CONSTR", alternative: 0n, fields: [] },
          },
        },
        script_ref: proto.body.outputs[0]!.script_ref,
      },
      {
        address: keyAddress,
        amount: { coin: "1500000" },
        plutus_data: proto.body.outputs[1]!.plutus_data,
      },
    ]);
    expect(decoded.witness_set.native_scripts).toEqual(
      proto.witness_set.native_scripts,
    );
    expect(decoded.witness_set.plutus_v3_scripts).toEqual(
      proto.witness_set.plutus_v3_scripts,
    );
    expect(decoded.witness_set.plutus_data?.elems).toEqual(
      proto.witness_set.plutus_data?.elems,
    );
    expect(decoded.witness_set.redeemers).toEqual([
      {
        tag: { type: "SPEND" },
        index: "2",
        data: {
          type: "MANUAL",
          data: { type: "CONSTR", alternative: 0n, fields: [] },
        },
        ex_units: { mem: "7000", steps: "3000000" },
      },
    ]);
  });
});
