import { MeshTxBuilder, MeshWallet, OfflineFetcher } from "@meshsdk/core";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";

import { balanceTxWithScalus } from "../src/offline-providers";

// A 24-word test mnemonic. The address it derives owns the UTxO below.
const MNEMONIC = ("abandon ".repeat(23) + "art").split(" ");
const BOB = "addr_test1vzpwq95z3xyum8vqndgdd9mdnmafh3djcxnc6jemlgdmswcve6tkw";
const PV = 11;

/** The fee of a transaction, read out of its CBOR without a decoder library. */
const feeOf = async (txHex: string): Promise<bigint> => {
  const { Serialization } = await import("@cardano-sdk/core");
  return Serialization.Transaction.fromCbor(
    Serialization.TxCBOR(txHex),
  ).body().fee();
};

/**
 * The same transaction with its fee set to zero, as a draft has it.
 *
 * Balancing a transaction that already carries Mesh's fee proves nothing: Scalus never lowers a fee
 * below the one it was given, so it would hand back the same number without computing anything.
 * Starting from zero, the fee it returns is one it worked out.
 */
const withZeroFee = async (txHex: string): Promise<string> => {
  const { Serialization } = await import("@cardano-sdk/core");
  const tx = Serialization.Transaction.fromCbor(Serialization.TxCBOR(txHex));
  const body = tx.body();
  body.setFee(0n);
  tx.setBody(body);
  return tx.toCbor().toString();
};

describe("balanceTxWithScalus", () => {
  let wallet: MeshWallet;
  let alice: string;
  let utxos: Awaited<ReturnType<OfflineFetcher["fetchAddressUTxOs"]>>;

  beforeAll(async () => {
    const fetcher = new OfflineFetcher();
    wallet = new MeshWallet({
      networkId: 0,
      fetcher,
      key: { type: "mnemonic", words: MNEMONIC },
    });
    await wallet.init();
    alice = await wallet.getChangeAddress();
    utxos = [
      {
        input: { txHash: "11".repeat(32), outputIndex: 0 },
        output: {
          address: alice,
          amount: [{ unit: "lovelace", quantity: "1000000000" }],
        },
      },
    ];
  });

  const build = async () =>
    await new MeshTxBuilder({ params: DEFAULT_PROTOCOL_PARAMETERS })
      .txOut(BOB, [{ unit: "lovelace", quantity: "25000000" }])
      .changeAddress(alice)
      .selectUtxosFrom(utxos)
      .complete();

  it("balances a transaction Mesh built, and agrees with Mesh's own fee", async () => {
    const tx = await build();
    const draft = await withZeroFee(tx);
    expect(await feeOf(draft)).toBe(0n);

    const balanced = await balanceTxWithScalus(
      draft,
      utxos,
      DEFAULT_PROTOCOL_PARAMETERS,
      "preprod",
      1, // MeshTxBuilder appends the change output last
      PV,
    );

    expect(typeof balanced).toBe("string");

    // Scalus computes the ledger's own minimum. Mesh carries a byte or two of slack, so Scalus's
    // fee is at most Mesh's and within a few bytes of it. A mistake mapping Mesh's `Protocol` onto
    // the record Scalus reads would move this by thousands of lovelace, not by a few.
    const meshFee = await feeOf(tx);
    const scalusFee = await feeOf(balanced);
    expect(scalusFee).toBeGreaterThan(0n);
    expect(scalusFee).toBeLessThanOrEqual(meshFee);
    expect(Number(meshFee - scalusFee)).toBeLessThan(
      10 * DEFAULT_PROTOCOL_PARAMETERS.minFeeA,
    );
  });

  it("is still signable, so the body it returns is well formed", async () => {
    const tx = await build();
    const balanced = await balanceTxWithScalus(
      tx,
      utxos,
      DEFAULT_PROTOCOL_PARAMETERS,
      "preprod",
      1,
      PV,
    );
    const signed = await wallet.signTx(balanced, true);
    expect(signed.length).toBeGreaterThan(balanced.length);
  });

  it("charges for an extra signer a native script would need", async () => {
    const tx = await build();
    const plain = await balanceTxWithScalus(
      tx, utxos, DEFAULT_PROTOCOL_PARAMETERS, "preprod", 1, PV, undefined, [],
    );
    const withSigner = await balanceTxWithScalus(
      tx, utxos, DEFAULT_PROTOCOL_PARAMETERS, "preprod", 1, PV, undefined,
      ["aa".repeat(28)],
    );
    // One vkey witness is about 101 bytes, so the fee rises by roughly 101 * minFeeA.
    const rise = Number((await feeOf(withSigner)) - (await feeOf(plain)));
    expect(rise).toBeGreaterThan(50 * DEFAULT_PROTOCOL_PARAMETERS.minFeeA);
    expect(rise).toBeLessThan(200 * DEFAULT_PROTOCOL_PARAMETERS.minFeeA);
  });

  it("rejects a change index that is not an output", async () => {
    const tx = await build();
    await expect(
      balanceTxWithScalus(tx, utxos, DEFAULT_PROTOCOL_PARAMETERS, "preprod", 99, PV),
    ).rejects.toThrow(/changeOutputIndex/);
  });
});
