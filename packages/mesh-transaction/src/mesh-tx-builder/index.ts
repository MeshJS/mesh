import JSONBig from "json-bigint";

import {
  CachedFetcher,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  EvaluationContext,
  IEvaluator,
  IFetcher,
  IMeshTxSerializer,
  ISubmitter,
  MeshTxBuilderBody,
  Network,
  NetworkConfig,
  NetworkInput,
  Output,
  Protocol,
  ScriptSource,
  SimpleScriptSourceInfo,
  TxIn,
  UTxO,
} from "@meshsdk/common";
import {
  CardanoSDKSerializer,
  CardanoSDKUtil,
  Address as CstAddress,
  Script as CstScript,
  getTransactionOutputs,
  OfflineEvaluatorScalus,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";

import type {
  BuildOptions,
  BuiltTx,
  DeclaredOutputs,
} from "../tx-builder/builder";
import type { BodyParts } from "./body-parts";
import type { IInputSelector } from "./coin-selection/coin-selection-interface";
import { assembleTxPrototype } from "../tx-builder/assemble";
import { refScriptSize } from "../tx-builder/balance";
import { DECLARED_OUTPUTS, TxBuilder } from "../tx-builder/builder";
import { TxBuildError } from "../tx-builder/errors";
import {
  exUnitsFee,
  minCoin,
  prototypeExUnits,
  refScriptFee,
} from "../tx-builder/fee";
import { voterKey } from "../tx-builder/ordering";
import { placeholderWitnesses, pricedSigners } from "../tx-builder/witnesses";
import { bodyToParts, toOutputPart } from "./body-parts";
import { LargestFirstInputSelector } from "./coin-selection";
import { MeshTxBuilderCore } from "./tx-builder-core";
import { warnOnce } from "./warnings";

export interface MeshTxBuilderOptions {
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  /**
   * Computes the execution units of the transaction's scripts. Left out, the builder evaluates
   * locally with Scalus (`OfflineEvaluatorScalus`) if it has a `fetcher` to resolve inputs with.
   * `null` turns evaluation off: redeemers keep the units declared on them.
   */
  evaluator?: IEvaluator | null;
  /**
   * The network the transaction is for, taken before the network the fetcher states and before
   * a `setNetwork()` string. Without any, mainnet is assumed for a mainnet change address. The
   * default evaluator needs a network to evaluate a transaction with a validity interval.
   */
  network?: Network;
  /**
   * Mesh's serializers only: `CardanoSDKSerializer` (the default) or `CSLSerializer`; any other
   * object is INVALID_OPTION. It signs in `completeSigning()`; the transaction itself is encoded
   * by the builder, whichever of the two is given
   */
  serializer?: IMeshTxSerializer;
  /**
   * A `LargestFirstInputSelector` or nothing, both meaning the builder's own selection; any
   * other object is INVALID_OPTION
   */
  selector?: IInputSelector;
  /**
   * Five protocol parameters set to 0 over `params`: minFeeA, minFeeB, priceMem, priceStep,
   * coinsPerUtxoSize
   */
  isHydra?: boolean;
  /** Protocol parameter fields laid over those read from the fetcher, or the built-in ones */
  params?: Partial<Protocol>;
  verbose?: boolean;
}

/** The fields `isHydra` sets to 0: a head charges no fee and no storage */
const HYDRA_PARAMS: Partial<Protocol> = {
  minFeeA: 0,
  minFeeB: 0,
  priceMem: 0,
  priceStep: 0,
  coinsPerUtxoSize: 0,
};

/** The brand Mesh's serializers carry on their prototype */
const MESH_SERIALIZER = Symbol.for("@meshsdk/serializer");

const SERIALIZERS_ALLOWED =
  "one of Mesh's serializers: CardanoSDKSerializer or CSLSerializer";
const SELECTORS_ALLOWED = "a LargestFirstInputSelector, or none";

const isMeshSerializer = (serializer: unknown): boolean =>
  typeof serializer === "object" &&
  serializer !== null &&
  (serializer as Record<symbol, unknown>)[MESH_SERIALIZER] === true;

export class MeshTxBuilder extends MeshTxBuilderCore {
  serializer: IMeshTxSerializer;
  selector: IInputSelector;
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  evaluator?: IEvaluator;
  txHex: string = "";
  /** The network the transaction is for, if given or set; see `MeshTxBuilderOptions.network` */
  network?: Network;
  verbose: boolean;
  /** The constructor's `network` option, which `setNetwork()` does not replace */
  private readonly networkOption?: Network;
  /** The protocol parameters the last `complete()` read from the fetcher */
  private readParams?: Protocol;
  /** The cost models the last `complete()` read from the fetcher */
  private lastCostModels?: number[][];

  /**
   * @throws TxBuildError INVALID_OPTION for a `serializer` that is not Mesh's, or a `selector`
   *   that is not a `LargestFirstInputSelector`
   */
  constructor({
    serializer,
    selector,
    fetcher,
    submitter,
    evaluator,
    network,
    params,
    isHydra = false,
    verbose = false,
  }: MeshTxBuilderOptions = {}) {
    super();
    if (serializer !== undefined && !isMeshSerializer(serializer))
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid serializer: expected ${SERIALIZERS_ALLOWED}; the transaction is encoded by the builder`,
        {
          details: {
            option: "serializer",
            value: serializer,
            allowed: SERIALIZERS_ALLOWED,
          },
        },
      );
    if (
      selector !== undefined &&
      !(selector instanceof LargestFirstInputSelector)
    )
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid selector: expected ${SELECTORS_ALLOWED}; a selection of your own is coinSelection of TxBuilder`,
        {
          details: {
            option: "selector",
            value: selector,
            allowed: SELECTORS_ALLOWED,
          },
        },
      );
    if (fetcher) this.fetcher = fetcher;
    if (submitter) this.submitter = submitter;
    if (evaluator) this.evaluator = evaluator;
    // Mesh's default: local evaluation with Scalus, which resolves inputs through the fetcher
    else if (evaluator === undefined && fetcher)
      this.evaluator = new OfflineEvaluatorScalus(fetcher);
    this.network = network;
    this.networkOption = network;
    if (params) this.protocolParams(params);
    // Over the consumer's own fields, and over every later protocolParams() call
    if (isHydra) this.fixParams(HYDRA_PARAMS);
    this.serializer =
      serializer ?? new CardanoSDKSerializer(this._protocolParams);
    // Both selectors lead to the builder's own selection
    this.selector = selector ?? new LargestFirstInputSelector();
    this.verbose = verbose;
  }

  /**
   * Also the network the transaction is for, as `MeshTxBuilderOptions.network`: an evaluator
   * that takes a context gets it. The body keeps it only until the cost models are fetched in
   * its place. Like the option, and unlike the body, it is kept across `reset()`.
   */
  override setNetwork = (network: Network | number[][]) => {
    if (typeof network === "string") this.network = network;
    this.meshTxBuilderBody.network = network;
    return this;
  };

  /**
   * Builds the transaction as the body describes it, without a request; see
   * `completeUnbalancedSync`
   * @param customizedTx The optional customized transaction body, used in place of the builder's
   * @returns The transaction in hex, unbalanced
   * @throws TxBuildError UNRESOLVED when an input or collateral has no amount or address, or a
   *   reference script no size; DUPLICATE_PART for contradictory repeats of an input or a
   *   withdrawal
   */
  completeUnbalanced = (customizedTx?: MeshTxBuilderBody): string => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateRefInputs();
    return transactionPrototypeToHex(this.assembleBody().assembled.prototype);
  };

  /**
   * Builds the transaction as the body describes it, without a request; see
   * `completeUnbalancedSync`
   * @param customizedTx The optional customized transaction body, used in place of the builder's
   * @returns The transaction in hex
   * @throws TxBuildError UNRESOLVED when an input or collateral has no amount or address, or a
   *   reference script no size; DUPLICATE_PART for contradictory repeats of an input or a
   *   withdrawal
   */
  completeSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateRefInputs();
    return transactionPrototypeToHex(this.assembleBody().assembled.prototype);
  };

  /**
   * Builds the transaction with `TxBuilder`: the body becomes parts, the payer is the change
   * address with the UTxOs of `selectUtxosFrom`, and the builder selects inputs, makes change,
   * puts up collateral, evaluates the scripts and settles the fee. Reads the protocol
   * parameters, the cost models (when a Plutus script runs) and every output the body names
   * by out ref and the builder does not hold, through the fetcher's shared cache. Afterwards
   * the body describes the transaction built: its inputs, outputs, fee, execution units and
   * key witness count.
   * @param customizedTx The optional customized transaction body, laid over the builder's
   * @returns The unsigned transaction in hex
   * @throws TxBuildError or TxPartError with a code when the transaction cannot be built
   */
  complete = async (customizedTx?: Partial<MeshTxBuilderBody>) => {
    if (customizedTx) {
      this.meshTxBuilderBody = { ...this.meshTxBuilderBody, ...customizedTx };
      // "0" is the fee of an empty or parsed body, not one set by hand
      if (customizedTx.fee && customizedTx.fee !== "0") {
        this.setFee(customizedTx.fee);
      }
    }
    this.queueAllLastItem();
    this.removeDuplicateRefInputs();
    if (this.txEvaluationMultiplier !== 1)
      warnOnce(
        "txEvaluationMultiplier",
        "MeshTxBuilder.txEvaluationMultiplier multiplies nothing: redeemers carry the execution " +
          "units of the final transaction's evaluation",
      );

    if (this.verbose) {
      console.log(
        "txBodyJson - before coin selection",
        JSONBig.stringify(this.meshTxBuilderBody, (key, val) => {
          if (key === "extraInputs") return undefined;
          if (key === "selectionConfig") return undefined;
          return val;
        }),
      );
    }

    const { built, translated, known, costModels } = await this.buildBody();
    this.describeBuilt(built, translated, known, costModels);

    if (this.verbose) {
      console.log(
        "txBodyJson - after coin selection",
        JSONBig.stringify(this.meshTxBuilderBody, (key, val) => {
          if (key === "extraInputs") return undefined;
          if (key === "selectionConfig") return undefined;
          return val;
        }),
      );
    }

    this.txHex = built.tx;
    return built.tx;
  };

  /**
   * Builds the body with a `TxBuilder` made for this build, on the parameters, cost models and
   * outputs read through the fetcher, or the values that stand in for them
   */
  private buildBody = async (): Promise<{
    built: BuiltTx;
    translated: BodyParts;
    known: ReadonlyMap<string, UTxO>;
    costModels?: number[][];
  }> => {
    const body = this.meshTxBuilderBody;
    const cache = this.fetcher && CachedFetcher.wrap(this.fetcher);
    const plutus = runsPlutus(body);
    const evaluator = this.evaluator;
    // A local evaluator is handed the build's UTxOs: declared data must not pose as one there
    const handsUtxos = plutus && !!evaluator?.acceptsKnownUtxos;

    const [params, outputs] = await Promise.all([
      this.readParameters(cache),
      this.readOutputs(cache),
    ]);
    const translated = bodyToParts(body, {
      known: outputs.known,
      declaredStandsIn: (outRef, entry) => {
        const absence = outputs.absent.get(outRef);
        if (!handsUtxos) return true;
        if (absence === "failed") return false;
        return entry.collateral || (!entry.script && entry.scriptSize === 0);
      },
      needsScriptSize: true,
      keepExUnits: !evaluator,
    });
    const costModels = translated.plutus
      ? await this.readCostModels(cache)
      : undefined;

    const { network, evaluatorNetwork } = this.networkOfBuild();
    const builder = new TxBuilder({
      network,
      ...(this.fetcher && { provider: this.fetcher }),
      params,
      ...(costModels && { costModels }),
      // Without an evaluator the redeemers keep the units of the calls; TxBuilder would
      // otherwise make a default one
      evaluator: evaluator ? configuredAs(evaluator, evaluatorNetwork) : null,
    });
    const options: BuildOptions & { [DECLARED_OUTPUTS]: DeclaredOutputs } = {
      ...(body.changeAddress && {
        payer: { changeAddress: body.changeAddress, utxos: body.extraInputs },
      }),
      ...(this.manualFee && { fee: BigInt(this.manualFee) }),
      knownUtxos: outputs.knownUtxos,
      [DECLARED_OUTPUTS]: {
        unread: translated.unread,
        scriptSizes: translated.scriptSizes,
        // Selection may spend a collateral input too, as it always could here
        selectableCollateral: new Set(
          body.collaterals.map(
            ({ txIn }) => `${txIn.txHash.toLowerCase()}#${txIn.txIndex}`,
          ),
        ),
      },
    };
    const built = await builder.build(translated.parts, options);
    return {
      built,
      translated,
      known: outputs.known,
      ...(costModels && { costModels }),
    };
  };

  /**
   * The protocol parameters of a build: those the fetcher gives, else those the last
   * `complete()` read, else the built-in ones, with a warning once per process; the consumer's
   * fields lie over them. The sync methods use them afterwards.
   */
  private readParameters = async (
    cache: CachedFetcher | undefined,
  ): Promise<Protocol> => {
    let read: Protocol | undefined;
    if (cache) {
      try {
        // NaN asks for the latest epoch's parameters, as TxBuilder does: one cache entry
        read = (await cache.fetchProtocolParameters(Number.NaN)) ?? undefined;
      } catch {
        // The values last read, or the built-in ones, below
      }
    }
    // A field the fetcher leaves out is taken from the built-in parameters
    if (read) this.readParams = { ...DEFAULT_PROTOCOL_PARAMETERS, ...read };
    if (!this.readParams)
      warnOnce(
        "builtinParameters",
        "MeshTxBuilder builds on its built-in protocol parameters, which may not be the network's: " +
          "give it a fetcher to read them from, or the parameters as params",
      );
    this.setBaseParams(this.readParams ?? DEFAULT_PROTOCOL_PARAMETERS);
    return this._protocolParams;
  };

  /**
   * The cost models of a build that runs a Plutus script: an array in the body's `network`
   * field, else the fetcher's answer, else those the last `complete()` read, else the built-in
   * lists; a version left out or empty is filled the same way
   */
  private readCostModels = async (
    cache: CachedFetcher | undefined,
  ): Promise<number[][]> => {
    const { network } = this.meshTxBuilderBody;
    let models: number[][] | undefined = Array.isArray(network)
      ? network
      : undefined;
    if (!models && cache) {
      try {
        const answer = await cache.fetchCostModels();
        if (Array.isArray(answer) && answer.length > 0) {
          models = answer;
          this.lastCostModels = answer;
        } else {
          console.warn(
            "fetchCostModels returned an invalid value, using default cost models:",
            answer,
          );
        }
      } catch (error) {
        console.warn(
          "Failed to fetch cost models, using default cost models. Error: ",
          error,
        );
      }
    }
    return this.costModelsOf(models);
  };

  /**
   * The cost models given, else those the last `complete()` read, else the built-in lists; a
   * version left out or empty is filled from those last read, else from the built-in list
   */
  private costModelsOf = (models: number[][] | undefined): number[][] => {
    const source = models ?? this.lastCostModels ?? DEFAULT_COST_MODELS;
    const length = Math.max(source.length, DEFAULT_COST_MODELS.length);
    return Array.from({ length }, (_, i) => {
      const model = source[i];
      if (model && model.length > 0) return model;
      const last = this.lastCostModels?.[i];
      if (last && last.length > 0) return last;
      return DEFAULT_COST_MODELS[i] ?? [];
    });
  };

  /**
   * The outputs the body names by out ref: those the builder holds (the UTxOs of
   * `selectUtxosFrom` and `inputForEvaluation`, the outputs of `chainTx`) and those read through
   * the fetcher, once per transaction hash; why each other one is not known; and the UTxOs
   * handed to the build as `knownUtxos`
   */
  private readOutputs = async (
    cache: CachedFetcher | undefined,
  ): Promise<{
    known: Map<string, UTxO>;
    absent: Map<string, "noFetcher" | "notFound" | "failed">;
    knownUtxos: UTxO[];
  }> => {
    const body = this.meshTxBuilderBody;
    const given = Object.values(body.inputsForEvaluation);
    const chained = body.chainedTxs.flatMap((txHex) =>
      getTransactionOutputs(txHex),
    );
    const known = this.heldOutputs(given, chained);

    const { outRefs, scriptRefs } = namedOutRefs(body);
    // A script reference whose held copy carries no script is read: the copy may lack it
    const unknown = Array.from(outRefs).filter((key) => {
      const held = known.get(key);
      return !held || (scriptRefs.has(key) && !held.output.scriptRef);
    });
    const absent = new Map<string, "noFetcher" | "notFound" | "failed">();
    const byHash = new Map<string, string[]>();
    for (const key of unknown) {
      const hash = key.slice(0, key.indexOf("#"));
      byHash.set(hash, [...(byHash.get(hash) ?? []), key]);
    }
    await Promise.all(
      Array.from(byHash, async ([hash, keys]) => {
        if (!cache) {
          for (const key of keys)
            if (!known.has(key)) absent.set(key, "noFetcher");
          return;
        }
        let utxos: UTxO[];
        try {
          utxos = (await cache.fetchUTxOs(hash)) ?? [];
        } catch (error) {
          const reason = isNotFound(error) ? "notFound" : "failed";
          for (const key of keys) if (!known.has(key)) absent.set(key, reason);
          return;
        }
        for (const utxo of utxos) {
          const key = keyOf(utxo);
          if (!known.get(key)?.output.scriptRef) known.set(key, utxo);
        }
        for (const key of keys)
          if (!known.has(key)) absent.set(key, "notFound");
      }),
    );

    // A given UTxO that a reference script is read from, without the script, is not handed
    // over: the build then reads the provider's copy
    const knownUtxos = [...given, ...chained].filter(
      (utxo) => !(scriptRefs.has(keyOf(utxo)) && !utxo.output.scriptRef),
    );
    return { known, absent, knownUtxos };
  };

  /**
   * The outputs the builder holds, by `txHash#index` (the hash in lower case): the UTxOs of
   * `selectUtxosFrom` and `inputForEvaluation`, and the outputs of the `chainTx` transactions
   */
  private heldOutputs = (
    given: readonly UTxO[] = Object.values(
      this.meshTxBuilderBody.inputsForEvaluation,
    ),
    chained: readonly UTxO[] = this.meshTxBuilderBody.chainedTxs.flatMap(
      (txHex) => getTransactionOutputs(txHex),
    ),
  ): Map<string, UTxO> => {
    const known = new Map<string, UTxO>();
    for (const utxo of [
      ...this.meshTxBuilderBody.extraInputs,
      ...given,
      ...chained,
    ])
      known.set(keyOf(utxo), utxo);
    return known;
  };

  /**
   * The network of a build: the constructor's option, else the network the fetcher states, else
   * a `setNetwork()` string of the change address's network id, else mainnet for a mainnet
   * change address; a test network nobody named is not known, and gets no slot clock. The
   * evaluator is told the network found, else the one the consumer stated.
   */
  private networkOfBuild = (): {
    network: NetworkInput;
    evaluatorNetwork?: Network;
  } => {
    const changeId = networkIdOf(this.meshTxBuilderBody.changeAddress);
    const fromSetNetwork = publicNetwork(this.network);
    const name =
      publicNetwork(this.networkOption) ??
      publicNetwork(this.fetcher?.network) ??
      (fromSetNetwork !== undefined &&
      changeId === (fromSetNetwork === "mainnet" ? 1 : 0)
        ? fromSetNetwork
        : undefined) ??
      (changeId === 1 ? "mainnet" : undefined);
    const stated = name ?? this.networkOption ?? this.network;
    return {
      network: name ?? UNKNOWN_TEST_NETWORK,
      ...(stated !== undefined && { evaluatorNetwork: stated }),
    };
  };

  /**
   * Writes what was built into the body: the inputs with the selected ones, the outputs with the
   * change, the fee, the redeemers' execution units, the key witness count, and the cost models
   * a transaction running Plutus scripts was built with
   */
  private describeBuilt = (
    built: BuiltTx,
    translated: BodyParts,
    known: ReadonlyMap<string, UTxO>,
    costModels: number[][] | undefined,
  ) => {
    const body = this.meshTxBuilderBody;
    completeScriptSources(body, known);
    const outRefOf = (txHash: string, index: number) =>
      `${txHash.toLowerCase()}#${index}`;

    const inputs = new Map<string, TxIn>();
    for (const input of body.inputs) {
      const key = outRefOf(input.txIn.txHash, input.txIn.txIndex);
      if (!inputs.has(key)) inputs.set(key, input);
    }
    body.inputs = built.inputs.map((utxo) => {
      const key = outRefOf(utxo.input.txHash, utxo.input.outputIndex);
      const input: TxIn = inputs.get(key) ?? {
        type: "PubKey",
        txIn: { txHash: utxo.input.txHash, txIndex: utxo.input.outputIndex },
      };
      input.txIn.amount = utxo.output.amount;
      input.txIn.address = utxo.output.address;
      // An input built from declared data keeps the size the fee counted for it
      input.txIn.scriptSize = utxo.output.scriptRef
        ? utxo.output.scriptRef.length / 2
        : known.has(key)
          ? 0
          : (translated.scriptSizes.get(key) ?? input.txIn.scriptSize ?? 0);
      return input;
    });

    // The outputs of the body come first, in order; change follows
    body.outputs.forEach((out, i) => {
      const lovelace = built.outputs[i]?.output.amount.find(
        (a) => a.unit === "lovelace",
      );
      if (
        lovelace &&
        !out.amount.some((a) => a.unit === "lovelace" || a.unit === "")
      )
        out.amount.push({ ...lovelace });
    });
    for (const change of built.change)
      body.outputs.push({
        address: change.output.address,
        amount: change.output.amount,
      });

    body.fee = built.fee.toString();

    const { body: txBody } = built.prototype;
    for (const redeemer of built.redeemers) {
      const { tag, index } = redeemer;
      let key: string;
      if (tag === "SPEND") {
        const input = txBody.inputs[index]!;
        key = `SPEND:${input.transaction_id}#${input.index}`;
      } else if (tag === "MINT")
        key = `MINT:${Object.keys(txBody.mint ?? {})[index]}`;
      else if (tag === "REWARD")
        key = `REWARD:${Object.keys(txBody.withdrawals ?? {})[index]}`;
      else if (tag === "VOTE")
        key = `VOTE:${voterKey(txBody.voting_procedures![index]!.voter)}`;
      else key = `${tag}:${index}`;
      for (const item of translated.redeemers.get(key) ?? [])
        item.exUnits = {
          mem: Number(redeemer.exUnits.mem),
          steps: Number(redeemer.exUnits.steps),
        };
    }

    const signers = pricedSigners(built.parts);
    body.expectedNumberKeyWitnesses = signers.keyHashes.size;
    body.expectedByronAddressWitnesses = Array.from(signers.byronAddresses);
    if (costModels) body.network = costModels;
  };

  /**
   * Builds the transaction as the body describes it, without a request: no input is selected,
   * no change made and no script evaluated. The fee is the body's (`setFee()`, else 0), and an
   * output without lovelace gets its minimum.
   * @param customizedTx The optional customized transaction body, used in place of the builder's
   * @returns The transaction in hex, unbalanced
   * @throws TxBuildError UNRESOLVED when an input or collateral has no amount or address, or a
   *   reference script no size; DUPLICATE_PART for contradictory repeats of an input or a
   *   withdrawal
   */
  completeUnbalancedSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
      // "0" is the fee of an empty or parsed body, not one set by hand
      if (customizedTx.fee && customizedTx.fee !== "0") {
        this.setFee(customizedTx.fee);
      }
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateRefInputs();
    return transactionPrototypeToHex(this.assembleBody().assembled.prototype);
  };

  /**
   * Complete the signing process
   * @returns The signed transaction in hex
   */
  completeSigning = () => {
    const signedTxHex = this.serializer.addSigningKeys(
      this.txHex,
      this.meshTxBuilderBody.signingKey,
    );
    this.txHex = signedTxHex;
    return signedTxHex;
  };

  /**
   * Submit transactions to the blockchain using the fetcher instance
   * @param txHex The signed transaction in hex
   * @returns
   */
  submitTx = async (txHex: string): Promise<string | undefined> => {
    try {
      return await this.submitter?.submitTx(txHex);
    } finally {
      // Address UTxOs and the like change once the tx lands; don't serve them from cache
      if (this.fetcher) CachedFetcher.wrap(this.fetcher).clearVolatile();
    }
  };

  /**
   * The body as parts, assembled as it is: nothing is read, selected, balanced or evaluated.
   * Outputs it holds (`selectUtxosFrom`, `inputForEvaluation`, `chainTx`) are used; any other
   * input and collateral is built from the amount and address the call declared, and a
   * reference script taken as declared. Redeemers carry the units of the calls; the parameters
   * and cost models are those the builder has (the values the last `complete()` read, else the
   * built-in ones, with the consumer's fields over them).
   * @param placeholders Whether to add stand-in witnesses for every key expected to sign, to size
   *   the transaction once signed
   * @throws TxBuildError UNRESOLVED for an input or collateral without amount or address, or a
   *   reference script without size; DUPLICATE_PART for contradictory repeats
   */
  private assembleBody = (placeholders = false) => {
    const body = this.meshTxBuilderBody;
    const params = this._protocolParams;
    const known = this.heldOutputs();
    const translated = bodyToParts(body, {
      known,
      declaredStandsIn: () => true,
      needsScriptSize: false,
      keepExUnits: true,
      unbalanced: params,
    });
    const signers = pricedSigners(translated.parts);
    const witnesses = placeholders ? placeholderWitnesses(signers) : undefined;
    const assembled = assembleTxPrototype(translated.parts, {
      fee: BigInt(body.fee || "0"),
      ...(translated.plutus && {
        costModels: this.costModelsOf(
          Array.isArray(body.network) ? body.network : undefined,
        ),
      }),
      ...(witnesses && {
        vkeyWitnesses: witnesses.vkeyWitnesses,
        bootstrapWitnesses: witnesses.bootstrapWitnesses,
      }),
    });
    return { assembled, translated, known, signers };
  };

  /**
   * The body as a transaction with stand-in witnesses for every key expected to sign, the size
   * of the signed one; records the expected key and Byron witnesses in the body
   * @returns The transaction in hex
   * @throws TxBuildError UNRESOLVED when an input has no amount or address
   */
  serializeMockTx = () => {
    const { assembled, signers } = this.assembleBody(true);
    const body = this.meshTxBuilderBody;
    body.expectedNumberKeyWitnesses = signers.keyHashes.size;
    body.expectedByronAddressWitnesses = Array.from(signers.byronAddresses);
    return transactionPrototypeToHex(assembled.prototype);
  };

  /** The execution units of the body's redeemers, added up */
  getTotalExecutionUnits = (): {
    memUnits: bigint;
    stepUnits: bigint;
  } => {
    const body = this.meshTxBuilderBody;
    const redeemers = [
      ...body.inputs.map((input) =>
        input.type === "Script" ? input.scriptTxIn.redeemer : undefined,
      ),
      ...body.mints.map((mint) =>
        mint.type === "Plutus" ? mint.redeemer : undefined,
      ),
      ...body.certificates.map((cert) =>
        cert.type === "ScriptCertificate" ? cert.redeemer : undefined,
      ),
      ...body.withdrawals.map((withdrawal) =>
        withdrawal.type === "ScriptWithdrawal"
          ? withdrawal.redeemer
          : undefined,
      ),
      ...body.votes.map((vote) =>
        vote.type === "ScriptVote" ? vote.redeemer : undefined,
      ),
      ...body.proposals.map((proposal) =>
        proposal.type === "ScriptProposal" ? proposal.redeemer : undefined,
      ),
    ];
    let memUnits = 0n;
    let stepUnits = 0n;
    for (const redeemer of redeemers) {
      if (!redeemer) continue;
      memUnits += BigInt(redeemer.exUnits.mem);
      stepUnits += BigInt(redeemer.exUnits.steps);
    }
    return { memUnits, stepUnits };
  };

  /**
   * The size of the transaction once signed, in bytes
   * @throws TxBuildError UNRESOLVED when an input has no amount or address
   */
  getSerializedSize = (): number => {
    return this.serializeMockTx().length / 2;
  };

  /** The fee set with `setFee()`, else the minimum fee of the body */
  getActualFee = (): bigint => {
    if (this.manualFee) {
      return BigInt(this.manualFee);
    } else {
      return this.calculateFee();
    }
  };

  /**
   * The minimum fee of the body once signed: its size, its reference scripts and the execution
   * units of its redeemers, on the builder's parameters
   * @throws TxBuildError UNRESOLVED when an input has no amount or address
   */
  calculateFee = (): bigint => {
    const txSize = this.getSerializedSize();
    return this.calculateFeeForSerializedTx(txSize);
  };

  /**
   * The minimum fee of the body for a transaction of the given size
   * @param txSize The size of the signed transaction, in bytes
   */
  calculateFeeForSerializedTx = (txSize: number): bigint => {
    const refScriptFee = this.calculateRefScriptFee();
    const redeemersFee = this.calculateRedeemersFee();
    const minFeeCoeff = BigInt(this._protocolParams.minFeeA);
    const minFeeConstant = BigInt(this._protocolParams.minFeeB);
    const minFee = minFeeCoeff * BigInt(txSize) + minFeeConstant;
    return minFee + refScriptFee + redeemersFee;
  };

  /**
   * The fee for the reference scripts the body's inputs and reference inputs hold: those of the
   * outputs the builder holds, else the sizes the calls declared
   */
  calculateRefScriptFee = (): bigint => {
    const { assembled, translated, known } = this.assembleBody();
    return refScriptFee(
      refScriptSize(assembled, known, translated.scriptSizes),
      this._protocolParams.minFeeRefScriptCostPerByte,
    );
  };

  /**
   * The fee for the execution units of the transaction's redeemers: those of the body as it
   * assembles, where exact repeats are merged and the votes of one voter share one redeemer
   * @throws TxBuildError UNRESOLVED when an input has no amount or address
   */
  calculateRedeemersFee = (): bigint => {
    const { mem, steps } = prototypeExUnits(
      this.assembleBody().assembled.prototype,
    );
    return exUnitsFee(mem, steps, this._protocolParams);
  };

  /** The least lovelace the output must hold, on the builder's `coinsPerUtxoSize` */
  calculateMinLovelaceForOutput = (output: Output): bigint => {
    return minCoin(toOutputPart(output), this._protocolParams);
  };
}

