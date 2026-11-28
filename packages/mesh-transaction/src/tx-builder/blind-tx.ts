import type { BuiltTxData, TxBuilder } from "./builder";
import type {
  AwaitInclusionOptions,
  SubmitTxOptions,
  TxInclusion,
} from "./built-tx";
import type {
  KeyWitness,
  KeyWitnessTags,
  RawItems,
  RawTx,
  Signer,
} from "./sign";
import { abortable, throwIfAborted } from "./abort";
import {
  CALL,
  checkInclusionOptions,
  checkSubmitOptions,
  isAbortSignal,
  TxSender,
} from "./built-tx";
import { TxBuildError } from "./errors";
import {
  invalidOption,
  optionsObject,
  SIGNERS_IN_PLACE,
  typeOf,
} from "./options";
import {
  keysSignedBy,
  newWitnesses,
  refuseRepeatedKey,
  signerWitnesses,
  toSigners,
  unreadableSigner,
  withHeldWitnesses,
  witnessesToAdd,
} from "./sign";

// A transaction read from its bytes alone, to be signed without the UTxOs of its inputs: what
// `fromCbor` with `blind` makes. It shows what the bytes show, and holds every witness given to
// it that verifies against the body.

/** The options of one call of `sign()` of a `BlindTx` */
export type SignBlindTxOptions = {
  /**
   * Who signs: one signer or several, asked one after another in this order, each with no list
   * of keys. Required: the object has no payer, and cannot tell which keys the transaction needs
   */
  signers: Signer | readonly Signer[];
  /** Aborts the call with ABORTED; a signer already asked is no longer waited for */
  signal?: AbortSignal;
};

/** What `fromCbor` with `blind` reads of a transaction from its bytes */
export type BlindTxData = Pick<
  BuiltTxData,
  "tx" | "txHash" | "network" | "fee" | "outputs" | "validity" | "redeemers"
>;

/** What a `BlindTx` starts from beside its data: the transaction read, and its witnesses */
export type BlindTxState = {
  /** The transaction of the data, read once */
  readonly raw: RawTx;
  /** The witnesses it came with, each verified against the body */
  readonly held: readonly KeyWitness[];
  /**
   * Whether the vkey entry and the bootstrap entry those witnesses came in were written with the
   * set tag, each when it held a witness
   */
  readonly tags: Partial<KeyWitnessTags>;
  /**
   * The transaction as it came, with the witnesses it came with in their entries, read once: what
   * the witnesses held are written into, every byte of it kept
   */
  readonly host: RawItems;
};

const SIGN_ALLOWED = "an object { signers, signal? }";
const SIGNERS_ALLOWED =
  "a signer or a list of signers, at least one: the object has no payer that signs";

/**
 * The options of `sign()` of a `BlindTx`, checked by their shape
 * @throws TxBuildError INVALID_OPTION, for no signer among the rest
 * @throws TxPlanError SIGNER_FAILED for a signer whose methods throw when they are read
 */
