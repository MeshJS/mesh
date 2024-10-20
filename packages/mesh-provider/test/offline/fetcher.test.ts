import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  Protocol,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";
import { OfflineFetcher } from "@meshsdk/provider";

describe("OfflineFetcher", () => {
  let fetcher: OfflineFetcher;

  beforeEach(() => {
    fetcher = new OfflineFetcher();
  });

  const validBech32Address =
    "addr_test1qrhsnfvaqnd8r7dm9f9c5fscyfqmqzptyrn63dzrgvfw6p7vxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qkdr4hz";
  const validBase58Address =
    "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";
  const validPoolId =
    "pool1v0hm27ywsufus3xl6v4jayw7rccflmll642lsf7vnmskgtvnnx7";
  const validVrfVk =
    "vrf_vk1qthm27ywsufus3xl6v4jayw7rccflmll642lsf7vnmskgqgzqvzqtwha9s";
  const validTxHash =
    "0443456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const validBlockHash =
    "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const validAsset =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const validPolicyId =
    "0123456789abcdef0123456789abcdef0123456789abcdef01234567";
  const validEpoch = 100;

  const sampleAccountInfo: AccountInfo = {
    active: true,
    balance: "1000000",
    poolId: validPoolId,
    rewards: "5000",
    withdrawals: "0",
  };

  const sampleUTxO: UTxO = {
    input: {
      txHash: validTxHash,
      outputIndex: 0,
    },
    output: {
      address: validBech32Address,
      amount: [{ unit: "lovelace", quantity: "1000000" }],
      dataHash: undefined,
    },
  };

  const sampleAssetMetadata: AssetMetadata = {
    name: "Sample Token",
    description: "A sample token for testing",
    ticker: "IDKTICKER",
    url: "https://example.com",
    logo: null,
    decimals: 0,
    unit: validAsset,
  };

  const sampleBlockInfo: BlockInfo = {
    hash: validBlockHash,
    time: 1638316800,
    slot: "50000000",
    epoch: 290,
    epochSlot: "200000",
    slotLeader: validPoolId,
    size: 500,
    txCount: 10,
    output: "1000000000",
    fees: "500000",
    previousBlock:
      "bbcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    nextBlock:
      "bbcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef",
    confirmations: 10,
    operationalCertificate: validTxHash,
    VRFKey: validVrfVk,
  };

  const sampleProtocolParameters: Protocol = {
    epoch: validEpoch,
    minFeeA: 44,
    minFeeB: 155381,
    maxBlockSize: 65536,
    maxTxSize: 16384,
    maxBlockHeaderSize: 1100,
    keyDeposit: 2000000,
    poolDeposit: 500000000,
    decentralisation: 0.5,
    minPoolCost: "340000000",
    priceMem: 0.0577,
    priceStep: 0.0000721,
    maxTxExMem: "10000000",
    maxTxExSteps: "10000000000",
    maxBlockExMem: "50000000",
    maxBlockExSteps: "40000000000",
    maxValSize: 5000,
    collateralPercent: 150,
    maxCollateralInputs: 3,
    coinsPerUtxoSize: 4310,
    minFeeRefScriptCostPerByte: 1000,
  };

  const sampleTransactionInfo: TransactionInfo = {
    hash: validTxHash,
    block: validBlockHash,
    index: 0,
    fees: "500000",
    deposit: "0",
    size: 200,
    invalidBefore: "",
    invalidAfter: "",
    slot: "50000000",
  };

  const sampleAssetAddress = {
    address: validBech32Address,
    quantity: "1000",
  };

  const sampleAsset: Asset = {
    unit: validAsset,
    quantity: "1000",
  };

  describe("addAccount", () => {
    it("should add a valid Bech32 account", () => {
      expect(() =>
        fetcher.addAccount(validBech32Address, sampleAccountInfo),
      ).not.toThrow();
    });

    it("should add a valid Base58 account", () => {
      const accountInfoBase58 = {
        ...sampleAccountInfo,
        address: validBase58Address,
      };
      expect(() =>
        fetcher.addAccount(validBase58Address, accountInfoBase58),
      ).not.toThrow();
    });

    it("should throw an error for invalid address", () => {
      const invalidAddress = "asasdsadasd44499((";
      expect(() =>
        fetcher.addAccount(invalidAddress, sampleAccountInfo),
      ).toThrowError(
        "Invalid address: must be a valid Bech32 or Base58 address",
      );
    });
  });

  describe("fetchAccountInfo", () => {
    it("should fetch account info after adding it", async () => {
      fetcher.addAccount(validBech32Address, sampleAccountInfo);
      const accountInfo = await fetcher.fetchAccountInfo(validBech32Address);
      expect(accountInfo).toEqual(sampleAccountInfo);
    });

    it("should throw an error if account info is not found", async () => {
      await expect(
        fetcher.fetchAccountInfo(validBech32Address),
      ).rejects.toThrowError(`Account not found: ${validBech32Address}`);
    });
  });

  describe("addUTxOs", () => {
    it("should add valid UTxOs", () => {
      expect(() => fetcher.addUTxOs([sampleUTxO])).not.toThrow();
    });

    it("should throw an error for invalid UTxOs", () => {
      const invalidUTxO = {
        ...sampleUTxO,
        input: { ...sampleUTxO.input, txHash: "invalid_hash" },
      };
      expect(() => fetcher.addUTxOs([invalidUTxO])).toThrowError(
        "Invalid txHash for UTxO at index 0: must be a 64-character hexadecimal string",
      );
    });
  });

  describe("fetchAddressUTxOs", () => {
    it("should fetch UTxOs for an address", async () => {
      fetcher.addUTxOs([sampleUTxO]);
      const utxos = await fetcher.fetchAddressUTxOs(validBech32Address);
      expect(utxos).toEqual([sampleUTxO]);
    });

    it("should return an empty array if no UTxOs are found", async () => {
      const utxos = await fetcher.fetchAddressUTxOs(validBech32Address);
      expect(utxos).toEqual([]);
    });
  });

  describe("addAssetMetadata", () => {
    it("should add valid asset metadata", () => {
      expect(() =>
        fetcher.addAssetMetadata(validAsset, sampleAssetMetadata),
      ).not.toThrow();
    });

    it("should throw an error for invalid asset", () => {
      const invalidAsset = "short_asset";
      expect(() =>
        fetcher.addAssetMetadata(invalidAsset, sampleAssetMetadata),
      ).toThrowError(
        `Invalid asset ${invalidAsset}: must be a string longer than 56 characters`,
      );
    });
  });

  describe("fetchAssetMetadata", () => {
    it("should fetch asset metadata after adding it", async () => {
      fetcher.addAssetMetadata(validAsset, sampleAssetMetadata);
      const metadata = await fetcher.fetchAssetMetadata(validAsset);
      expect(metadata).toEqual(sampleAssetMetadata);
    });

    it("should throw an error if asset metadata is not found", async () => {
      await expect(fetcher.fetchAssetMetadata(validAsset)).rejects.toThrowError(
        `Asset metadata not found: ${validAsset}`,
      );
    });
  });

  describe("addBlock", () => {
    it("should add a valid block", () => {
      expect(() => fetcher.addBlock(sampleBlockInfo)).not.toThrow();
    });

    it("should throw an error for invalid block hash", () => {
      const invalidBlockInfo = { ...sampleBlockInfo, hash: "invalid_hash" };
      expect(() => fetcher.addBlock(invalidBlockInfo)).toThrowError(
        "Invalid block hash: must be a 64-character hexadecimal string",
      );
    });
  });

  describe("fetchBlockInfo", () => {
    it("should fetch block info after adding it", async () => {
      fetcher.addBlock(sampleBlockInfo);
      const blockInfo = await fetcher.fetchBlockInfo(sampleBlockInfo.hash);
      expect(blockInfo).toEqual(sampleBlockInfo);
    });

    it("should throw an error if block info is not found", async () => {
      await expect(
        fetcher.fetchBlockInfo(sampleBlockInfo.hash),
      ).rejects.toThrowError(`Block not found: ${sampleBlockInfo.hash}`);
    });
  });

  describe("addProtocolParameters", () => {
    it("should add valid protocol parameters", () => {
      expect(() =>
        fetcher.addProtocolParameters(sampleProtocolParameters),
      ).not.toThrow();
    });

    it("should throw an error for invalid epoch", () => {
      const invalidParameters = { ...sampleProtocolParameters, epoch: -1 };
      expect(() =>
        fetcher.addProtocolParameters(invalidParameters),
      ).toThrowError("Invalid epoch: must be a non-negative integer");
    });
  });

  describe("fetchProtocolParameters", () => {
    it("should fetch protocol parameters after adding them", async () => {
      fetcher.addProtocolParameters(sampleProtocolParameters);
      const parameters = await fetcher.fetchProtocolParameters(validEpoch);
      expect(parameters).toEqual(sampleProtocolParameters);
    });

    it("should throw an error if protocol parameters are not found", async () => {
      await expect(
        fetcher.fetchProtocolParameters(validEpoch),
      ).rejects.toThrowError(
        `Protocol parameters not found for epoch: ${validEpoch}`,
      );
    });
  });

  describe("addTransaction", () => {
    it("should add a valid transaction", () => {
      expect(() => fetcher.addTransaction(sampleTransactionInfo)).not.toThrow();
    });

    it("should throw an error for invalid transaction hash", () => {
      const invalidTransactionInfo = {
        ...sampleTransactionInfo,
        hash: "invalid_hash",
      };
      expect(() => fetcher.addTransaction(invalidTransactionInfo)).toThrowError(
        "Invalid transaction hash: must be a 64-character hexadecimal string",
      );
    });
  });

  describe("fetchTxInfo", () => {
    it("should fetch transaction info after adding it", async () => {
      fetcher.addTransaction(sampleTransactionInfo);
      const txInfo = await fetcher.fetchTxInfo(sampleTransactionInfo.hash);
      expect(txInfo).toEqual(sampleTransactionInfo);
    });

    it("should throw an error if transaction info is not found", async () => {
      await expect(
        fetcher.fetchTxInfo(sampleTransactionInfo.hash),
      ).rejects.toThrowError(
        `Transaction not found: ${sampleTransactionInfo.hash}`,
      );
    });
  });

  describe("addAssetAddresses", () => {
    it("should add valid asset addresses", () => {
      expect(() =>
        fetcher.addAssetAddresses(validAsset, [sampleAssetAddress]),
      ).not.toThrow();
    });

    it("should throw an error for invalid addresses", () => {
      const invalidAssetAddress = {
        ...sampleAssetAddress,
        address: "invalid_address",
      };
      expect(() =>
        fetcher.addAssetAddresses(validAsset, [invalidAssetAddress]),
      ).toThrowError(
        "Invalid 'address' field at index 0, should be bech32 string",
      );
    });
  });

  describe("fetchAssetAddresses", () => {
    it("should fetch asset addresses after adding them", async () => {
      fetcher.addAssetAddresses(validAsset, [sampleAssetAddress]);
      const addresses = await fetcher.fetchAssetAddresses(validAsset);
      expect(addresses).toEqual([sampleAssetAddress]);
    });

    it("should throw an error if asset addresses are not found", async () => {
      await expect(
        fetcher.fetchAssetAddresses(validAsset),
      ).rejects.toThrowError(`Asset addresses not found: ${validAsset}`);
    });
  });

  describe("addCollectionAssets", () => {
    it("should add valid collection assets", () => {
      expect(() => fetcher.addCollectionAssets([sampleAsset])).not.toThrow();
    });

    it("should throw an error for invalid asset units", () => {
      const invalidAsset = { ...sampleAsset, unit: "short_unit" };
      expect(() => fetcher.addCollectionAssets([invalidAsset])).toThrowError(
        "Invalid unit for asset at index 0: must be a string longer than 56 characters",
      );
    });
  });

  describe("fetchCollectionAssets", () => {
    it("should fetch collection assets after adding them", async () => {
      fetcher.addCollectionAssets([sampleAsset]);
      const { assets, next } =
        await fetcher.fetchCollectionAssets(validPolicyId);
      expect(assets).toEqual([sampleAsset]);
      expect(next).toBeUndefined();
    });

    it("should throw an error if collection is not found", async () => {
      await expect(
        fetcher.fetchCollectionAssets(validPolicyId),
      ).rejects.toThrowError(`Collection not found: ${validPolicyId}`);
    });
  });

  describe("toJSON and fromJSON", () => {
    it("should serialize and deserialize correctly", () => {
      fetcher.addAccount(validBech32Address, sampleAccountInfo);
      fetcher.addUTxOs([sampleUTxO]);
      fetcher.addAssetMetadata(validAsset, sampleAssetMetadata);
      fetcher.addBlock(sampleBlockInfo);
      fetcher.addProtocolParameters(sampleProtocolParameters);
      fetcher.addTransaction(sampleTransactionInfo);
      fetcher.addAssetAddresses(validAsset, [sampleAssetAddress]);
      fetcher.addCollectionAssets([sampleAsset]);

      const json = fetcher.toJSON();
      const newFetcher = OfflineFetcher.fromJSON(json);

      // Test fetch methods
      expect(newFetcher.fetchAccountInfo(validBech32Address)).resolves.toEqual(
        sampleAccountInfo,
      );
      expect(newFetcher.fetchAddressUTxOs(validBech32Address)).resolves.toEqual(
        [sampleUTxO],
      );
      expect(newFetcher.fetchAssetMetadata(validAsset)).resolves.toEqual(
        sampleAssetMetadata,
      );
      expect(newFetcher.fetchBlockInfo(sampleBlockInfo.hash)).resolves.toEqual(
        sampleBlockInfo,
      );
      expect(newFetcher.fetchProtocolParameters(validEpoch)).resolves.toEqual(
        sampleProtocolParameters,
      );
      expect(
        newFetcher.fetchTxInfo(sampleTransactionInfo.hash),
      ).resolves.toEqual(sampleTransactionInfo);
      expect(newFetcher.fetchAssetAddresses(validAsset)).resolves.toEqual([
        sampleAssetAddress,
      ]);
      expect(newFetcher.fetchCollectionAssets(validPolicyId)).resolves.toEqual({
        assets: [sampleAsset],
        next: undefined,
      });
    });
  });

  describe("Error handling in fetch methods", () => {
    it("fetchUTxOs should throw error if no UTxOs are found for txHash", async () => {
      await expect(fetcher.fetchUTxOs(validTxHash)).rejects.toThrowError(
        `No UTxOs found for transaction hash: ${validTxHash}`,
      );
    });

    it("fetchHandleAddress should throw error if handle is invalid", async () => {
      await expect(
        fetcher.fetchHandleAddress("$invalidHandle"),
      ).rejects.toThrow();
    });
  });

  describe("Pagination Tests", () => {
    const totalAssets = 45; // Total number of assets to test pagination
    const pageSize = 20; // Default page size in the paginate method

    let assets: Asset[] = [];

    beforeEach(() => {
      // Generate assets for pagination tests
      assets = [];
      for (let i = 0; i < totalAssets; i++) {
        const assetUnit = validPolicyId + i.toString().padStart(16, "0");
        assets.push({
          unit: assetUnit,
          quantity: "1",
        });
      }
      fetcher.addCollectionAssets(assets);
    });

    it("should return the first page of assets", async () => {
      const { assets: fetchedAssets, next } =
        await fetcher.fetchCollectionAssets(validPolicyId);
      expect(fetchedAssets.length).toBe(pageSize);
      expect(fetchedAssets).toEqual(assets.slice(0, pageSize));
      expect(next).toBe(pageSize); // Next cursor should be the index of the next item
    });

    it("should return the second page of assets using the next cursor", async () => {
      // Fetch the first page to get the 'next' cursor
      const firstPage = await fetcher.fetchCollectionAssets(validPolicyId);
      const nextCursor: number | string | undefined = firstPage.next;

      // Fetch the second page using the next cursor
      const secondPage = await fetcher.fetchCollectionAssets(
        validPolicyId,
        nextCursor,
      );
      expect(secondPage.assets.length).toBe(pageSize);
      expect(secondPage.assets).toEqual(assets.slice(pageSize, pageSize * 2));
      expect(secondPage.next).toBe(pageSize * 2);
    });

    it("should return the last page of assets correctly", async () => {
      // Calculate the cursor for the last page
      const lastPageStartIndex = Math.floor(totalAssets / pageSize) * pageSize;

      const { assets: fetchedAssets, next } =
        await fetcher.fetchCollectionAssets(validPolicyId, lastPageStartIndex);

      const expectedAssets = assets.slice(lastPageStartIndex);

      expect(fetchedAssets.length).toBe(expectedAssets.length);
      expect(fetchedAssets).toEqual(expectedAssets);
      expect(next).toBeUndefined();
    });

    it("should return an empty array if cursor is beyond total assets", async () => {
      const beyondLastIndex = totalAssets + 10;
      const { assets: fetchedAssets, next } =
        await fetcher.fetchCollectionAssets(validPolicyId, beyondLastIndex);
      expect(fetchedAssets.length).toBe(0);
      expect(fetchedAssets).toEqual([]);
      expect(next).toBeUndefined();
    });

    it("should handle invalid cursor gracefully by treating it as zero", async () => {
      const invalidCursor = "invalid_cursor";
      await expect(
        fetcher.fetchCollectionAssets(validPolicyId, invalidCursor),
      ).rejects.toThrow();
    });

    it("should handle custom page sizes", async () => {
      // Modify the fetcher to use a custom page size
      const customPageSize = 15;

      // Monkey-patch the paginate method for this test
      const originalPaginate = (fetcher as any).paginate;
      (fetcher as any).paginate = function (
        items: any[],
        cursor: number | string | undefined,
      ) {
        return originalPaginate.call(this, items, cursor, customPageSize);
      };

      const { assets: fetchedAssets, next } =
        await fetcher.fetchCollectionAssets(validPolicyId);

      expect(fetchedAssets.length).toBe(customPageSize);
      expect(fetchedAssets).toEqual(assets.slice(0, customPageSize));
      expect(next).toBe(customPageSize);
    });
  });

  describe("Validation Tests", () => {
    describe("addAccount", () => {
      it("should throw an error if 'balance' is not a string of digits", () => {
        const invalidAccountInfo = {
          ...sampleAccountInfo,
          balance: "invalid_balance",
        };
        expect(() =>
          fetcher.addAccount(validBech32Address, invalidAccountInfo),
        ).toThrow("Invalid 'balance': must be a string of digits");
      });

      it("should throw an error if 'rewards' is not a string of digits", () => {
        const invalidAccountInfo = { ...sampleAccountInfo, rewards: "-100" };
        expect(() =>
          fetcher.addAccount(validBech32Address, invalidAccountInfo),
        ).toThrow("Invalid 'rewards': must be a string of digits");
      });

      it("should throw an error if 'withdrawals' is not a string of digits", () => {
        const invalidAccountInfo = { ...sampleAccountInfo, withdrawals: "abc" };
        expect(() =>
          fetcher.addAccount(validBech32Address, invalidAccountInfo),
        ).toThrow("Invalid 'withdrawals': must be a string of digits");
      });

      it("should throw an error if 'poolId' is invalid", () => {
        const invalidAccountInfo = {
          ...sampleAccountInfo,
          poolId: "invalid_poolId",
        };
        expect(() =>
          fetcher.addAccount(validBech32Address, invalidAccountInfo),
        ).toThrow("Invalid 'poolId': must be a valid Bech32 pool address");
      });
    });

    describe("addUTxOs", () => {
      it("should throw an error if 'outputIndex' is negative", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          input: { ...sampleUTxO.input, outputIndex: -1 },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid outputIndex for UTxO at index 0: must be a non-negative integer",
        );
      });

      it("should throw an error if 'output.amount' is empty", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          output: { ...sampleUTxO.output, amount: [] },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid amount for UTxO at index 0: must be a non-empty array of assets",
        );
      });

      it("should throw an error if 'unit' in amount is invalid", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          output: {
            ...sampleUTxO.output,
            amount: [{ unit: "invalid_unit", quantity: "1000" }],
          },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid unit for asset at index 0 in UTxO at index 0",
        );
      });

      it("should throw an error if 'quantity' in amount is not a string of digits", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          output: {
            ...sampleUTxO.output,
            amount: [{ unit: "lovelace", quantity: "-1000" }],
          },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid quantity for asset at index 0 in UTxO at index 0: must be a string of digits",
        );
      });

      it("should throw an error if 'dataHash' is invalid", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          output: { ...sampleUTxO.output, dataHash: "invalid_dataHash" },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid dataHash for UTxO at index 0: must be a 64-character hexadecimal string or undefined",
        );
      });

      it("should throw an error if 'plutusData' is invalid", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          output: { ...sampleUTxO.output, plutusData: "invalid_plutusData" },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid plutusData for UTxO at index 0: must be a hexadecimal string or undefined",
        );
      });

      it("should throw an error if 'scriptRef' is invalid", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          output: { ...sampleUTxO.output, scriptRef: "invalid_scriptRef" },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid scriptRef for UTxO at index 0: must be a hexadecimal string or undefined",
        );
      });

      it("should throw an error if 'scriptHash' is invalid", () => {
        const invalidUTxO = {
          ...sampleUTxO,
          output: { ...sampleUTxO.output, scriptHash: "invalid_scriptHash" },
        };
        expect(() => fetcher.addUTxOs([invalidUTxO])).toThrow(
          "Invalid scriptHash for UTxO at index 0: must be a 56-character hexadecimal string or undefined",
        );
      });
    });

    describe("addAssetMetadata", () => {
      it("should throw an error if 'metadata' is not an object", () => {
        expect(() => fetcher.addAssetMetadata(validAsset, null as any)).toThrow(
          "Invalid metadata object",
        );
      });
    });

    describe("addTransaction", () => {
      it("should throw an error if 'index' is negative", () => {
        const invalidTransactionInfo = { ...sampleTransactionInfo, index: -1 };
        expect(() => fetcher.addTransaction(invalidTransactionInfo)).toThrow(
          "Invalid 'index': must be a non-negative integer",
        );
      });

      it("should throw an error if 'fees' is not a string of digits", () => {
        const invalidTransactionInfo = {
          ...sampleTransactionInfo,
          fees: "-5000",
        };
        expect(() => fetcher.addTransaction(invalidTransactionInfo)).toThrow(
          "Invalid 'fees': must be a string of digits",
        );
      });

      it("should throw an error if 'size' is not a positive integer", () => {
        const invalidTransactionInfo = { ...sampleTransactionInfo, size: 0 };
        expect(() => fetcher.addTransaction(invalidTransactionInfo)).toThrow(
          "Invalid 'size': must be a positive integer",
        );
      });

      it("should throw an error if 'deposit' is not an integer string", () => {
        const invalidTransactionInfo = {
          ...sampleTransactionInfo,
          deposit: "invalid_deposit",
        };
        expect(() => fetcher.addTransaction(invalidTransactionInfo)).toThrow(
          "Invalid 'deposit': must be a string representing an integer (positive or negative)",
        );
      });

      it("should throw an error if 'invalidBefore' is invalid", () => {
        const invalidTransactionInfo = {
          ...sampleTransactionInfo,
          invalidBefore: "abc",
        };
        expect(() => fetcher.addTransaction(invalidTransactionInfo)).toThrow(
          "Invalid 'invalidBefore': must be a string of digits or empty string",
        );
      });

      it("should throw an error if 'invalidAfter' is invalid", () => {
        const invalidTransactionInfo = {
          ...sampleTransactionInfo,
          invalidAfter: "-100",
        };
        expect(() => fetcher.addTransaction(invalidTransactionInfo)).toThrow(
          "Invalid 'invalidAfter': must be a string of digits or empty string",
        );
      });
    });

    describe("addBlock", () => {
      it("should throw an error if 'time' is negative", () => {
        const invalidBlockInfo = { ...sampleBlockInfo, time: -1 };
        expect(() => fetcher.addBlock(invalidBlockInfo)).toThrow(
          "Invalid 'time': must be a non-negative integer",
        );
      });

      it("should throw an error if 'epoch' is negative", () => {
        const invalidBlockInfo = { ...sampleBlockInfo, epoch: -1 };
        expect(() => fetcher.addBlock(invalidBlockInfo)).toThrow(
          "Invalid 'epoch': must be a non-negative integer",
        );
      });

      it("should throw an error if 'size' is not a positive integer", () => {
        const invalidBlockInfo = { ...sampleBlockInfo, size: 0 };
        expect(() => fetcher.addBlock(invalidBlockInfo)).toThrow(
          "Invalid 'size': must be a positive integer",
        );
      });

      it("should throw an error if 'txCount' is negative", () => {
        const invalidBlockInfo = { ...sampleBlockInfo, txCount: -1 };
        expect(() => fetcher.addBlock(invalidBlockInfo)).toThrow(
          "Invalid 'txCount': must be a non-negative integer",
        );
      });

      it("should throw an error if 'slotLeader' is invalid", () => {
        const invalidBlockInfo = {
          ...sampleBlockInfo,
          slotLeader: "invalid_slotLeader",
        };
        expect(() => fetcher.addBlock(invalidBlockInfo)).toThrow(
          "Invalid 'slotLeader': must be a bech32 string with pool prefix",
        );
      });

      it("should throw an error if 'VRFKey' is invalid", () => {
        const invalidBlockInfo = {
          ...sampleBlockInfo,
          VRFKey: "invalid_VRFKey",
        };
        expect(() => fetcher.addBlock(invalidBlockInfo)).toThrow(
          "Invalid 'VRFKey': must be a bech32 string with vrf_vk1 prefix",
        );
      });
    });

    describe("addProtocolParameters", () => {
      it("should throw an error if 'minFeeA' is negative", () => {
        const invalidParameters = { ...sampleProtocolParameters, minFeeA: -1 };
        expect(() => fetcher.addProtocolParameters(invalidParameters)).toThrow(
          "Invalid 'minFeeA': must be a non-negative integer",
        );
      });

      it("should throw an error if 'priceMem' is negative", () => {
        const invalidParameters = {
          ...sampleProtocolParameters,
          priceMem: -0.1,
        };
        expect(() => fetcher.addProtocolParameters(invalidParameters)).toThrow(
          "Invalid 'priceMem': must be non-negative",
        );
      });

      it("should throw an error if 'decentralisation' is out of bounds", () => {
        const invalidParametersHigh = {
          ...sampleProtocolParameters,
          decentralisation: 1.1,
        };
        const invalidParametersLow = {
          ...sampleProtocolParameters,
          decentralisation: -0.1,
        };
        expect(() =>
          fetcher.addProtocolParameters(invalidParametersHigh),
        ).toThrow("Invalid 'decentralisation': must be between 0 and 1");
        expect(() =>
          fetcher.addProtocolParameters(invalidParametersLow),
        ).toThrow("Invalid 'decentralisation': must be between 0 and 1");
      });

      it("should throw an error if 'maxTxExMem' is not a string of digits", () => {
        const invalidParameters = {
          ...sampleProtocolParameters,
          maxTxExMem: "invalid_value",
        };
        expect(() => fetcher.addProtocolParameters(invalidParameters)).toThrow(
          "Invalid 'maxTxExMem': must be a string of digits",
        );
      });

      it("should throw an error if 'maxValSize' is negative", () => {
        const invalidParameters = {
          ...sampleProtocolParameters,
          maxValSize: -1,
        };
        expect(() => fetcher.addProtocolParameters(invalidParameters)).toThrow(
          "Invalid 'maxValSize': must be a non-negative integer",
        );
      });
    });

    describe("addAssetAddresses", () => {
      it("should throw an error if 'quantity' is not a string of digits", () => {
        const invalidAssetAddress = {
          ...sampleAssetAddress,
          quantity: "-1000",
        };
        expect(() =>
          fetcher.addAssetAddresses(validAsset, [invalidAssetAddress]),
        ).toThrow(
          "Invalid 'quantity' field at index 0, should be a string of digits",
        );
      });

      it("should throw an error if 'addresses' is empty", () => {
        expect(() => fetcher.addAssetAddresses(validAsset, [])).toThrow(
          "Invalid addresses: must be a non-empty array",
        );
      });
    });

    describe("addCollectionAssets", () => {
      it("should throw an error if 'assets' is empty", () => {
        expect(() => fetcher.addCollectionAssets([])).toThrow(
          "Invalid assets: must be a non-empty array",
        );
      });

      it("should throw an error if 'quantity' is not a string of digits", () => {
        const invalidAsset = { ...sampleAsset, quantity: "-1000" };
        expect(() => fetcher.addCollectionAssets([invalidAsset])).toThrow(
          "Invalid quantity for asset at index 0: must be a string of digits",
        );
      });
    });
  });
});