/** The out ref of a UTxO as `txHash#index`, the hash in lower case */
const keyOf = (utxo: UTxO) =>
  `${utxo.input.txHash.toLowerCase()}#${utxo.input.outputIndex}`;

/** Whether a body runs a Plutus script, and so has redeemers */
const runsPlutus = (body: MeshTxBuilderBody): boolean =>
  body.inputs.some((input) => input.type === "Script") ||
  body.mints.some((item) => item.type === "Plutus") ||
  body.certificates.some((cert) => cert.type === "ScriptCertificate") ||
  body.withdrawals.some((item) => item.type === "ScriptWithdrawal") ||
  body.votes.some((item) => item.type === "ScriptVote") ||
  body.proposals.some((item) => item.type === "ScriptProposal");

/**
 * The out refs a body names, as `txHash#index` with the hash in lower case: inputs, collateral,
 * read-only reference inputs and reference scripts; and those of the reference scripts alone
 */
const namedOutRefs = (
  body: MeshTxBuilderBody,
): { outRefs: Set<string>; scriptRefs: Set<string> } => {
  const outRefs = new Set<string>();
  const scriptRefs = new Set<string>();
  const name = (txHash: string, index: number) =>
    outRefs.add(`${txHash.toLowerCase()}#${index}`);
  const script = (
    source: ScriptSource | SimpleScriptSourceInfo | undefined,
  ) => {
    if (source?.type !== "Inline") return;
    name(source.txHash, source.txIndex);
    scriptRefs.add(`${source.txHash.toLowerCase()}#${source.txIndex}`);
  };
  for (const input of body.inputs) {
    name(input.txIn.txHash, input.txIn.txIndex);
    if (input.type === "Script") script(input.scriptTxIn.scriptSource);
    if (input.type === "SimpleScript")
      script(input.simpleScriptTxIn.scriptSource);
  }
  for (const input of body.collaterals)
    name(input.txIn.txHash, input.txIn.txIndex);
  for (const ref of body.referenceInputs) name(ref.txHash, ref.txIndex);
  for (const item of body.mints) script(item.scriptSource);
  for (const item of body.withdrawals)
    if (item.type !== "PubKeyWithdrawal") script(item.scriptSource);
  for (const item of body.certificates) {
    if (item.type === "ScriptCertificate") script(item.scriptSource);
    if (item.type === "SimpleScriptCertificate")
      script(item.simpleScriptSource);
  }
  for (const item of body.votes) {
    if (item.type === "ScriptVote") script(item.scriptSource);
    if (item.type === "SimpleScriptVote") script(item.simpleScriptSource);
  }
  for (const item of body.proposals) {
    if (item.type === "ScriptProposal") script(item.scriptSource);
    if (item.type === "SimpleScriptProposal") script(item.simpleScriptSource);
  }
  return { outRefs, scriptRefs };
};

