import {
  AccountInfo,
  emptyTxBuilderBody,
  IFetcher,
  MintItem,
  ScriptSource,
  TransactionInfo,
  TxIn,
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

  it("should update incomplete txIns and mints", async () => {
    // Mock methods

    jest
      .spyOn(txBuilder.serializer as any, "serializeTxBody")
      .mockImplementation(() => "");
    jest
      .spyOn(txBuilder as any, "addUtxosFromSelection")
      .mockImplementation(() => {});
    jest
      .spyOn(txBuilder as any, "isInputComplete")
      .mockImplementation((txIn) => false);
    jest
      .spyOn(txBuilder as any, "isMintComplete")
      .mockImplementation((mint) => false);
    jest.spyOn(txBuilder as any, "queryAllTxInfo").mockResolvedValue(undefined);
    const completeTxInformationMock = jest
      .spyOn(txBuilder as any, "completeTxInformation")
      .mockImplementation(() => {});
    const completeScriptInfoMock = jest
      .spyOn(txBuilder as any, "completeScriptInfo")
      .mockImplementation(() => {});

    // Define incomplete inputs and mints
    const incompleteTxIns: TxIn[] = [
      { type: "PubKey", txIn: { txHash: "txHash1", txIndex: 0 } },
      { type: "PubKey", txIn: { txHash: "txHash2", txIndex: 1 } },
    ];
    const incompleteMints: MintItem[] = [
      {
        type: "Plutus",
        policyId: "policyId1",
        assetName: "assetName1",
        amount: "100",
        scriptSource: {
          type: "Inline",
          txHash: "txHash3",
          txIndex: 2,
        } as ScriptSource,
      },
    ];

    // Set the meshTxBuilderBody
    txBuilder.meshTxBuilderBody = {
      ...emptyTxBuilderBody(),
      inputs: incompleteTxIns,
      collaterals: [],
      mints: incompleteMints,
    };

    // Call the complete method
    await txBuilder.complete();

    // Assertions
    expect(completeTxInformationMock).toHaveBeenCalledTimes(
      incompleteTxIns.length,
    );
    incompleteTxIns.forEach((txIn) => {
      expect(completeTxInformationMock).toHaveBeenCalledWith(txIn);
    });

    expect(completeScriptInfoMock).toHaveBeenCalledTimes(1);
    expect(completeScriptInfoMock).toHaveBeenCalledWith(
      (incompleteMints[0] as any).scriptSource,
    );
  });
});
