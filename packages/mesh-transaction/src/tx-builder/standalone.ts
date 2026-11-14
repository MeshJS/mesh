import type { BuiltTx } from "./builder";
import type { AskedKey, KeyWitness, RawTx, Signer } from "./sign";
import type { RequiredKey } from "./witnesses";
import { abortable, throwIfAborted } from "./abort";
import { TxBuildError, TxPlanError } from "./errors";
import {
  canSign,
  countedWitnesses,
  readTransaction,
  signerWitnesses,
  toSigners,
  withWitnesses,
  witnessesToAdd,
} from "./sign";
import { askedKeys } from "./witnesses";

// The object of one built transaction: the data of the build as its own members, and the calls
// that sign that one body. Its bytes and their hash are read once, when it is made; the members
// are data for the application, and nothing the object signs or asks is taken from them later.

/** The call an aborted signal names */
const CALL = "the call";

/** The options of one call of `sign()` of a `StandaloneTx` */
export type SignTxOptions = {
  /** Who signs: one signer or several, asked one after another in this order */
  signers: Signer | readonly Signer[];
  /**
   * `true`, the default: the call adds what its signers give and returns, whether or not a key
   * is still missing; `missing` lists the rest. `false`: a key still missing after every signer
   * was asked is MISSING_SIGNATURES; what the signers gave stays in the transaction
   */
  partial?: boolean;
  /** Aborts the call with ABORTED; a signer already asked is no longer waited for */
  signal?: AbortSignal;
};

/** The JavaScript type of a value, with `null` told apart */
const typeOf = (value: unknown) => (value === null ? "null" : typeof value);

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { aborted?: unknown }).aborted === "boolean" &&
  typeof (value as { addEventListener?: unknown }).addEventListener ===
    "function";

const OPTIONS_ALLOWED = "an object { signers, partial?, signal? }";

/**
 * An option of `sign()` that is refused. What is given there may be or hold a key, so the message
 * and `details.value` name only its JavaScript type, never the value
 */