/**
 * Fills in the hash and size of the reference scripts the body names without them, from the
 * outputs holding them, when known
 */
const completeScriptSources = (
  body: MeshTxBuilderBody,
  known: ReadonlyMap<string, UTxO>,
) => {
  const held = (txHash: string, txIndex: number) => {
    const scriptRef = known.get(`${txHash.toLowerCase()}#${txIndex}`)?.output
      .scriptRef;
    if (!scriptRef) return undefined;
    return {
      scriptHash: CstScript.fromCbor(<CardanoSDKUtil.HexBlob>scriptRef)
        .hash()
        .toString(),
      scriptSize: (scriptRef.length / 2).toString(),
    };
  };
  const plutus = (source: ScriptSource | undefined) => {
    if (source?.type !== "Inline" || (source.scriptHash && source.scriptSize))
      return;
    const script = held(source.txHash, source.txIndex);
    if (script) Object.assign(source, script);
  };
  const native = (source: SimpleScriptSourceInfo | undefined) => {
    if (
      source?.type !== "Inline" ||
      (source.simpleScriptHash && source.scriptSize)
    )
      return;
    const script = held(source.txHash, source.txIndex);
    if (script)
      Object.assign(source, {
        simpleScriptHash: script.scriptHash,
        scriptSize: script.scriptSize,
      });
  };
  for (const input of body.inputs) {
    if (input.type === "Script") plutus(input.scriptTxIn.scriptSource);
    if (input.type === "SimpleScript")
      native(input.simpleScriptTxIn.scriptSource);
  }
  for (const item of body.mints)
    if (item.type === "Plutus") plutus(item.scriptSource as ScriptSource);
    else native(item.scriptSource as SimpleScriptSourceInfo);
  for (const item of body.withdrawals) {
    if (item.type === "ScriptWithdrawal") plutus(item.scriptSource);
    if (item.type === "SimpleScriptWithdrawal") native(item.scriptSource);
  }
  for (const item of body.certificates) {
    if (item.type === "ScriptCertificate") plutus(item.scriptSource);
    if (item.type === "SimpleScriptCertificate")
      native(item.simpleScriptSource);
  }
  for (const item of body.votes) {
    if (item.type === "ScriptVote") plutus(item.scriptSource);
    if (item.type === "SimpleScriptVote") native(item.simpleScriptSource);
  }
  for (const item of body.proposals) {
    if (item.type === "ScriptProposal") plutus(item.scriptSource);
    if (item.type === "SimpleScriptProposal") native(item.simpleScriptSource);
  }
};

