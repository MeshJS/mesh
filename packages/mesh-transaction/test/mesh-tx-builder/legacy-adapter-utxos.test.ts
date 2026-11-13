import { UTxO } from "@meshsdk/common";

import { MeshTxBuilder } from "../../src";
import { TxError } from "../../src/tx-builder";
import { baseAddress } from "../test-util";
import { lovelace, scriptRef } from "./legacy-adapter-util";

const wallet = baseAddress(1);
const recipient = baseAddress(2);

const at = (
  hash: string,
  amount: UTxO["output"]["amount"],
  extra: Partial<UTxO["output"]> = {},
): UTxO => ({
  input: { txHash: hash.repeat(64), outputIndex: 0 },
  output: { address: wallet, amount, ...extra },
});

/** A payment of 2 ADA from the UTxOs given to `selectUtxosFrom` */
const payFrom = (utxos: UTxO[]) =>
  new MeshTxBuilder({})
    .txOut(recipient, lovelace(2_000_000))
    .changeAddress(wallet)
    .selectUtxosFrom(utxos);

describe("MeshTxBuilder: the UTxOs it is given, read as before", () => {
  // Members this API never read: the hash of a reference script, and a datum hash beside the
  // inline datum
  const scriptHashOnly = at("c", lovelace(3_000_000), {
    scriptHash: "ab".repeat(28),
  });
  const wrongScriptHash = at("d", lovelace(3_000_000), {
    scriptRef,
    scriptHash: "ab".repeat(28),
  });
  const otherDataHash = at("e", lovelace(3_000_000), {
    plutusData: "d87980",
    dataHash: "00".repeat(32),
  });
  const without = (utxo: UTxO, ...members: (keyof UTxO["output"])[]) => {
    const output = { ...utxo.output };
    for (const member of members) delete output[member];
    return { ...utxo, output };
  };

  it("builds from UTxOs whose unread members contradict the rest, as from those without them", async () => {
    const funds = at("a", lovelace(50_000_000));
    const given = [funds, scriptHashOnly, wrongScriptHash, otherDataHash];
    const tx = await payFrom(given).complete();
    const plain = await payFrom([
      funds,
      without(scriptHashOnly, "scriptHash"),
      without(wrongScriptHash, "scriptHash"),
      without(otherDataHash, "dataHash"),
    ]).complete();
    expect(tx).toBe(plain);
  });

  it("spends such UTxOs, the reference script priced as before", async () => {
    const given = [scriptHashOnly, wrongScriptHash, otherDataHash];
    const builder = payFrom(given);
    for (const utxo of given)
      builder.txIn(
        utxo.input.txHash,
        utxo.input.outputIndex,
        utxo.output.amount,
        utxo.output.address,
      );
    const tx = await builder.complete();
    expect(builder.calculateRefScriptFee()).toBeGreaterThan(0n);

    const twin = payFrom([
      without(scriptHashOnly, "scriptHash"),
      without(wrongScriptHash, "scriptHash"),
      without(otherDataHash, "dataHash"),
    ]);
    for (const utxo of given)
      twin.txIn(
        utxo.input.txHash,
        utxo.input.outputIndex,
        utxo.output.amount,
        utxo.output.address,
      );
    expect(tx).toBe(await twin.complete());
    expect(builder.calculateRefScriptFee()).toBe(twin.calculateRefScriptFee());
  });

  it("writes the inputs into its body as they were given", async () => {
    const unit = `${"ab".repeat(28)}01`;
    const funds = at(
      "f",
      [
        { unit: "", quantity: "30000000" },
        { unit, quantity: "2" },
        { unit: "lovelace", quantity: "20000000" },
      ],
      { scriptRef, plutusData: "d87980" },
    );
    const builder = payFrom([funds]);
    await builder.complete();
    const [input] = builder.meshTxBuilderBody.inputs;
    expect(input!.txIn.amount).toEqual(funds.output.amount);
    expect(input!.txIn.address).toBe(wallet);
    expect(input!.txIn.scriptSize).toBe(scriptRef.length / 2);
    // The given UTxO is left as it was
    expect(funds.output.dataHash).toBeUndefined();
  });

  it("refuses an inline datum with bytes after it as data, not as a UTxO", async () => {
    let error: unknown;
    try {
      await payFrom([at("a", lovelace(50_000_000))])
        .txOut(recipient, lovelace(5_000_000))
        .txOutInlineDatumValue("d8799fff00", "CBOR")
        .complete();
    } catch (thrown) {
      error = thrown;
    }
    expect(TxError.is(error)).toBe(true);
    expect((error as TxError).code).toBe("INVALID_DATA");
    expect((error as Error).message).not.toContain("not a UTxO");
  });
});
