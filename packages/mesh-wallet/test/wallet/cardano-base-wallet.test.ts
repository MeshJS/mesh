import { Cardano, Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import { DataSignature } from "@meshsdk/common";
import { OfflineFetcher } from "@meshsdk/provider";

import { BaseBip32 } from "../../src";
import { CardanoSigner } from "../../src/cardano/signer/cardano-signer";
import { BaseCardanoWallet } from "../../src/cardano/wallet/mesh/cardano-base-wallet";

describe("CardanoBaseWallet", () => {
  const offlineFetcher = new OfflineFetcher("preprod");
  offlineFetcher.addUTxOs([
    {
      input: {
        txHash:
          "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023",
        outputIndex: 1,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "977313882",
          },
        ],
      },
    },
    {
      input: {
        txHash:
          "e6a99b6338fbacd1e411c7bf69d963d83975d8ad1336cb70cd600bdd049c4cae",
        outputIndex: 1,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "977313882",
          },
        ],
      },
    },
    {
      input: {
        txHash:
          "62e6bf27216633a367924fd9d94681f75609788fa8e6187c8a583a95d60fbbcd",
        outputIndex: 1,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "954457687",
          },
        ],
      },
    },
    {
      input: {
        txHash:
          "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999",
        outputIndex: 0,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "954284486",
          },
        ],
      },
    },
    {
      input: {
        txHash:
          "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999",
        outputIndex: 1,
      },
      output: {
        address:
          "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
        amount: [
          {
            unit: "lovelace",
            quantity: "500000000",
          },
          {
            unit: "0ba402c042775dfffedbd958cae3805a281bad34f46b5b6fd5c2c7714d657368546f6b656e",
            quantity: "1",
          },
        ],
      },
    },
    {
      input: {
        txHash:
          "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999",
        outputIndex: 2,
      },
      output: {
        address:
          "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
        amount: [
          {
            unit: "lovelace",
            quantity: "5000000",
          },
        ],
      },
    },
  ]);

  it("should create correct wallet from mnemonic", async () => {
    const wallet = await BaseCardanoWallet.fromMnemonic(
      0,
      "solution,".repeat(24).split(",").slice(0, 24),
    );

    expect(await wallet.getChangeAddress()).toBe(
      "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
    );
  });

  it("should create correct wallet from wallet sources", async () => {
    const wallet = await BaseCardanoWallet.fromWalletSources(0, {
      paymentKey: {
        type: "ed25519ExtendedPrivateKeyHex",
        keyHex:
          "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241eebbb8e9d5d47d91cafc181111fdba61513bbbe6e80127e3b6237bcf347e9d05",
      },
      stakeKey: {
        type: "ed25519ExtendedPrivateKeyHex",
        keyHex:
          "b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe92416a05410d56bb31b9e3631ae60ecabaec2b0355bfc8c830da138952ea9454de50",
      },
    });

    expect(await wallet.getChangeAddress()).toBe(
      "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
    );
    expect((wallet as any).address.getBaseAddressBech32()).toBe(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );

    const wallet2 = await BaseCardanoWallet.fromWalletSources(0, {
      paymentKey: {
        type: "ed25519PrivateKeyHex",
        keyHex:
          "d4ffb1e83d44b66849b4f16183cbf2ba1358c491cfeb39f0b66b5f811a88f182",
      },
    });
    expect(await wallet2.getChangeAddress()).toBe(
      "6091af38e77f68201a084e6cbe7a5e13477678d866afbbbb26c61e86fc",
    );
    expect((wallet2 as any).address.getEnterpriseAddressBech32()).toBe(
      "addr_test1vzg67w880a5zqxsgfektu7j7zdrhv7xcv6hmhwexcc0gdlqm7wz4f",
    );
    expect((wallet2 as any).signer.paymentSigner.getPublicKey()).resolves.toBe(
      "a5aa30e677bdd5936095f0f16b29f2716e35a909163a51f91995a1c3ed19a9e1",
    );
  });

  it("should sign with correct witness", async () => {
    const wallet = await BaseCardanoWallet.fromMnemonic(
      0,
      "solution,".repeat(24).split(",").slice(0, 24),
      "",
      offlineFetcher,
    );
    const signature = await wallet.signTx(
      "84a500d901028282582045703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc102301825820e6a99b6338fbacd1e411c7bf69d963d83975d8ad1336cb70cd600bdd049c4cae01018282583900fbbd5c9ecf59fb9ba10f723003d3a3ed6214fa71f03b85041ae5c2e34253771c046276f5eb6777961f972c7ef25abad3f3319ea69cad00e21a3b9aca00825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a38e3de57021a0002985d031a063659930801a100d9010281825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f9558402047ca362a5f5a9b2f9c5ad0c772c3be8eb1b66fe8e86faf96f5717fcc05b1340da85cbac4ba8d6182ac849a66792d70340a7ea3ff9bea76460d982ff5a46f0af5f6",
    );
    expect(signature).toBe(
      "a100d9010281825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f9558402047ca362a5f5a9b2f9c5ad0c772c3be8eb1b66fe8e86faf96f5717fcc05b1340da85cbac4ba8d6182ac849a66792d70340a7ea3ff9bea76460d982ff5a46f0a",
    );

    const signature2 = await wallet.signTx(
      "84a600d901028182582062e6bf27216633a367924fd9d94681f75609788fa8e6187c8a583a95d60fbbcd010181825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a38e139c6021a0002a491031a063d0f2d04d901028183098200581c9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e68200581c9816db59cc3cefc2d41dd05fde9c04b4012afc74bb9d0072cae72f110801a100d9010282825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f955840ae75a2cc6cabda10b30849164457bddcbf0248f6afa1153dc03a7a136b177f6764757691335e1670aba2e26b3cc7d7ee82bebf1cfe7b9f6b9ba352c984c7b50382582002c9f4600bc90fcf09c7ef26346fd64dc3f39c3695ed986f53caad400ef419ad58403c58828bd5a4bcf0e6de64bc5bf1459dd3afaad1f3135d0f2d4309f867ffdf8f944a5ca98d35981024459a2eec9d9da28bfcb8c08d67f34c68ed95bb1501940df5f6",
    );
    expect(signature2).toBe(
      "a100d9010282825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f955840ae75a2cc6cabda10b30849164457bddcbf0248f6afa1153dc03a7a136b177f6764757691335e1670aba2e26b3cc7d7ee82bebf1cfe7b9f6b9ba352c984c7b50382582002c9f4600bc90fcf09c7ef26346fd64dc3f39c3695ed986f53caad400ef419ad58403c58828bd5a4bcf0e6de64bc5bf1459dd3afaad1f3135d0f2d4309f867ffdf8f944a5ca98d35981024459a2eec9d9da28bfcb8c08d67f34c68ed95bb1501940d",
    );

    const signature3 = await wallet.signTx(
      "84a600d9010281825820ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999000181825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a75769bcf021a00029ee5031a063d111505a1581de09d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a3c9800ee0801a0f5f6",
    );
    expect(signature3).toBe(
      "a100d9010282825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f955840b71e7ffac89eac0dc051323fe30172b3c83d753f92c489478188ccbeed67b77bcc1af7d42c43d987ac767eeb3b0aea20697dbf87697de00487d16cbe2ff7750e82582002c9f4600bc90fcf09c7ef26346fd64dc3f39c3695ed986f53caad400ef419ad5840f40a8b338f56e958e65051178c9397e4c15c522aca5a0ff5639c5ee6f9a040280e7c5b15981504937978311c8763aedc164a89535f9fdcbb28089294efdc6b0e",
    );
  });

  it("should fetch utxos from multiple addresses", async () => {
    const wallet = await BaseCardanoWallet.fromMnemonic(
      0,
      "solution,".repeat(24).split(",").slice(0, 24),
      "",
      offlineFetcher,
    );
    const utxos = await wallet.getUtxos();
    expect(utxos.length).toBe(6);
  });

  it("should fetch correct balance", async () => {
    const wallet = await BaseCardanoWallet.fromMnemonic(
      0,
      "solution,".repeat(24).split(",").slice(0, 24),
      "",
      offlineFetcher,
    );
    const balance = await wallet.getBalance();
    const value = Serialization.Value.fromCbor(HexBlob(balance));
    expect(value.coin()).toBe(
      977313882n + 977313882n + 954457687n + 954284486n + 500000000n + 5000000n,
    );
    expect(
      value
        .multiasset()
        ?.get(
          Cardano.AssetId(
            "0ba402c042775dfffedbd958cae3805a281bad34f46b5b6fd5c2c7714d657368546f6b656e",
          ),
        ),
    ).toBe(1n);
  });

  it("should fetch correct collateral", async () => {
    const wallet = await BaseCardanoWallet.fromMnemonic(
      0,
      "solution,".repeat(24).split(",").slice(0, 24),
      "",
      offlineFetcher,
    );
    const collaterals = await wallet.getCollateral();
    expect(collaterals.length).toBe(1);
    const collateral = Serialization.TransactionUnspentOutput.fromCbor(
      HexBlob(collaterals[0]!),
    );
    expect(collateral.output().amount().coin()).toBe(5000000n);
    expect(collateral.output().amount().multiasset()).toBe(undefined);
  });

  it("should sign data correctly", async () => {
    const wallet = await BaseCardanoWallet.fromMnemonic(
      0,
      "solution,".repeat(24).split(",").slice(0, 24),
      "",
      offlineFetcher,
    );
    const signedData = await wallet.signData(
      "abc",
      wallet.address.getBaseAddressBech32(),
    );
    expect(signedData).toEqual<DataSignature>({
      key: "a4010103272006215820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f95",
      signature:
        "845846a2012767616464726573735839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6a166686173686564f441ab58405fdb1b2006cba85db90a2edb254317ade112d72883d9f28956fc3337104a6ee74ca2e252163c2f790ca23e0d3c96205e0bf9d460cca4fc325f49db65b8741d0b",
    });
  });
});
