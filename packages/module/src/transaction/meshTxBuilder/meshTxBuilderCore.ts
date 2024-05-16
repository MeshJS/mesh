import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_REDEEMER_BUDGET,
} from '@mesh/common/constants';
import {
  Action,
  Asset,
  Data,
  LanguageVersion,
  Protocol,
  UTxO,
  PoolParams,
} from '@mesh/types';
import {
  MintItem,
  TxIn,
  PubKeyTxIn,
  MeshTxBuilderBody,
  RefTxIn,
  Output,
  BuilderData,
  TxInParameter,
} from './type';
import JSONbig from 'json-bigint';
import { CSLSerializer, IMeshSerializer } from '@mesh/serializer/serializer';

export class MeshTxBuilderCore {
  txHex = '';
  txEvaluationMultiplier = 1.1;
  private _protocolParams: Protocol = DEFAULT_PROTOCOL_PARAMETERS;
  serializer: IMeshSerializer = new CSLSerializer(this._protocolParams);
  private txOutput?: Output;
  private addingScriptInput = false;
  private addingPlutusMint = false;
  protected isHydra = false;

  meshTxBuilderBody: MeshTxBuilderBody;

  protected mintItem?: MintItem;

  protected txInQueueItem?: TxIn;

  protected collateralQueueItem?: PubKeyTxIn;

  protected refScriptTxInQueueItem?: RefTxIn;

  /**
   * Reset everything in the MeshTxBuilder instance
   * @returns The MeshTxBuilder instance
   */
  reset = () => {
    this.txHex = '';
    this.txEvaluationMultiplier = 1.1;
    this._protocolParams = DEFAULT_PROTOCOL_PARAMETERS;
    this.txOutput = undefined;
    this.addingScriptInput = false;
    this.addingPlutusMint = false;
    this.mintItem = undefined;
    this.txInQueueItem = undefined;
    this.collateralQueueItem = undefined;
    this.refScriptTxInQueueItem = undefined;
    this.meshTxBuilderBody = this.emptyTxBuilderBody();
    return this;
  };

  /**
   * Make an empty transaction body for building transaction in object
   * @returns An empty transaction body
   */
  emptyTxBuilderBody = (): MeshTxBuilderBody => ({
    inputs: [],
    outputs: [],
    extraInputs: [],
    selectionThreshold: 0,
    collaterals: [],
    requiredSignatures: [],
    referenceInputs: [],
    mints: [],
    changeAddress: '',
    metadata: [],
    validityRange: {},
    certificates: [],
    signingKey: [],
  });

  constructor(serializer?: IMeshSerializer) {
    this.meshTxBuilderBody = this.emptyTxBuilderBody();
    if (serializer) {
      this.serializer = serializer;
    }
  }

  /**
   * Synchronous functions here
   */