const invalidOption = (
  option: string,
  value: unknown,
  allowed: string,
  hint = "",
) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got a value of type ${typeOf(value)}${hint}`,
    { details: { option, value: typeOf(value), allowed } },
  );

/**
 * The options of `sign()`, checked by their shape
 * @throws TxBuildError INVALID_OPTION
 */
const checkSignOptions = (options: unknown) => {
  if (options === undefined) return {};
  if (typeof options !== "object" || options === null || canSign(options))
    throw invalidOption(
      "options",
      options,
      OPTIONS_ALLOWED,
      typeof options === "string"
        ? "; a private key is given as { signers: keySigner(key) }"
        : canSign(options)
          ? "; a signer is given as { signers }"
          : "",
    );
  if (Array.isArray(options))
    throw invalidOption(
      "options",
      options,
      OPTIONS_ALLOWED,
      "; signers are given as { signers: [...] }",
    );
  const { signers, partial, signal } = options as Record<string, unknown>;
  const given = toSigners(signers);
  if (partial !== undefined && typeof partial !== "boolean")
    throw invalidOption("partial", partial, "a boolean");
  if (signal !== undefined && !isAbortSignal(signal))
    throw invalidOption("signal", signal, "an AbortSignal");
  return {
    signers: given,
    partial: partial as boolean | undefined,
    signal: signal as AbortSignal | undefined,
  };
};

/** The keys in a message: each hash with its roles */
const keysText = (keys: readonly RequiredKey[]) =>
  keys.map((k) => `${k.keyHash} (${k.roles.join(", ")})`).join("; ");

/**
 * One built transaction, on its own: what `builder.build()` and `builder.finalize()` return.
 *
 * It is a `BuiltTx`: every member of it is here as the object's own read-only data, so it goes
 * wherever a `BuiltTx` goes (`after`, `utxosAfter`, `outputOf`), and `{ ...built }` or
 * `structuredClone(built)` is that data as a plain object. Beside the data it holds the
 * witnesses given to it, and it has the calls that sign this one body and take witnesses made
 * elsewhere: `tx` stays the unsigned transaction, `partialTx` is it with the witnesses held so
 * far, and `signedTx` is it with every witness it needs.
 *
 * ```ts
 * const built = await builder.build(output({ address, value }), { payer: wallet });
 * await built.sign({ signers: wallet });
 * await provider.submitTx(built.signedTx!);
 * ```
 *
 * One object is one body. Its bytes and its hash are fixed when it is made; no call builds,
 * edits or serializes a transaction again, and what is signed is that body. It has no deadline,
 * no anchor, no statuses and no replacement, so do not build another transaction to retry it: a
 * new build may select other inputs, and both may land. A payment that has to be repeated
 * safely, replaced or followed to `final` is a `TxPlan`; a plan's `build()` gives the data
 * alone, since a plan signs and sends its own attempts.
 *
 * Two calls at once are safe: a witness is kept once per key, whoever gives it first.
 */
export class StandaloneTx implements BuiltTx {
  /** The unsigned transaction, in CBOR hex */
  declare readonly tx: BuiltTx["tx"];
  declare readonly txHash: BuiltTx["txHash"];
  /**
   * The transaction as a value, exactly as serialized. It follows the transaction format of the
   * current ledger era; code meant to outlive an era reads the other members of `BuiltTx`.
   */
  declare readonly prototype: BuiltTx["prototype"];
  declare readonly fee: BuiltTx["fee"];
  /** Total execution units of the transaction's redeemers */
  declare readonly exUnits: BuiltTx["exUnits"];
  declare readonly redeemers: BuiltTx["redeemers"];
  /** Every input spent, resolved, in the transaction's order */
  declare readonly inputs: BuiltTx["inputs"];
  /** The inputs added to pay for the transaction */
  declare readonly selectedInputs: BuiltTx["selectedInputs"];
  /** The reference inputs, resolved, in the transaction's order */
  declare readonly referenceInputs: BuiltTx["referenceInputs"];
  /**
   * Every output as a UTxO of `txHash`, in body order, with its part's label. The collateral
   * return is not among them.
   */
  declare readonly outputs: BuiltTx["outputs"];
  /**
   * The change outputs, as UTxOs of `txHash`, in body order; each is also in `outputs`. A build
   * made before this transaction is seen by the provider passes it as `after`; when that build
   * has the same change address, it can then select this change.
   */
  declare readonly change: BuiltTx["change"];
  /**
   * The collateral, when the transaction runs Plutus scripts; of a transaction completed by
   * `finalize`, whenever the body has collateral inputs
   */
  declare readonly collateral?: BuiltTx["collateral"];
  /** The keys that must sign, each with the roles it is needed in */
  declare readonly signers: BuiltTx["signers"];
  /**
   * The validity interval, with the bounds the transaction has: in slots, and the POSIX
   * milliseconds those slots start at on the builder's network
   */
  declare readonly validity?: BuiltTx["validity"];
  /** The network the transaction was built for */
  declare readonly network: BuiltTx["network"];
  /** What is worth knowing about the transaction and did not stop the build; often empty */
  declare readonly warnings: BuiltTx["warnings"];
  /**
   * Every part of the transaction, resolved, the ones added by balancing included; empty on a
   * transaction completed by `finalize`
   */
  declare readonly parts: BuiltTx["parts"];

  /** The transaction as built, read once: what is signed, whatever the members say later */
  readonly #raw: RawTx;
  /** The keys that must sign, copied: what `missing` lists */
  readonly #keys: readonly RequiredKey[];
  /** The keys a signer is asked for: those that must sign, then those native scripts name */
  readonly #asked: readonly AskedKey[];
  /** The keys the fee counts a vkey witness for */
  readonly #counted: ReadonlySet<string>;
  /** The bootstrap witnesses the fee counts: one per Byron address spent from */
  readonly #bootstraps: number;
  /** The vkey witnesses of other keys the fee counts: the build's `extraKeyWitnesses` */
  readonly #extraKeys: number;
  /** The witnesses held, each verified against the body, in the order they were kept */
  readonly #held: KeyWitness[] = [];
  /** `partialTx` as last written, with the number of witnesses it holds */
  #written?: { count: number; tx: string };

  /** Made by `builder.build()` and `builder.finalize()` only */
  private constructor(built: BuiltTx, extraKeys: number) {
    Object.assign(this, built);
    this.#raw = readTransaction(built.tx);
    this.#keys = Object.freeze(
      built.signers.keys.map(({ keyHash, roles }) =>
        Object.freeze({ keyHash, roles: Object.freeze([...roles]) }),
      ),
    ) as readonly RequiredKey[];
    this.#asked = Object.freeze(askedKeys(built.signers));
    this.#counted = new Set(this.#asked.map(({ keyHash }) => keyHash));
    this.#bootstraps = built.signers.byronAddresses.length;
    this.#extraKeys = extraKeys;
    Object.freeze(this);
  }

  /**
   * The transaction with every witness it needs, in CBOR hex: `tx` with the witnesses held.
   * Undefined while a key of `signers.keyHashes` has not signed. Bootstrap witnesses and the
   * keys only native scripts name are not waited for: without them the ledger refuses it
   */
  get signedTx(): string | undefined {
    return this.missing.length === 0 ? this.partialTx : undefined;
  }

  /**
   * The transaction with the witnesses held so far, in CBOR hex, whether or not every key has
   * signed: `tx` itself while it holds none, and `signedTx` once none is missing. It is what is
   * handed to a party that signs next outside this object, such as a wallet's `signTx(tx, true)`
   * in another program; what that party gives back goes to `addWitnesses`. While a key is
   * missing the ledger refuses it: the transaction to submit is `signedTx`
   */
  get partialTx(): string {
    const count = this.#held.length;
    if (this.#written?.count !== count)
      this.#written = { count, tx: withWitnesses(this.#raw, this.#held) };
    return this.#written.tx;
  }

  /**
   * The keys the transaction needs that have not signed yet, each with its roles. Keys that
   * only a native script names are never listed
   */
  get missing(): readonly RequiredKey[] {
    const signed = new Set(this.#held.map((w) => w.keyHash));
    return Object.freeze(this.#keys.filter((k) => !signed.has(k.keyHash)));
  }

  /**
   * Signs with the call's signers, each asked once, in order, for the keys that have not signed
   * yet: the keys the transaction needs and those its native scripts name. A signer with
   * `signTxWitnesses` is handed their hashes; a signer of transaction hashes (`signTxHash`, a
   * function, `keySigner(key)`) gets them with their roles and is not asked when none is left; a
   * CIP-30 api chooses its keys itself. Every witness is verified against the body. Witnesses of
   * the keys the fee counts are kept, each once: the keys asked for, as many other keys as the
   * build's `extraKeyWitnesses`, and as many bootstrap witnesses as the transaction spends from
   * Byron addresses; any other is dropped. What a signer gave stays when a later one fails.
   *
   * By default the call returns whether or not a key is still missing, so that parties sign one
   * after another; with `partial: false` a key still missing is MISSING_SIGNATURES. Nothing is
   * sent: `signedTx` is the transaction to submit once `missing` is empty.
   * @returns This object
   * @throws TxPlanError MISSING_SIGNATURES `{ missing }` when no signer is given (an empty list
   *   gives none), and with `partial: false` when a key the transaction needs has no signature
   *   after every signer was asked; SIGN_DECLINED when a signer declines; SIGNER_FAILED when one
   *   fails, or answers with a witness that is not of this body
   * @throws TxBuildError INVALID_OPTION for options that are not an object (a signer given in
   *   their place among them: give it as `{ signers }`), a signer that cannot sign (a private
   *   key given as it is among them: `keySigner(key)` makes a signer of it), a `partial` that is
   *   not a boolean, a `signal` that is not an AbortSignal; `details.value` is only the
   *   JavaScript type of what was given; ABORTED
   */
  async sign(options: SignTxOptions): Promise<this> {
    const { signers, partial, signal } = checkSignOptions(options);
    throwIfAborted(signal, CALL);
    if (signers === undefined) {
      const missing = this.missing;
      throw new TxPlanError(
        "MISSING_SIGNATURES",
        `nobody in this call can sign: give signers, or add witnesses made elsewhere with addWitnesses; ${
          missing.length === 0
            ? "every key the transaction needs has signed it"
            : `${missing.length} key(s) the transaction needs have not signed it`
        }`,
        { details: { missing: [...missing] } },
      );
    }
    for (const signer of signers) {
      throwIfAborted(signal, CALL);
      // The keys that have not signed yet, by what is held now
      const signed = new Set(this.#held.map((w) => w.keyHash));
      const keys = this.#asked.filter(({ keyHash }) => !signed.has(keyHash));
      const offered = await abortable(
        signerWitnesses(signer, this.#raw, { keys, signal }),
        signal,
        CALL,
      );
      this.#keep(offered);
    }
    const missing = this.missing;
    if (partial === false && missing.length > 0)
      throw new TxPlanError(
        "MISSING_SIGNATURES",
        `${missing.length} key(s) the transaction needs have not signed it after every signer was asked: ${keysText(missing)}; the witnesses given are kept`,
        { details: { missing: [...missing] } },
      );
    return this;
  }

  /**
   * Adds witnesses made elsewhere: witness sets, or full transactions of which only the vkey and
   * bootstrap witnesses are taken, each verified against this body. Kept as `sign()` keeps them.
   * @returns This object
   * @throws TxPlanError INVALID_WITNESS (`undecodable`, `wrongBody`) with the index of the
   *   argument, counted from 0; nothing of the call is kept then
   */
  async addWitnesses(...witnesses: string[]): Promise<this> {
    this.#keep(await witnessesToAdd(this.#raw, witnesses));
    return this;
  }

  /** Keeps the offered witnesses the fee counts, against what is held at this moment */
  #keep(offered: readonly KeyWitness[]) {
    this.#held.push(
      ...countedWitnesses(offered, this.#held, {
        keys: this.#counted,
        extraKeys: this.#extraKeys,
        bootstraps: this.#bootstraps,
      }),
    );
  }
}

/**
 * A `StandaloneTx` of the data of a build: the object `build()` and `finalize()` return
 * @param extraKeys The build's `extraKeyWitnesses`: witnesses of other keys its fee counts
 */
export const standaloneTx = (built: BuiltTx, extraKeys = 0): StandaloneTx =>
  new (
    StandaloneTx as unknown as new (
      built: BuiltTx,
      extraKeys: number,
    ) => StandaloneTx
  )(built, extraKeys);