const PUBLIC_NETWORKS: readonly string[] = ["mainnet", "preprod", "preview"];

/** A network name that counts as stated: mainnet, preprod or preview */
const publicNetwork = (
  value: unknown,
): "mainnet" | "preprod" | "preview" | undefined =>
  PUBLIC_NETWORKS.includes(value as string)
    ? (value as "mainnet" | "preprod" | "preview")
    : undefined;

/** The network id of an address; undefined for none */
const networkIdOf = (address: string): number | undefined => {
  try {
    return CstAddress.fromString(address)?.getNetworkId();
  } catch {
    return undefined;
  }
};

/**
 * A test network nobody named: network id 0, and a slot clock nothing reads, since the old API
 * gives bounds in slots and the evaluator is not told it
 */
const UNKNOWN_TEST_NETWORK: NetworkConfig = {
  name: "testnet",
  networkId: 0,
  slotConfig: {
    zeroTime: 0,
    zeroSlot: 0,
    slotLength: 1000,
    startEpoch: 0,
    epochLength: 432000,
  },
};

/**
 * An evaluator configured as the old builder configured it: with the network it knew and the
 * cost models, never with a slot clock, which it did not guess
 */
const configuredAs = (
  evaluator: IEvaluator,
  network: Network | undefined,
): IEvaluator => ({
  evaluateTx: (tx, utxos, txs) => evaluator.evaluateTx(tx, utxos, txs),
  ...(evaluator.acceptsKnownUtxos && { acceptsKnownUtxos: true }),
  ...(evaluator.configure && {
    configure: ({ costModels }: EvaluationContext) =>
      evaluator.configure!({ network, costModels }),
  }),
});