  /**
   * It builds the transaction without dependencies
   * @param customizedTx The optional customized transaction body
   * @returns The signed transaction in hex ready to submit / signed by client
   */
  completeSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      this.queueAllLastItem();
    }
    let params = DEFAULT_PROTOCOL_PARAMETERS;
    if (this.isHydra) {
      params = {
        ...params,
        minFeeA: 0,
        minFeeB: 0,
        priceMem: 0,
        priceStep: 0,
        collateralPercent: 0,
        coinsPerUTxOSize: '0',
      };
    }
    return this.serializer.serializeTxBody(this.meshTxBuilderBody, params);
  };

  /**
   * Complete the signing process
   * @returns The signed transaction in hex
   */
  completeSigning = () => {
    const { signingKey } = this.meshTxBuilderBody;
    this.txHex = this.serializer.addSigningKeys(this.txHex, signingKey);
    return this.txHex;
  };

  /**
   * Set the input for transaction
   * @param txHash The transaction hash of the input UTxO
   * @param txIndex The transaction index of the input UTxO
   * @param amount The asset amount of index of the input UTxO
   * @param address The address of the input UTxO
   * @returns The MeshTxBuilder instance
   */
  txIn = (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ) => {
    if (this.txInQueueItem) {
      this.queueInput();
    }
    if (!this.addingScriptInput) {
      this.txInQueueItem = {
        type: 'PubKey',
        txIn: {
          txHash: txHash,
          txIndex: txIndex,
          amount: amount,
          address: address,
        },
      };
    } else {
      this.txInQueueItem = {
        type: 'Script',
        txIn: {
          txHash: txHash,
          txIndex: txIndex,
          amount: amount,
          address: address,
        },
        scriptTxIn: {},
      };
    }
    this.addingScriptInput = false;
    return this;
  };

  /**
   * Set the script for transaction input
   * @param {string} scriptCbor The CborHex of the script
   * @param version Optional - The Plutus script version
   * @returns The MeshTxBuilder instance
   */
  txInScript = (scriptCbor: string, version: LanguageVersion = 'V2') => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error('Datum value attempted to be called a non script input');
    this.txInQueueItem.scriptTxIn.scriptSource = {
      type: 'Provided',
      script: {
        code: scriptCbor,
        version,
      },
    };
    return this;
  };

  /**
   * Set the input datum for transaction input
   * @param datum The datum in Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @param type The datum type, either Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @returns The MeshTxBuilder instance
   */
  txInDatumValue = (
    datum: BuilderData['content'],
    type: BuilderData['type'] = 'Mesh'
  ) => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error('Datum value attempted to be called a non script input');

    let content = datum;
    if (type === 'JSON') {
      content = this.castRawDataToJsonString(datum as object | string);
    }
    if (type === 'Mesh') {
      this.txInQueueItem.scriptTxIn.datumSource = {
        type: 'Provided',
        data: {
          type,
          content: datum as Data,
        },
      };
      return this;
    }
    this.txInQueueItem.scriptTxIn.datumSource = {
      type: 'Provided',
      data: {
        type,
        content: content as string,
      },
    };
    return this;
  };

  /**
   * Tell the transaction builder that the input UTxO has inlined datum
   * @returns The MeshTxBuilder instance
   */
  txInInlineDatumPresent = () => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error(
        'Inline datum present attempted to be called a non script input'
      );
    const { txHash, txIndex } = this.txInQueueItem.txIn;
    if (txHash && txIndex.toString()) {
      this.txInQueueItem.scriptTxIn.datumSource = {
        type: 'Inline',
        txHash,
        txIndex,
      };
    }
    return this;
  };

  // /**
  //  * Native script - Set the reference input where it would also be spent in the transaction
  //  * @param txHash The transaction hash of the reference UTxO
  //  * @param txIndex The transaction index of the reference UTxO
  //  * @param spendingScriptHash The script hash of the spending script
  //  * @returns The MeshTxBuilder instance
  //  */
  // simpleScriptTxInReference = (
  //   txHash: string,
  //   txIndex: number,
  //   spendingScriptHash?: string
  // ) => {
  //   if (!this.txInQueueItem) throw Error('Undefined input');
  //   if (this.txInQueueItem.type === 'PubKey')
  //     throw Error(
  //       'Spending tx in reference attempted to be called a non script input'
  //     );
  //   this.txInQueueItem.scriptTxIn.scriptSource = {
  //     type: 'Inline',
  //     txInInfo: {
  //       txHash,
  //       txIndex,
  //       spendingScriptHash,
  //     },
  //   };
  //   return this;
  // };

  /**
   * Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @param exUnits The execution units budget for the redeemer
   * @param type The redeemer data type, either Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @returns The MeshTxBuilder instance
   */
  txInRedeemerValue = (
    redeemer: BuilderData['content'],
    exUnits = { ...DEFAULT_REDEEMER_BUDGET },
    type: BuilderData['type'] = 'Mesh'
  ) => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error(
        'Spending tx in reference redeemer attempted to be called a non script input'
      );
    let content = redeemer;
    if (type === 'Mesh') {
      this.txInQueueItem.scriptTxIn.redeemer = {
        data: {
          type,
          content: redeemer as Data,
        },
        exUnits,
      };
      return this;
    }
    if (type === 'JSON') {
      content = this.castRawDataToJsonString(redeemer as object | string);
    }
    this.txInQueueItem.scriptTxIn.redeemer = {
      data: {
        type,
        content: content as string,
      },
      exUnits,
    };
    return this;
  };

  /**
   * Set the output for transaction
   * @param {string} address The recipient of the output
   * @param {Asset[]} amount The amount of other native assets attached with UTxO
   * @returns The MeshTxBuilder instance
   */
  txOut = (address: string, amount: Asset[]) => {
    if (this.txOutput) {
      this.meshTxBuilderBody.outputs.push(this.txOutput);
      this.txOutput = undefined;
    }
    this.txOutput = {
      address,
      amount,
    };
    return this;
  };

  /**
   * Set the output datum hash for transaction
   * @param datum The datum in Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @param type The datum type, either Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @returns The MeshTxBuilder instance
   */
  txOutDatumHashValue = (
    datum: BuilderData['content'],
    type: BuilderData['type'] = 'Mesh'
  ) => {
    let content = datum;
    if (this.txOutput) {
      if (type === 'Mesh') {
        this.txOutput.datum = {
          type: 'Hash',
          data: {
            type,
            content: content as Data,
          },
        };
        return this;
      }
      if (type === 'JSON') {
        content = this.castRawDataToJsonString(datum as object | string);
      }
      this.txOutput.datum = {
        type: 'Hash',
        data: {
          type,
          content: content as string,
        },
      };
    }
    return this;
  };

  /**
   * Set the output inline datum for transaction
   * @param datum The datum in Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @param type The datum type, either Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @returns The MeshTxBuilder instance
   */
  txOutInlineDatumValue = (
    datum: BuilderData['content'],
    type: BuilderData['type'] = 'Mesh'
  ) => {
    let content = datum;
    if (this.txOutput) {
      if (type === 'Mesh') {
        this.txOutput.datum = {
          type: 'Inline',
          data: {
            type,
            content: content as Data,
          },
        };
        return this;
      }
      if (type === 'JSON') {
        content = this.castRawDataToJsonString(datum as object | string);
      }
      this.txOutput.datum = {
        type: 'Inline',
        data: {
          type,
          content: content as string,
        },
      };
    }
    return this;
  };

  /**
   * Set the reference script to be attached with the output
   * @param scriptCbor The CBOR hex of the script to be attached to UTxO as reference script
   * @param version Optional - The Plutus script version
   * @returns The MeshTxBuilder instance
   */
  txOutReferenceScript = (
    scriptCbor: string,
    version: LanguageVersion = 'V2'
  ) => {
    if (this.txOutput) {
      this.txOutput.referenceScript = { code: scriptCbor, version };
    }
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus spending scripts
   * @returns The MeshTxBuilder instance
   */
  spendingPlutusScriptV2 = () => {
    // This flag should signal a start to a script input
    // The next step after will be to add a tx-in
    // After which, we will REQUIRE, script, datum and redeemer info
    // for unlocking this particular input
    this.addingScriptInput = true;
    return this;
  };

  /**
   * Set the reference input where it would also be spent in the transaction
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @param spendingScriptHash The script hash of the spending script
   * @returns The MeshTxBuilder instance
   */
  spendingTxInReference = (
    txHash: string,
    txIndex: number,
    spendingScriptHash?: string,
    version: LanguageVersion = 'V2'
  ) => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error(
        'Spending tx in reference attempted to be called a non script input'
      );
    this.txInQueueItem.scriptTxIn.scriptSource = {
      type: 'Inline',
      txInInfo: {
        txHash,
        txIndex,
        spendingScriptHash,
        version,
      },
    };
    return this;
  };

  /**
   * [Alias of txInInlineDatumPresent] Set the instruction that the reference input has inline datum
   * @returns The MeshTxBuilder instance
   */
  // Unsure how this is different from the --tx-in-inline-datum-present flag
  // It seems to just be different based on if the script is a reference input
  spendingReferenceTxInInlineDatumPresent = () => {
    this.txInInlineDatumPresent();
    return this;
  };

  /**
   * [Alias of txInRedeemerValue] Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @param exUnits The execution units budget for the redeemer
   * @param type The redeemer data type, either Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @returns The MeshTxBuilder instance
   */
  spendingReferenceTxInRedeemerValue = (
    redeemer: BuilderData['content'],
    exUnits = { ...DEFAULT_REDEEMER_BUDGET },
    type: BuilderData['type'] = 'Mesh'
  ) => {
    this.txInRedeemerValue(redeemer, exUnits, type);
    return this;
  };

  /**
   * Specify a read only reference input. This reference input is not witnessing anything it is simply provided in the plutus script context.
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @returns The MeshTxBuilder instance
   */
  readOnlyTxInReference = (txHash: string, txIndex: number) => {
    this.meshTxBuilderBody.referenceInputs.push({ txHash, txIndex });
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus minting scripts
   * @returns The MeshTxBuilder instance
   */
  mintPlutusScriptV2 = () => {
    this.addingPlutusMint = true;
    return this;
  };

  /**
   * Set the minting value of transaction
   * @param quantity The quantity of asset to be minted
   * @param policy The policy id of the asset to be minted
   * @param name The hex of token name of the asset to be minted
   * @returns The MeshTxBuilder instance
   */
  mint = (quantity: string, policy: string, name: string) => {
    if (this.mintItem) {
      this.queueMint();
    }
    this.mintItem = {
      type: this.addingPlutusMint ? 'Plutus' : 'Native',
      policyId: policy,
      assetName: name,
      amount: quantity,
    };
    this.addingPlutusMint = false;
    return this;
  };

  /**
   * Set the minting script of current mint
   * @param scriptCBOR The CBOR hex of the minting policy script
   * @param version Optional - The Plutus script version
   * @returns The MeshTxBuilder instance
   */
  mintingScript = (scriptCBOR: string, version: LanguageVersion = 'V2') => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (!this.mintItem.type) throw Error('Mint information missing');
    this.mintItem.scriptSource = {
      type: 'Provided',
      script: { code: scriptCBOR, version },
    };
    return this;
  };

  /**
   * Use reference script for minting
   * @param txHash The transaction hash of the UTxO
   * @param txIndex The transaction index of the UTxO
   * @returns The MeshTxBuilder instance
   */
  mintTxInReference = (
    txHash: string,
    txIndex: number,
    version: LanguageVersion = 'V2'
  ) => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (!this.mintItem.type) throw Error('Mint information missing');
    if (this.mintItem.type == 'Native') {
      throw Error(
        'Mint tx in reference can only be used on plutus script tokens'
      );
    }
    if (!this.mintItem.policyId)
      throw Error('PolicyId information missing from mint asset');
    this.mintItem.scriptSource = {
      type: 'Reference Script',
      txHash,
      txIndex,
      version,
    };
    return this;
  };

  /**
   * Set the redeemer for minting
   * @param redeemer The redeemer in Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @param exUnits The execution units budget for the redeemer
   * @param type The redeemer data type, either Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @returns The MeshTxBuilder instance
   */
  mintReferenceTxInRedeemerValue = (
    redeemer: BuilderData['content'],
    exUnits = { ...DEFAULT_REDEEMER_BUDGET },
    type: BuilderData['type'] = 'Mesh'
  ) => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (this.mintItem.type == 'Native') {
      throw Error(
        'Mint tx in reference can only be used on plutus script tokens'
      );
    } else if (this.mintItem.type == 'Plutus') {
      if (!this.mintItem.policyId)
        throw Error('PolicyId information missing from mint asset');
      let content = redeemer;
      if (type === 'Mesh') {
        this.mintItem.redeemer = {
          data: {
            type,
            content: content as Data,
          },
          exUnits,
        };
        return this;
      }
      if (type === 'JSON') {
        content = this.castRawDataToJsonString(redeemer as object | string);
      }
      this.mintItem.redeemer = {
        data: {
          type,
          content: content as string,
        },
        exUnits,
      };
    }
    return this;
  };

  /**
   * Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @param exUnits The execution units budget for the redeemer
   * @param type The redeemer data type, either Mesh Data type, JSON in raw constructor like format, or CBOR hex string
   * @returns The MeshTxBuilder instance
   */
  mintRedeemerValue = (
    redeemer: BuilderData['content'],
    exUnits = { ...DEFAULT_REDEEMER_BUDGET },
    type: BuilderData['type'] = 'Mesh'
  ) => {
    this.mintReferenceTxInRedeemerValue(redeemer, exUnits, type);
    return this;
  };

  /**
   * Set the required signer of the transaction
   * @param pubKeyHash The PubKeyHash of the required signer
   * @returns The MeshTxBuilder instance
   */
  requiredSignerHash = (pubKeyHash: string) => {
    this.meshTxBuilderBody.requiredSignatures.push(pubKeyHash);
    return this;
  };

  /**
   * Set the collateral UTxO for the transaction
   * @param txHash The transaction hash of the collateral UTxO
   * @param txIndex The transaction index of the collateral UTxO
   * @param amount The asset amount of index of the collateral UTxO
   * @param address The address of the collateral UTxO
   * @returns The MeshTxBuilder instance
   */
  txInCollateral = (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ) => {
    if (this.collateralQueueItem) {
      this.meshTxBuilderBody.collaterals.push(this.collateralQueueItem);
    }
    this.collateralQueueItem = {
      type: 'PubKey',
      txIn: {
        txHash: txHash,
        txIndex: txIndex,
        amount,
        address,
      },
    };
    return this;
  };

  /**
   * Creates a pool registration certificate, and adds it to the transaction
   * @param poolParams Parameters for pool registration
   * @returns The MeshTxBuilder instance
   */
  registerPoolCertificate = (poolParams: PoolParams) => {
    this.meshTxBuilderBody.certificates.push({
      type: 'RegisterPool',
      poolParams,
    });
    return this;
  };

  /**
   * Creates a stake registration certificate, and adds it to the transaction
   * @param stakeKeyHash The keyHash of the stake key
   * @returns The MeshTxBuilder instance
   */
  registerStakeCertificate = (stakeKeyHash: string) => {
    this.meshTxBuilderBody.certificates.push({
      type: 'RegisterStake',
      stakeKeyHash,
    });
    return this;
  };

  /**
   * Creates a stake delegation certificate, and adds it to the transaction
   * This will delegate stake from the corresponding stake address to the pool
   * @param stakeKeyHash The keyHash of the stake key
   * @param poolId poolId can be in either bech32 or hex form
   * @returns The MeshTxBuilder instance
   */
  delegateStakeCertificate = (stakeKeyHash: string, poolId: string) => {
    this.meshTxBuilderBody.certificates.push({
      type: 'DelegateStake',
      stakeKeyHash,
      poolId,
    });
    return this;
  };

  /**
   * Creates a stake deregister certificate, and adds it to the transaction
   * @param stakeKeyHash The keyHash of the stake key
   * @returns The MeshTxBuilder instance
   */
  deregisterStakeCertificate = (stakeKeyHash: string) => {
    this.meshTxBuilderBody.certificates.push({
      type: 'DeregisterStake',
      stakeKeyHash,
    });
    return this;
  };

  /**
   * Creates a pool retire certificate, and adds it to the transaction
   * @param poolId poolId can be in either bech32 or hex form
   * @param epoch The intended epoch to retire the pool
   * @returns The MeshTxBuilder instance
   */
  retirePoolCertificate = (poolId: string, epoch: number) => {
    this.meshTxBuilderBody.certificates.push({
      type: 'RetirePool',
      poolId,
      epoch,
    });
    return this;
  };

  /**
   * Configure the address to accept change UTxO
   * @param addr The address to accept change UTxO
   * @returns The MeshTxBuilder instance
   */
  changeAddress = (addr: string) => {
    this.meshTxBuilderBody.changeAddress = addr;
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only after the slot
   * @param slot The transaction is valid only after this slot
   * @returns The MeshTxBuilder instance
   */
  invalidBefore = (slot: number) => {
    this.meshTxBuilderBody.validityRange.invalidBefore = slot;
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only before the slot
   * @param slot The transaction is valid only before this slot
   * @returns The MeshTxBuilder instance
   */
  invalidHereafter = (slot: number) => {
    this.meshTxBuilderBody.validityRange.invalidHereafter = slot;
    return this;
  };

  /**
   * Add metadata to the transaction
   * @param tag The tag of the metadata
   * @param metadata The metadata in object format
   * @returns The MeshTxBuilder instance
   */
  metadataValue = <T extends object>(tag: string, metadata: T) => {
    this.meshTxBuilderBody.metadata.push({ tag, metadata });
    return this;
  };

  /**
   * Set the protocol parameters to be used for the transaction other than the default one
   * @param params (Part of) the protocol parameters to be used for the transaction
   * @returns The MeshTxBuilder instance
   */
  protocolParams = (params: Partial<Protocol>) => {
    const updatedParams = { ...DEFAULT_PROTOCOL_PARAMETERS, ...params };
    this._protocolParams = updatedParams;
    return this;
  };

  /**
   * Sign the transaction with the private key
   * @param skeyHex The private key in cborHex (with or without 5820 prefix, i.e. the format when generated from cardano-cli)
   * @returns
   */
  signingKey = (skeyHex: string) => {
    this.meshTxBuilderBody.signingKey.push(skeyHex);
    return this;
  };

  /**
   * EXPERIMENTAL - Selects utxos to fill output value and puts them into inputs
   * @param extraInputs The inputs already placed into the object will remain, these extra inputs will be used to fill the remaining  value needed
   * @param threshold Extra value needed to be selected for, usually for paying fees and min UTxO value of change output
   */
  selectUtxosFrom = (extraInputs: UTxO[], threshold = 5000000) => {
    this.meshTxBuilderBody.extraInputs = extraInputs;
    this.meshTxBuilderBody.selectionThreshold = threshold;
    return this;
  };

  private queueInput = () => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'Script') {
      if (!this.txInQueueItem.scriptTxIn) {
        throw Error(
          'Script input does not contain script, datum, or redeemer information'
        );
      } else {
        if (!this.txInQueueItem.scriptTxIn.datumSource)
          throw Error('Script input does not contain datum information');
        if (!this.txInQueueItem.scriptTxIn.redeemer)
          throw Error('Script input does not contain redeemer information');
        if (!this.txInQueueItem.scriptTxIn.scriptSource)
          throw Error('Script input does not contain script information');
      }
    }
    this.meshTxBuilderBody.inputs.push(this.txInQueueItem);
    this.txInQueueItem = undefined;
  };

  private queueMint = () => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (!this.mintItem.scriptSource)
      throw Error('Missing mint script information');
    this.meshTxBuilderBody.mints.push(this.mintItem);
    this.mintItem = undefined;
  };

  // Below protected functions for completing tx building

  protected removeDuplicateInputs = () => {
    const inputs = this.meshTxBuilderBody.inputs;
    const getTxInId = (txIn: TxInParameter): string => {
      return `${txIn.txHash}#${txIn.txIndex}`;
    };
    const addedInputs: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const currentTxInId = getTxInId(inputs[i].txIn);
      if (addedInputs.includes(currentTxInId)) {
        inputs.splice(i, 1);
        i--;
      } else {
        addedInputs.push(currentTxInId);
      }
    }
  };

  protected queueAllLastItem = () => {
    if (this.txOutput) {
      this.meshTxBuilderBody.outputs.push(this.txOutput);
      this.txOutput = undefined;
    }
    if (this.txInQueueItem) {
      this.queueInput();
    }
    if (this.collateralQueueItem) {
      this.meshTxBuilderBody.collaterals.push(this.collateralQueueItem);
      this.collateralQueueItem = undefined;
    }
    if (this.mintItem) {
      this.queueMint();
    }
  };

  protected updateRedeemer = (
    meshTxBuilderBody: MeshTxBuilderBody,
    txEvaluation: Omit<Action, 'data'>[]
  ) => {
    txEvaluation.forEach((redeemerEvaluation) => {
      switch (redeemerEvaluation.tag) {
        case 'SPEND': {
          const input = meshTxBuilderBody.inputs[redeemerEvaluation.index];
          if (input.type == 'Script' && input.scriptTxIn.redeemer) {
            input.scriptTxIn.redeemer.exUnits.mem = Math.floor(
              redeemerEvaluation.budget.mem * this.txEvaluationMultiplier
            );
            input.scriptTxIn.redeemer.exUnits.steps = Math.floor(
              redeemerEvaluation.budget.steps * this.txEvaluationMultiplier
            );
          }
          break;
        }
        case 'MINT': {
          const mint = meshTxBuilderBody.mints[redeemerEvaluation.index];
          if (mint.type == 'Plutus' && mint.redeemer) {
            mint.redeemer.exUnits.mem = Math.floor(
              redeemerEvaluation.budget.mem * this.txEvaluationMultiplier
            );
            mint.redeemer.exUnits.steps = Math.floor(
              redeemerEvaluation.budget.steps * this.txEvaluationMultiplier
            );
          }
          break;
        }
        case 'CERT':
          // TODO
          break;
        case 'REWARD':
          // TODO
          break;
      }
    });
  };

  protected castRawDataToJsonString = (rawData: object | string) => {
    if (typeof rawData === 'object') {
      return JSONbig.stringify(rawData);
    } else {
      return rawData as string;
    }
  };
}
