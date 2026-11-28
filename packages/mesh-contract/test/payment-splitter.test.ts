import { MeshPaymentSplitterContract } from "@meshsdk/contract";
import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { deserializeTx } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";

const words = Array(24).fill("solution");
const payee =
  "addr_test1qzhm3fg7v9t9e4nrlw0z49cysmvzfy3xpmvxuht80aa3rvnm5tz7rfnph9ntszp2fclw5m334udzq49777gkhwkztsks4c69rg";

describe("Payment splitter", () => {
  it("triggerPayout names the wallet's collateral once", async () => {
    const signer = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
    });
    await signer.init();
    const address = await signer.getChangeAddress();
    const emulator = await ScalusEmulator.create([
      {
        input: { txHash: "0".repeat(64), outputIndex: 0 },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: "10000000000" }],
        },
      },
      {
        input: { txHash: "1".repeat(64), outputIndex: 0 },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: "5000000" }],
        },
      },
    ]);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: emulator,
      submitter: emulator,
      key: { type: "mnemonic", words },
    });
    await wallet.init();
    const contract = async () => {
      const made = new MeshPaymentSplitterContract(
        {
          mesh: new MeshTxBuilder({ fetcher: emulator, submitter: emulator }),
          fetcher: emulator,
          wallet,
          networkId: 0,
        },
        [payee],
      );
      // The wallet's own address joins the payees once the wallet answers
      await wallet.getUsedAddresses();
      return made;
    };

    const sendTx = await (await contract()).sendLovelaceToSplitter(20_000_000);
    await wallet.submitTx(await wallet.signTx(sendTx));

    // The contract gives the wallet's collateral to setCollateral, and the transaction adds the
    // wallet's collateral again: one collateral input
    const [collateral] = await wallet.getCollateral();
    const payoutTx = await (await contract()).triggerPayout();
    const inputs = deserializeTx(payoutTx).body().collateral()?.values() ?? [];
    expect(
      inputs.map((input) => [
        input.transactionId().toString(),
        Number(input.index()),
      ]),
    ).toEqual([[collateral!.input.txHash, collateral!.input.outputIndex]]);
  });
});
