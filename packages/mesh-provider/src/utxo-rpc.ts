import type * as spec from "@utxorpc/spec";
import { CardanoQueryClient, CardanoSubmitClient } from "@utxorpc/sdk";
import { submit } from "@utxorpc/spec";

import {
  AccountInfo,
  Action,
  Asset,
  AssetMetadata,
  BlockInfo,
  bytesToHex,
  castProtocol,
  GovernanceProposalInfo,
  hexToBytes,
  IEvaluator,
  IFetcher,
  IFetcherOptions,
  IListener,
  ISubmitter,
  Protocol,
  RedeemerTagType,
  toBytes,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";
import { Address, CardanoSDKUtil } from "@meshsdk/core-cst";

import { utxosToAssets } from "./common/utxos-to-assets";

/**
 * A UTxO RPC Provider for [MeshJS](https://meshjs.dev/) Transaction Builder Library.
 *
 * Example usage of how to use the UTxO RPC provider with Mesh to build and submit a transaction.
 * ```
 * // Step #1
 * // Import Mesh SDK and UTxO RPC provider
 * import { Transaction, MeshWallet, U5CProvider } from "@meshsdk/core";
 *
 * async function main() {
 *   // Step #2
 *   // Create a new U5C provider
 *   const provider = new U5CProvider({
 *     url: "http://localhost:50051",
 *     headers: {
 *       "dmtr-api-key": "<api-key>",
 *     },
 *   });
 *
 *   // Step #3
 *   // Create a new wallet from a mnemonic
 *   const wallet = new MeshWallet({
 *     networkId: 0, // 0: testnet, 1: mainnet
 *     fetcher: provider,
 *     submitter: provider,
 *     key: {
 *       type: "mnemonic",
 *       words: [
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *         "solution",
 *       ],
 *     },
 *   });
 *
 *   // Optional: Print the wallet address
 *   console.log(wallet.getChangeAddress());
 *
 *   // Optional: Print the wallet utxos
 *   console.log(await provider.fetchAddressUTxOs(wallet.getChangeAddress()));
 *
 *   // Step #4
 *   // Create an example transaction that sends 5 ADA to an address
 *   const tx = new Transaction({
 *     initiator: wallet,
 *     verbose: false,
 *   }).sendLovelace(
 *     "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
 *     "5000000"
 *   );
 *   const unsignedTx = await tx.build();
 *
 *   // Step #5
 *   // Sign the transaction
 *   const signedTx = await wallet.signTx(unsignedTx);
 *
 *   // Step #6
 *   // Submit the transaction to the blockchain network
 *   const txId = await provider.submitTx(signedTx);
 *
 *   // Optional: Print the transaction ID
 *   console.log("Transaction ID", txId);
 * }
 *
 * main().catch(console.error);
 * ```
 */
export class U5CProvider
  implements IFetcher, ISubmitter, IEvaluator, IListener {
  // Clients for querying and submitting transactions on the Cardano blockchain.
  private queryClient: CardanoQueryClient;
  private submitClient: CardanoSubmitClient;

  /**
   * Constructor initializes the query and submit clients with provided URL and optional headers.
   * @param url - The base URL for interacting with Cardano nodes.
   * @param headers - Optional HTTP headers for API requests.
   */
  constructor({
    url,
    headers,
  }: {
    url: string;
    headers?: Record<string, string>;
  }) {
    this.queryClient = new CardanoQueryClient({
      uri: url,
      headers,
    });

    this.submitClient = new CardanoSubmitClient({
      uri: url,
      headers,
    });
  }

  /**
   * Allow you to listen to a transaction confirmation. Upon confirmation, the callback will be called.
   * @param txHash - The transaction hash to listen for confirmation
   * @param callback - The callback function to call when the transaction is confirmed
   * @param limit - The number of blocks to wait for confirmation
   */
  onTxConfirmed(txHash: string, callback: () => void, limit = 100): void {
    const onConfirmed = async () => {
      const updates = this.submitClient.waitForTx(hexToBytes(txHash));

      for await (const stage of updates) {
        console.log(JSON.stringify(updates));
        if (stage === submit.Stage.CONFIRMED) {
          callback();
          return; // Exit once confirmed
        }
      }
    };

    const timeoutId = setTimeout(() => {
      // Handle timeout if necessary (e.g., log or notify)
      console.log("Transaction confirmation timed out.");
    }, limit * 5000);

    // Start listening for confirmations and clear timeout on completion.
    onConfirmed().finally(() => clearTimeout(timeoutId));
  }

  /**
   * Evaluates the resources required to execute the transaction
   * @param tx - The transaction to evaluate
   */
  async evaluateTx(tx: string): Promise<Omit<Action, "data">[]> {

    const report = await this.submitClient.evalTx(hexToBytes(tx));
    const evalResult = report.report[0]!.chain.value?.redeemers!;

    const tagMap: { [key: number]: RedeemerTagType } = {
      // 0: "UNSPECIFIED",   // REDEEMER_PURPOSE_UNSPECIFIED
      1: "SPEND",   // REDEEMER_PURPOSE_SPEND
      2: "MINT",    // REDEEMER_PURPOSE_MINT
      3: "CERT",    // REDEEMER_PURPOSE_CERT
      4: "REWARD",  // REDEEMER_PURPOSE_REWARD
      5: "VOTE",    // REDEEMER_PURPOSE_VOTE
      6: "PROPOSE", // REDEEMER_PURPOSE_PROPOSE
    };

    const result: Omit<Action, "data">[] = [];

    evalResult.map((action: spec.cardano.Redeemer) => {
      result.push({
        tag: tagMap[action.purpose!]!,
        index: action.index,
        budget: { mem: Number(action.exUnits!.memory), steps: Number(action.exUnits!.steps) },
      });
    })

    return result;

  }

  /**
   * Submit a serialized transaction to the network.
   * @param tx - The serialized transaction in hex to submit
   * @returns The transaction hash of the submitted transaction
   */
  async submitTx(tx: string): Promise<string> {
    const cbor = toBytes(tx);
    const hash = await this.submitClient.submitTx(cbor);
    return bytesToHex(hash);
  }

  /**
   * Obtain information about a specific stake account.
   * @param address - Wallet address to fetch account information
   */
  fetchAccountInfo(address: string): Promise<AccountInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchAddressAssets(
    address: string,
  ): Promise<{ [key: string]: string }> {
    const utxos = await this.fetchAddressUTxOs(address);
    return utxosToAssets(utxos);
  }

  /**
   * Fetches the UTxOs for a given address.
   * @param address - The address to fetch UTxOs for
   * @param asset - The asset to filter UTxOs by (optional)
   * @returns UTxOs for the given address
   */
  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const addressBytes = hexToBytes(Address.fromBech32(address).toBytes());

    const utxoSearchResult =
      await this.queryClient.searchUtxosByAddress(addressBytes);

    return utxoSearchResult
      .map((item) => {
        const utxo = this._rpcUtxoToMeshUtxo(item.txoRef, item.parsedValued!);

        if (asset) {
          // Check if the output amount contains the specified asset
          if (
            utxo.output.amount.some((amountItem) => amountItem.unit === asset)
          ) {
            return utxo; // Return the utxo if asset matches
          }
          // If the asset does not match, return undefined
          return undefined;
        }

        // If no asset is specified, return the utxo directly
        return utxo;
      })
      .filter((utxo) => utxo !== undefined); // Filter out undefined results
  }

  /**
   * Unimplemented - open for contribution
   *
   * Transactions for an address. The `TransactionInfo` would only return the `hash`, `inputs`, and `outputs`.
   * @param address - The address to fetch transactions for
   * @returns - partial TransactionInfo
   */
  async fetchAddressTxs(
    address: string,
    option: IFetcherOptions = { maxPage: 100, order: "desc" },
  ): Promise<TransactionInfo[]> {
    // open for contribution, see blockfrost.ts for reference
    throw new Error("Method not implemented.");
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches the asset addresses for a given asset.
   * @param asset - The asset to fetch addresses for
   */
  fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    throw new Error("Method not implemented.");
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches the metadata for a given asset.
   * @param asset - The asset to fetch metadata for
   */
  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    throw new Error("Method not implemented.");
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches the block information for a given block hash.
   * @param hash - The block hash to fetch block information for
   */
  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    throw new Error("Method not implemented.");
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches the collection assets for a given policy ID.
   * @param policyId - The policy ID to fetch collection assets for
   * @param cursor - The cursor to fetch the next set of assets (optional)
   */
  fetchCollectionAssets(
    policyId: string,
    cursor?: number | string,
  ): Promise<{ assets: Asset[]; next?: string | number | null }> {
    throw new Error("Method not implemented.");
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches the information (AssetMetadata) for a given handle.
   * @param handle - The handle to fetch information for
   */
  fetchHandle(handle: string): Promise<object> {
    throw new Error("Method not implemented.");
  }

  /**
   * Unimplemented - open for contribution
   *
   * Resolve the handle's address from the handle.
   * @param handle - The handle to resolve
   */
  fetchHandleAddress(handle: string): Promise<string> {
    throw new Error("Method not implemented.");
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches protocol parameters
   */
  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
    const rpcPParams = await this.queryClient.readParams();
    if (rpcPParams === undefined || rpcPParams === null) {
      throw new Error(`Error fetching protocol parameters`);
    }
    return this._rpcPParamsToProtocol(rpcPParams);
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches transaction info for a given hash.
   * @param hash - The transaction hash
   */
  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    throw new Error("Method not implemented.");
  }

  /**
   * Not complete - open for contribution
   *
   * Fetches output UTxOs of a given transaction hash.
   * @param hash - The transaction hash
   */
  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    const utxoSearchResult = await this.queryClient.readUtxosByOutputRef(
      [{
        txHash: hexToBytes(hash),
        outputIndex: index || 0,    // TODO: handle case when index is not provided. Note: readUtxos might not support this, try when readTx is implemented
      }]
    );
    return utxoSearchResult.map((item) => {
      return this._rpcUtxoToMeshUtxo(item.txoRef, item.parsedValued!);
    });
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches the governance proposal information.
   * @param txHash The transaction hash of the proposal
   * @param certIndex The certificate index of the proposal
   * @returns The governance proposal information
   */
  async fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error("Method not implemented");
  }

  /**
   * Unimplemented - open for contribution
   *
   * @param url
   */
  get(url: string): Promise<any> {
    throw new Error("Method not implemented.");
  }

  /**
   * Waits for transaction confirmation within a given timeout.
   * @param txId - The transaction hash.
   * @param timeout - Optional timeout in milliseconds.
   * @returns True if the transaction is confirmed within the timeout, otherwise false.
   */
  awaitTransactionConfirmation(
    txId: string,
    timeout?: number,
  ): Promise<boolean> {
    const onConfirmed = (async () => {
      const updates = this.submitClient.waitForTx(hexToBytes(txId));

      for await (const stage of updates) {
        if (stage == submit.Stage.CONFIRMED) {
          return true;
        }
      }

      return false;
    })();

    const onTimeout: Promise<boolean> = new Promise((resolve) =>
      setTimeout(() => resolve(false), timeout),
    );

    return Promise.race([onConfirmed, onTimeout]);
  }

  /**
   * Helper function to convert an RPC UTxO object to a Mesh UTxO object.
   * @param rpcTxoRef - The transaction output reference from RPC.
   * @param rpcTxOutput - The transaction output details from RPC.
   * @returns A formatted UTxO object.
   */
  private _rpcUtxoToMeshUtxo(
    rpcTxoRef: spec.query.TxoRef,
    rpcTxOutput: spec.cardano.TxOutput,
  ): UTxO {
    const amount: Asset[] = [
      {
        unit: "lovelace",
        quantity: rpcTxOutput.coin.toString(),
      },
    ];
    rpcTxOutput.assets.forEach((ma) => {
      ma.assets.forEach((asset) => {
        amount.push({
          unit:
            Buffer.from(ma.policyId).toString("hex") +
            Buffer.from(asset.name).toString("hex"),
          quantity: asset.outputCoin.toString(),
        });
      });
    });

    let dataHash: string | undefined = undefined;
    let plutusData: string | undefined = undefined;

    if (rpcTxOutput.datum !== undefined) {
      if (
        rpcTxOutput.datum?.originalCbor &&
        rpcTxOutput.datum.originalCbor.length > 0
      ) {
        dataHash = Buffer.from(rpcTxOutput.datum.hash).toString("hex");
        plutusData = Buffer.from(rpcTxOutput.datum.originalCbor).toString(
          "hex",
        );
      } else if (rpcTxOutput.datum?.hash && rpcTxOutput.datum.hash.length > 0) {
        dataHash = Buffer.from(rpcTxOutput.datum.hash).toString("hex");
      }
    }

    let scriptRef: string | undefined = undefined;
    let scriptHash: string | undefined = undefined;

    if (rpcTxOutput.script !== undefined) {
      // TODO: Implement scriptRef
      // TODO: Implement scriptHash
    }

    return {
      input: {
        outputIndex: rpcTxoRef.index,
        txHash: Buffer.from(rpcTxoRef.hash).toString("hex"),
      },
      output: {
        address: Address.fromBytes(
          CardanoSDKUtil.HexBlob.fromBytes(rpcTxOutput.address),
        ).toBech32(),
        amount: amount,
        dataHash: dataHash,
        plutusData: plutusData,
        scriptRef: scriptRef,
        scriptHash: scriptHash,
      },
    };
  }

  /**
   * Converts RPC protocol parameters to a Mesh Protocol object.
   * @param rpcPParams - The protocol parameters from the RPC.
   * @returns A Protocol object.
   */
  private _rpcPParamsToProtocol(rpcPParams: spec.cardano.PParams): Protocol {
    return castProtocol({
      coinsPerUtxoSize: Number(rpcPParams.coinsPerUtxoByte),
      collateralPercent: Number(rpcPParams.collateralPercentage),
      decentralisation: 0, // Deprecated in Babbage era.
      keyDeposit: Number(rpcPParams.stakeKeyDeposit),
      maxBlockExMem: Number(rpcPParams.maxExecutionUnitsPerBlock?.memory),
      maxBlockExSteps: Number(rpcPParams.maxExecutionUnitsPerBlock?.steps),
      maxBlockHeaderSize: Number(rpcPParams.maxBlockHeaderSize),
      maxBlockSize: Number(rpcPParams.maxBlockBodySize),
      maxCollateralInputs: Number(rpcPParams.maxCollateralInputs),
      maxTxExMem: Number(rpcPParams.maxExecutionUnitsPerTransaction?.memory),
      maxTxExSteps: Number(rpcPParams.maxExecutionUnitsPerTransaction?.steps),
      maxTxSize: Number(rpcPParams.maxTxSize),
      maxValSize: Number(rpcPParams.maxValueSize),
      minFeeA: Number(rpcPParams.minFeeCoefficient),
      minFeeB: Number(rpcPParams.minFeeConstant),
      minPoolCost: Number(rpcPParams.minPoolCost),
      poolDeposit: Number(rpcPParams.poolDeposit),
      priceMem: Number(rpcPParams.prices?.memory),
      priceStep: Number(rpcPParams.prices?.steps),
    });
  }
}