const DEFAULT_COST_MODELS = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];

/** "UTxO not found", or OfflineFetcher's "No UTxOs found for transaction hash: ..." */
const NOT_FOUND = /\bnot found\b|\bno \w+ found\b/i;

/**
 * Whether a fetcher's error says the transaction is not there: an HTTP 404, as Blockfrost and
 * Maestro throw it (`parseHttpError`'s JSON string, sometimes encoded twice, with a `status`),
 * or an error saying "not found", as `OfflineFetcher` throws. Fetchers that return `[]` for a
 * missing transaction (Kupo, UTxO RPC, the Scalus emulator) do not get here.
 */
const isNotFound = (error: unknown): boolean => {
  let parsed: unknown = error;
  for (let i = 0; i < 2 && typeof parsed === "string"; i++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }
  if (typeof parsed === "string") return NOT_FOUND.test(parsed);
  if (typeof parsed !== "object" || parsed === null) return false;
  // Errors from another realm (a vm context, a worker) are not `instanceof Error`
  const { status, message } = parsed as Record<string, unknown>;
  if (status !== undefined) return status === 404;
  return typeof message === "string" && NOT_FOUND.test(message);
};

export const cloneOutput = (output: Output): Output => {
  // structuredClone preserves Map, bigint and nested Mesh Data objects, which a
  // JSON round-trip silently drops (e.g. a Map in an inline datum becomes `{}`).
  // See https://github.com/MeshJS/mesh/issues/704
  return structuredClone(output);
};

