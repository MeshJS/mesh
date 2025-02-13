import {
  AccountInfo,
  IFetcher,
  MintItem,
  ScriptSource,
  TransactionInfo,
  TxIn,
  UTxO,
} from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/transaction";

class MockTxBuilder extends MeshTxBuilder {
  constructor() {
    super();
    this.queriedTxHashes = new Set();
    this.queriedUTxOs = {};
    this.fetcher = {
      fetchUTxOs: jest.fn().mockResolvedValue([]),
      fetchAccountInfo: jest.fn().mockResolvedValue({} as AccountInfo),
      fetchAddressUTxOs: jest.fn().mockResolvedValue([]),
      fetchProtocolParameters: jest.fn().mockResolvedValue({}),
      fetchTxInfo: jest.fn().mockResolvedValue({} as TransactionInfo),
      fetchNetworkInfo: jest.fn().mockResolvedValue({}),
      fetchAssetInfo: jest.fn().mockResolvedValue({}),
      fetchStakePoolInfo: jest.fn().mockResolvedValue({}),
      fetchDelegationInfo: jest.fn().mockResolvedValue({}),
    } as unknown as IFetcher;
  }

  getUTxOInfoExtended = this.getUTxOInfo;
  queryAllTxInfoExtended = this.queryAllTxInfo;
}

describe("MeshTxBuilder", () => {
  let txBuilder: MockTxBuilder;

  beforeEach(() => {
    txBuilder = new MockTxBuilder();
  });

  describe("queryAllTxInfo", () => {
    it("should call getUTxOInfo for incomplete TxIns", async () => {
      const incompleteTxIns: TxIn[] = [
        {
          type: "PubKey",
          txIn: { txHash: "txHash1", txIndex: 0 },
        },
        {
          type: "Script",
          txIn: { txHash: "txHash2", txIndex: 1 },
          scriptTxIn: {
            scriptSource: {
              type: "Inline",
              txHash: "txHash3",
              txIndex: 2,
            },
          },
        },
      ];

      const getUTxOInfoMock = jest
        .spyOn(txBuilder as any, "getUTxOInfo")
        .mockResolvedValue({} as UTxO);

      await txBuilder.queryAllTxInfoExtended(
        incompleteTxIns,
        [
          {
            type: "Inline",
            txHash: "txHash3",
            txIndex: 2,
          },
        ],
        [],
      );
      expect(getUTxOInfoMock).toHaveBeenCalledWith("txHash1");
      expect(getUTxOInfoMock).toHaveBeenCalledWith("txHash2");
      expect(getUTxOInfoMock).toHaveBeenCalledWith("txHash3");
    });

    it("should call getUTxOInfo for incomplete Mints", async () => {
      const incompleteMints: MintItem[] = [
        {
          type: "Plutus",
          policyId: "policyId1",
          assetName: "assetName1",
          amount: "100",
          scriptSource: {
            type: "Inline",
            txHash: "txHash4",
            txIndex: 3,
          },
        },
      ];

      const getUTxOInfoMock = jest
        .spyOn(txBuilder as any, "getUTxOInfo")
        .mockResolvedValue({} as UTxO);

      await txBuilder.queryAllTxInfoExtended(
        [],
        incompleteMints.map((m) => m.scriptSource as ScriptSource),
        [],
      );

      expect(getUTxOInfoMock).toHaveBeenCalledWith("txHash4");
    });
  });
});
