import { Asset, Recipient } from "@meshsdk/common";
import { MeshTxBuilder, Transaction } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";

jest.mock("@meshsdk/transaction", () => {
  const txBuilderMock = {
    txOut: jest.fn(),
    txOutDatumHashValue: jest.fn(),
    txOutInlineDatumValue: jest.fn(),
  };

  return {
    MeshTxBuilder: jest.fn(() => txBuilderMock),
    Transaction: jest.requireActual("@meshsdk/transaction").Transaction,
  };
});

describe("Transaction", () => {
  let wallet: MeshWallet;
  let transaction: Transaction;
  let txBuilderMock: jest.Mocked<MeshTxBuilder>;

  beforeEach(() => {
    wallet = new MeshWallet({
      key: {
        type: "mnemonic",
        words: MeshWallet.brew() as string[],
      },
      networkId: 0,
    });
    txBuilderMock = new MeshTxBuilder({}) as jest.Mocked<MeshTxBuilder>;
    transaction = new Transaction({
      initiator: wallet,
    });
    transaction.txBuilder = txBuilderMock;
  });

  it("should trigger txOutDatumHashValue when recipient has datum with inline set to false", async () => {
    const address = (await wallet.getUsedAddresses())[0];
    const recipient: Recipient = {
      address: address as string,
      datum: {
        inline: false,
        value: "datum-value",
      },
    };
    const assets: Asset[] = [
      {
        unit: "lovelace",
        quantity: "1000",
      },
    ];

    transaction.sendAssets(recipient, assets);

    expect(txBuilderMock.txOut).toHaveBeenCalledWith(address, assets);
    expect(txBuilderMock.txOutDatumHashValue).toHaveBeenCalledWith(
      "datum-value",
    );
  });
  it("should trigger txOutInlineDatumValue when recipient has datum with inline set to false", async () => {
    const address = (await wallet.getUsedAddresses())[0];
    const recipient: Recipient = {
      address: address as string,
      datum: {
        inline: true,
        value: "datum-value",
      },
    };
    const assets: Asset[] = [
      {
        unit: "lovelace",
        quantity: "1000",
      },
    ];

    transaction.sendAssets(recipient, assets);

    expect(txBuilderMock.txOut).toHaveBeenCalledWith(address, assets);
    expect(txBuilderMock.txOutInlineDatumValue).toHaveBeenCalledWith(
      "datum-value",
    );
  });
});