export const setLoveLace = (output: Output, lovelace: bigint): Output => {
  let lovelaceSet = false;
  for (let asset of output.amount) {
    if (asset.unit === "lovelace") {
      asset.quantity = lovelace.toString();
      lovelaceSet = true;
      break;
    }
  }

  if (!lovelaceSet) {
    output.amount.push({
      unit: "lovelace",
      quantity: lovelace.toString(),
    });
  }
  return output;
};

export const getLovelace = (output: Output): bigint => {
  for (let asset of output.amount) {
    if (asset.unit === "lovelace" || asset.unit === "") {
      return BigInt(asset.quantity);
    }
  }
  return 0n;
};

export const getOutputMinLovelace = (
  output: Output,
  coinsPerUtxoSize = DEFAULT_PROTOCOL_PARAMETERS.coinsPerUtxoSize,
): bigint => {
  const serializer = new CardanoSDKSerializer();
  let currentOutput = cloneOutput(output);
  let lovelace = getLovelace(currentOutput);
  let minLovelace = 0n;
  for (let i = 0; i < 3; i++) {
    const txOutSize = BigInt(
      serializer.serializeOutput(currentOutput).length / 2,
    );
    const txOutByteCost = BigInt(coinsPerUtxoSize);
    const totalOutCost = (160n + BigInt(txOutSize)) * txOutByteCost;
    minLovelace = totalOutCost;
    if (lovelace < totalOutCost) {
      lovelace = totalOutCost;
    } else {
      break;
    }
    currentOutput = setLoveLace(currentOutput, lovelace);
  }

  return minLovelace;
};

export * from "./utils";
