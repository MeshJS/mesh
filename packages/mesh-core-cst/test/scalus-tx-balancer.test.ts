import {
  DEFAULT_PROTOCOL_PARAMETERS,
  ITxBalancer,
  UTxO,
} from "@meshsdk/common";
import { MeshTxBuilder, MeshWallet, OfflineFetcher } from "@meshsdk/core";

import { ScalusTxBalancer } from "../src/offline-providers";

// A 24-word test mnemonic. The address it derives owns the UTxO below.
const MNEMONIC = ("abandon ".repeat(23) + "art").split(" ");
const BOB = "addr_test1vzpwq95z3xyum8vqndgdd9mdnmafh3djcxnc6jemlgdmswcve6tkw";

const feeOf = async (txHex: string): Promise<bigint> => {
  const { Serialization } = await import("@cardano-sdk/core");
  return Serialization.Transaction.fromCbor(Serialization.TxCBOR(txHex))
    .body()
    .fee();
};

describe("MeshTxBuilder with a Scalus balancer", () => {
  let wallet: MeshWallet;
  let alice: string;
  let utxos: UTxOLike[];

  type UTxOLike = {
    input: { txHash: string; outputIndex: number };
    output: { address: string; amount: { unit: string; quantity: string }[] };
  };

  beforeAll(async () => {
    wallet = new MeshWallet({
      networkId: 0,
      fetcher: new OfflineFetcher(),
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

  const build = async (balancer?: ITxBalancer) =>
    await new MeshTxBuilder({ params: DEFAULT_PROTOCOL_PARAMETERS, balancer })
      .txOut(BOB, [{ unit: "lovelace", quantity: "25000000" }])
      .changeAddress(alice)
      .selectUtxosFrom(utxos as never)
      .complete();

  it("hands the built transaction to the balancer and returns its answer", async () => {
    const calls: { utxos: UTxO[]; changeOutputIndex: number }[] = [];
    const recording: ITxBalancer = {
      balanceTx: async (_tx, utxos, _params, changeOutputIndex) => {
        calls.push({ utxos, changeOutputIndex });
        return "balanced";
      },
    };

    const result = await build(recording);

    expect(calls).toHaveLength(1);
    // Coin selection appends the change output after the payment, so it is output 1.
    expect(calls[0]!.changeOutputIndex).toBe(1);
    // The selected input arrives with its address and value: a balancer infers signers from them.
    expect(calls[0]!.utxos).toContainEqual(utxos[0]);
    expect(result).toBe("balanced");
  });

  it("leaves the transaction signable, so the body it produced is well formed", async () => {
    const balanced = await build(new ScalusTxBalancer("preprod"));
    const signed = await wallet.signTx(balanced, true);
    expect(signed.length).toBeGreaterThan(balanced.length);
  });

  it("charges for extra signers the transaction does not name", async () => {
    const none = await build(new ScalusTxBalancer("preprod"));
    const withSigner = await build(
      new ScalusTxBalancer("preprod", 11, undefined, ["aa".repeat(28)]),
    );
    // One vkey witness is about 101 bytes, so the fee rises by roughly 101 * minFeeA.
    const rise = Number((await feeOf(withSigner)) - (await feeOf(none)));
    expect(rise).toBeGreaterThan(50 * DEFAULT_PROTOCOL_PARAMETERS.minFeeA);
    expect(rise).toBeLessThan(200 * DEFAULT_PROTOCOL_PARAMETERS.minFeeA);
  });
});
