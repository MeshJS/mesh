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
  auxiliaryScript,
  collateral,
  collateralReturn,
  donation,
  metadata,
  mint,
  networkId,
  output,
  referenceInput,
  requiredSigner,
  spend,
  treasuryValue,
  TxPart,
  validity,
  withdrawal,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress, rewardAddress } from "../../test-util";

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
      case "mint":
        body.mint = { ...body.mint, [part.policyId]: part.assets };
        if (part.witness.script.type === "attached") {
          if (part.witness.type === "native")
            (ws.native_scripts ??= []).push(part.witness.script.script);
          else if ("version" in part.witness.script)
            (ws.plutus_v3_scripts ??= []).push(part.witness.script.cbor);
        }
        break;
      case "withdrawal":
        body.withdrawals = {
          ...body.withdrawals,
          [part.rewardAddress]: part.amount ?? "0",
        };
        break;
      case "requiredSigner":
        (body.required_signers ??= []).push(part.keyHash);
        break;
      case "validity":
        body.validity_start_interval = part.invalidBefore;
        body.ttl = part.invalidHereafter;
        break;
      case "networkId":
        body.network_id = part.networkId;
        break;
      case "donation":
        body.donation = part.amount;
        break;
      case "treasuryValue":
        body.current_treasury_value = part.amount;
        break;
      case "metadata": {
        const aux = (proto.auxiliary_data ??= { prefer_alonzo_format: true });
        aux.metadata = { ...aux.metadata, [part.metadataLabel]: part.value };
        break;
      }
      case "auxiliaryScript": {
        const aux = (proto.auxiliary_data ??= { prefer_alonzo_format: true });
        if (part.script.type === "native")
          (aux.native_scripts ??= []).push(part.script.script);
        else (aux.plutus_v3_scripts ??= []).push(part.script.cbor);
        break;
      }
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

  it("survive encoding to CBOR and decoding back: mint, withdrawals and scalars", () => {
    const parts: TxPart[] = [
      spend.pubKey({ utxo: at(0, keyAddress) }),
      mint.native({ script: nativeScript, assets: { "0102": 5n, "": -1n } }),
      mint.plutus({
        script: plutusScript,
        redeemer: { data: mConStr0([]) },
        assets: { abcd: 1n },
      }),
      withdrawal.pubKey({ rewardAddress: rewardAddress(1), amount: 7n }),
      requiredSigner({ keyHash: "e".repeat(56) }),
      validity({ invalidBefore: 0, invalidHereafter: 1000 }),
      networkId({ network: "testnet" }),
      donation({ amount: 3n }),
      treasuryValue({ amount: 9n }),
      metadata({ metadataLabel: 674, value: { msg: ["hi", 2n ** 63n] } }),
      auxiliaryScript({ script: nativeScript }),
    ];
    const proto = toPrototype(parts);

    const decoded = transactionPrototypeFromHex(
      transactionPrototypeToHex(proto),
    );

    expect(decoded.body.mint).toEqual(proto.body.mint);
    expect(decoded.body.withdrawals).toEqual(proto.body.withdrawals);
    expect(decoded.body.required_signers).toEqual(["e".repeat(56)]);
    expect(decoded.body.validity_start_interval).toBe("0");
    expect(decoded.body.ttl).toBe("1000");
    expect(decoded.body.network_id).toEqual({ type: "TESTNET" });
    expect(decoded.body.donation).toBe("3");
    expect(decoded.body.current_treasury_value).toBe("9");
    expect(decoded.auxiliary_data?.metadata).toEqual(
      proto.auxiliary_data?.metadata,
    );
    expect(decoded.auxiliary_data?.native_scripts).toEqual(
      proto.auxiliary_data?.native_scripts,
    );
  });
});