const checkSignOptions = (options: unknown) => {
  const { signers, signal } = optionsObject(
    options,
    ["signers", "signal"],
    SIGN_ALLOWED,
    SIGNERS_IN_PLACE,
  );
  let given: Signer[] | undefined;
  try {
    given = toSigners(signers);
  } catch (error) {
    if (TxBuildError.is(error)) throw error;
    throw unreadableSigner("threw");
  }
  if (given === undefined)
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid signers: expected ${SIGNERS_ALLOWED}; got ${
        Array.isArray(signers)
          ? "an empty list"
          : `a value of type ${typeOf(signers)}`
      }`,
      {
        details: {
          option: "signers",
          value: typeOf(signers),
          allowed: SIGNERS_ALLOWED,
        },
      },
    );
  if (signal !== undefined && !isAbortSignal(signal))
    throw invalidOption("signal", signal, "an AbortSignal");
  return { signers: given, signal: signal as AbortSignal | undefined };
};

/**
 * A transaction read from its bytes alone, to be signed without looking at the UTxOs of its
 * inputs: what `builder.fromCbor(tx, { blind: true })` returns, on any builder, one given its
 * network alone among them. Nothing is asked of a provider and no UTxO is read.
 *
 * ```ts
 * const cold = new TxBuilder({ network: "mainnet" });
 * const unseen = await cold.fromCbor(tx, { blind: true });
 * const { outputs, fee } = unseen; // what the bytes say leaves
 * await unseen.sign({ signers: keySigner(key) });
 * await unseen.submit(); // or unseen.partialTx to the next party
 * ```
 *
 * It holds what the bytes show: `tx` (the transaction without its vkey and bootstrap witnesses,
 * as `fromCbor` gives it), `txHash`, `network`, `fee`, `outputs`, `validity` and `redeemers`, and
 * the witnesses it holds: `signedKeyHashes` and `partialTx`. It shows nothing that needs the
 * UTxOs of the inputs: not what the inputs hold, whose inputs they are, who must sign, what is
 * put up as collateral or lost with it, what reference scripts run. Read the transaction with
 * `fromCbor` and `knownUtxos` where those matter.
 *
 * `sign()` asks each signer with no list of keys, and keeps every witness of the body it is
 * given, once per key: a wallet's witness of a key the transaction does not need too, since the
 * object cannot tell which keys it needs. A witness the fee was not priced for makes the
 * transaction larger than its fee pays for, and the node can refuse it then.
 *
 * A `BlindTx` is not a `BuiltTx`: it has no `toJSON` and no `restore` reads it, and neither `after`
 * nor a step of a plan takes it (INVALID_OPTION). Keep its `partialTx`, and read it again.
 */
export class BlindTx {
  /**
   * The unsigned transaction, in CBOR hex: the transaction given without its vkey and bootstrap
   * witnesses, every other byte as given
   */
  declare readonly tx: BuiltTxData["tx"];
  /** The hash of the body of `tx` */
  declare readonly txHash: BuiltTxData["txHash"];
  /** The builder's network, which the transaction was checked against */
  declare readonly network: BuiltTxData["network"];
  /** The fee the body states */
  declare readonly fee: BuiltTxData["fee"];
  /**
   * Every output as a UTxO of `txHash`, in body order, without labels. The collateral return is
   * not among them
   */
  declare readonly outputs: BuiltTxData["outputs"];
  /**
   * The validity interval, with the bounds the transaction has: in slots, and the POSIX
   * milliseconds those slots start at on the builder's network
   */
  declare readonly validity?: BuiltTxData["validity"];
  /** The redeemers of the witness set, their data as the transaction carries it, without `part` */
  declare readonly redeemers: BuiltTxData["redeemers"];

  /** The transaction as read, once: what is signed, whatever the members say later */
  readonly #raw: RawTx;
  /** The transaction as it came, with its witnesses: what the witnesses held are written into */
  readonly #host: RawItems;
  /** The witnesses held, each verified against the body, in the order they were kept */
  readonly #held: KeyWitness[] = [];
  /**
   * Whether the vkey entry and the bootstrap entry are written with the set tag: each as the
   * entry the transaction came with was, when it holds a witness of that entry; else as the body
   * writes its input set
   */
  readonly #tags: KeyWitnessTags;
  /** `partialTx` as last written, with the number of witnesses it holds */
  #written?: { count: number; tx: string };
  /** The deliveries of the bytes and the looks for them, through the builder */
  readonly #sender: TxSender;

  /** Made by `builder.fromCbor(tx, { blind: true })` only */
  private constructor(
    builder: TxBuilder,
    data: BlindTxData,
    state: BlindTxState,
  ) {
    Object.assign(this, data);
    this.#raw = state.raw;
    this.#host = state.host;
    this.#keep(state.held);
    const tagOf = (kind: KeyWitness["kind"]) =>
      (this.#held.some((w) => w.kind === kind)
        ? state.tags[kind]
        : undefined) ?? this.#raw.taggedSets;
    this.#tags = { vkey: tagOf("vkey"), bootstrap: tagOf("bootstrap") };
    this.#sender = new TxSender(builder, this.#raw);
    Object.freeze(this);
  }

  /**
   * The key hashes whose vkey witness the object holds, each verified against the body, in the
   * order they were kept. A bootstrap witness signs for a Byron address and adds none
   */
  get signedKeyHashes(): readonly string[] {
    return Object.freeze([...keysSignedBy(this.#held)]);
  }

  /**
   * The transaction with every witness held, in CBOR hex: `tx` itself while it holds none. It is
   * what `submit()` sends, and what is handed to a party that signs next. It is the transaction
   * as it came, every byte of it kept, with the witnesses added after those of their entry, as
   * the wallets of this library write them
   */
  get partialTx(): string {
    const count = this.#held.length;
    if (this.#written?.count !== count)
      this.#written = {
        count,
        tx: withHeldWitnesses(this.#host, this.#held, this.#tags),
      };
    return this.#written.tx;
  }

  /**
   * Signs with the call's signers, each asked once, in order, with no list of keys: a signer
   * with `signTxWitnesses` is handed the transaction alone, a signer of transaction hashes
   * (`signTxHash`, a function, `keySigner(key)`) gets `{ txHash, tx }` and signs with the keys it
   * holds, and a wallet's `signTx(tx, true)` chooses its keys itself. Every witness is verified
   * against the body, and every one that verifies is kept, once per key, whatever key it is of:
   * a witness the fee was not priced for can make the node refuse the transaction. What a signer
   * gave stays when a later one fails.
   * @returns This object
   * @throws TxPlanError SIGN_DECLINED when a signer declines; SIGNER_FAILED when one fails,
   *   answers with a witness that is not of this body, or has a signing method that throws when
   *   it is read or is gone when it is asked
   * @throws TxBuildError INVALID_OPTION for options that are not an object (a signer given in
   *   their place among them: give it as `{ signers }`) or have a member other than these, for no
   *   signer (`signers` missing, or an empty list), a signer that cannot sign (a private key given
   *   as it is among them: `keySigner(key)` makes a signer of it), a `signal` that is not an
   *   AbortSignal, and a transaction whose witness set repeats a key, which no signer is asked
   *   for; `details.value` is only the JavaScript type of what was given; ABORTED
   */
  async sign(options: SignBlindTxOptions): Promise<this> {
    const { signers, signal } = checkSignOptions(options);
    throwIfAborted(signal, CALL);
    // No witness goes into a witness set that repeats a key, as the wallets write none into it
    refuseRepeatedKey(this.#raw.witnessSet);
    for (const signer of signers) {
      throwIfAborted(signal, CALL);
      const offered = await abortable(
        signerWitnesses(signer, this.#raw, { signal }),
        signal,
        CALL,
      );
      this.#keep(offered);
    }
    return this;
  }

  /**
   * Adds witnesses made elsewhere: witness sets, or full transactions of which only the vkey and
   * bootstrap witnesses are taken, each verified against this body. Kept as `sign()` keeps them.
   * @returns This object
   * @throws TxPlanError INVALID_WITNESS (`undecodable`, `wrongBody`) with the index of the
   *   argument, counted from 0; nothing of the call is kept then
   * @throws TxBuildError INVALID_OPTION for a transaction whose witness set repeats a key
   */
  async addWitnesses(...witnesses: string[]): Promise<this> {
    refuseRepeatedKey(this.#raw.witnessSet);
    this.#keep(await witnessesToAdd(this.#raw, witnesses));
    return this;
  }

  /**
   * Hands `partialTx` to a submitter: the call's, else the builder's, else the provider when it
   * submits, as `submit()` of a `BuiltTx` hands its transaction. The object cannot tell whether
   * a key is missing: the ledger judges the bytes. After every hand-off the builder's cache of
   * volatile reads is cleared. It returns when the submitter took the bytes, and when it refuses
   * them after a delivery of this object that was taken or whose answer was lost, or the provider
   * already finds the transaction.
   * @returns This object
   * @throws TxPlanError MISSING_SUBMITTER with nothing to submit through: nothing is sent.
   *   REJECTED when the ledger refuses the bytes, no delivery of this object may have gone
   *   through and the transaction is not found, or the provider cannot be asked. SUBMIT_FAILED
   *   (retryable) when the outcome is unknown, with `details.reason` and `details.status` as the
   *   submitter's error gives them, and for a wallet `details.walletCode`. The submitter's error
   *   is the `cause`
   * @throws TxBuildError INVALID_OPTION for options that are not an object (a submitter given in
   *   their place among them: give it as `{ submitter }`) or have a member other than these, a
   *   submitter without `submitTx` or a signal that is not an AbortSignal; `details.value` is only
   *   the JavaScript type of what was given; ABORTED: bytes already handed to the submitter count
   *   as sent
   */
  async submit(options?: SubmitTxOptions): Promise<this> {
    const call = checkSubmitOptions(options);
    throwIfAborted(call.signal, CALL);
    await this.#sender.send(this.partialTx, call);
    return this;
  }

  /**
   * Looks for the transaction through the builder's provider, past its cache, every `pollMs`,
   * until it is found in a block, as `awaitInclusion()` of a `BuiltTx` does: one sighting, and
   * nothing after it. It sends nothing and changes nothing.
   * @returns What the provider's answer gave of the block
   * @throws TxPlanError CONFIRM_TIMEOUT `{ waitedFor: "included", timeoutMs }` (retryable) when
   *   it is not found in time: this does not mean that it will not land. SCRIPT_FAILED when it
   *   is in a block with `is_valid = false`: a script failed and the collateral was taken.
   *   CANNOT_OBSERVE (`noSearch`) for a provider without `fetchTxInfo`, (`noValidity`) for a
   *   transaction that runs a Plutus script found without `validContract`
   * @throws TxBuildError MISSING_FETCHER when the builder has no provider; INVALID_OPTION for an
   *   option out of range, and for options with a member other than those of
   *   `AwaitInclusionOptions`; ABORTED
   */
  async awaitInclusion(options?: AwaitInclusionOptions): Promise<TxInclusion> {
    const call = checkInclusionOptions(options);
    throwIfAborted(call.signal, CALL);
    return this.#sender.awaitInclusion(call);
  }

  /** Keeps the offered witnesses the object does not hold yet, each key once of each kind */
  #keep(offered: readonly KeyWitness[]) {
    this.#held.push(...newWitnesses(offered, this.#held));
  }
}

/**
 * The `BlindTx` of a transaction read from its bytes
 * @param builder The builder that read it: it submits through it and looks through its provider
 */
export const makeBlindTx = (
  builder: TxBuilder,
  data: BlindTxData,
  state: BlindTxState,
): BlindTx =>
  new (
    BlindTx as unknown as new (
      builder: TxBuilder,
      data: BlindTxData,
      state: BlindTxState,
    ) => BlindTx
  )(builder, data, state);
