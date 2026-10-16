import { IFetcher, ISubmitter, UTxO } from "@meshsdk/common";
import { AppWallet, MeshWallet } from "@meshsdk/wallet";

const words = "solution,".repeat(24).split(",").slice(0, 24);

const providers = (address: () => string) => {
  const fetchAddressUTxOs = jest.fn(async (): Promise<UTxO[]> => [
    {
      input: { txHash: "0".repeat(64), outputIndex: 0 },
      output: {
        address: address(),
        amount: [{ unit: "lovelace", quantity: "10000000" }],
      },
    },
  ]);
  const submitTx = jest.fn(async () => "1".repeat(64));
  return {
    fetcher: { fetchAddressUTxOs } as unknown as IFetcher,
    submitter: { submitTx } as unknown as ISubmitter,
    fetchAddressUTxOs,
  };
};

describe("Wallet fetcher cache", () => {
  it("MeshWallet fetches its UTxOs once for utxos and collateral", async () => {
    let address = "";
    const { fetcher, submitter, fetchAddressUTxOs } = providers(() => address);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher,
      submitter,
      key: { type: "mnemonic", words },
    });
    await wallet.init();
    address = await wallet.getChangeAddress();

    const utxos = await wallet.getUtxos();
    const collateral = await wallet.getCollateral();
    expect(utxos).toHaveLength(1);
    expect(collateral).toHaveLength(1);
    expect(fetchAddressUTxOs).toHaveBeenCalledTimes(1);

    // Submitting changes the wallet's UTxOs, so they are fetched again
    await wallet.submitTx("84");
    await wallet.getUtxos();
    expect(fetchAddressUTxOs).toHaveBeenCalledTimes(2);
  });

  it("AppWallet fetches its UTxOs once per burst of lookups", async () => {
    let address = "";
    const { fetcher, submitter, fetchAddressUTxOs } = providers(() => address);
    const wallet = new AppWallet({
      networkId: 0,
      fetcher,
      submitter,
      key: { type: "mnemonic", words },
    });
    await wallet.init();
    address = wallet.getPaymentAddress();

    await wallet.getUnspentOutputs();
    await wallet.getUnspentOutputs();
    expect(fetchAddressUTxOs).toHaveBeenCalledTimes(1);

    await wallet.submitTx("84");
    await wallet.getUnspentOutputs();
    expect(fetchAddressUTxOs).toHaveBeenCalledTimes(2);
  });
});
