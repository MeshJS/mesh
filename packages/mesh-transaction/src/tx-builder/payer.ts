import type {
  Cip30WalletApi,
  IFetcher,
  ISubmitter,
  NetworkConfig,
  UTxO,
} from "@meshsdk/common";
import {
  Address,
  deserializeTxUnspentOutput,
  fromValue,
  resolveDataHash,
} from "@meshsdk/core-cst";

import type { NetworkEntry } from "./network";
import { throwIfAborted } from "./abort";
import { TxBuildError } from "./errors";
import { checkNetworks, utxoEntry } from "./network";
import { addressText, errorText } from "./parts/normalize";

/** The vkey witnesses a transaction needs, as key hashes */
export type RequiredKeys = readonly string[];

/**
 * A wallet in the Mesh format: bech32 addresses and UTxO objects, as `MeshWallet` and
 * `BrowserWallet` give them. `getChangeAddress` and `getUtxos` make it a payer.
 */
export type MeshFormatWallet = {
  getChangeAddress(): Promise<string>;
  /**
   * The wallet's own UTxO view. A wallet without it, or a `MeshWallet` made without a fetcher
   * (its error has `code: "FETCHER_REQUIRED"`), is read at its change address through the
   * builder's provider.
   */
  getUtxos?(): Promise<UTxO[]>;
  /** Checked against the builder's network before anything is selected */
  getNetworkId?(): Promise<number>;
  /** Signs with the keys of the given hashes, answering with a witness set */
  signTxWitnesses?(tx: string, keyHashes?: RequiredKeys): Promise<string>;
  /** Signs a transaction */
  signTx?(
    tx: string,
    partialSign?: boolean,
    returnFullTx?: boolean,
  ): Promise<string>;
  /** Submits a transaction, when the wallet is given as a submitter */
  submitTx?(tx: string): Promise<string>;
};

/** A wallet as the builder takes it: a CIP-30 api, or a wallet in the Mesh format */
export type TxWallet = Cip30WalletApi | MeshFormatWallet;

/** A payer read once, as data: its change address in bech32 and its UTxOs */
export type PayerSnapshot = {
  readonly changeAddress: string;
  readonly utxos: readonly UTxO[];
};

/**
 * A payer given as data. The address may be bech32 or hex, and each UTxO an object or the CBOR
 * of a transaction unspent output, so what a CIP-30 wallet returns can be passed as it is.
 */
export type PayerSnapshotInput = {
  readonly changeAddress: string;
  readonly utxos: readonly (UTxO | string)[];
};

/**
 * Who pays for a build and gets its change:
 * - a wallet: its change address and UTxOs, read at this build;
 * - an address, bech32 or hex: change to it, its UTxOs read through the provider;
 * - a snapshot: both as given, nothing read.
 */
export type Payer = TxWallet | string | PayerSnapshotInput;

/** Whether a wallet can submit, so that it can be given where a submitter is asked for */
export function canSubmit<W extends object>(
  wallet: W,
): wallet is W & ISubmitter {
  return (
    typeof wallet === "object" &&
    wallet !== null &&
    typeof (wallet as { submitTx?: unknown }).submitTx === "function"
  );
}

/**
 * A payer as given, checked and converted as far as that needs no request. A snapshot made from
 * a CIP-30 payer already read carries that payer's collateral fallback.
 */
export type PayerSource =
  | {
      readonly form: "snapshot";
      readonly snapshot: PayerSnapshot;
      readonly getCollateral?: GetCollateral;
    }
  | { readonly form: "address"; readonly address: string }
  | { readonly form: "wallet"; readonly wallet: TxWallet };

const PAYER_FORMS =
  "a wallet (a CIP-30 api, or an object with getChangeAddress), an address in bech32 or hex, or a snapshot { changeAddress, utxos }";

const HASH_32_ANY_CASE = /^[0-9a-f]{64}$/i;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** An address text in canonical form, bech32 or base58 for Byron; throws for any other text */
export const toAddressText = (text: unknown): string => {
  if (typeof text !== "string") throw new Error("an address must be a string");
  let parsed: Address | null;
  try {
    parsed = Address.fromString(text);
  } catch (error) {
    throw new Error(`invalid address ${text}: ${errorText(error)}`);
  }
  if (!parsed) throw new Error(`invalid address ${text}`);
  // A reward address holds no UTxOs and cannot take change
  if (parsed.asReward())
    throw new Error(`${text} is a reward address, not a payment address`);
  return addressText(parsed);
};

/**
 * A UTxO from the CBOR of a transaction unspent output: the object core-cst's converter gives,
 * with a Byron address in base58 and the transaction hash in lower case
 */
const decodeUtxo = (cbor: string): UTxO => {
  const unspent = deserializeTxUnspentOutput(cbor);
  const output = unspent.output();
  const datum = output.datum();
  const plutusData = datum?.asInlineData()?.toCbor().toString();
  const dataHash =
    datum?.asDataHash()?.toString() ??
    (plutusData ? resolveDataHash(plutusData, "CBOR") : undefined);
  const scriptRef = output.scriptRef()?.toCbor().toString();
  return {
    input: {
      txHash: unspent.input().transactionId().toString().toLowerCase(),
      outputIndex: Number(unspent.input().index()),
    },
    output: {
      address: addressText(output.address()),
      amount: fromValue(output.amount()),
      ...(dataHash !== undefined && { dataHash }),
      ...(plutusData !== undefined && { plutusData }),
      ...(scriptRef !== undefined && { scriptRef }),
    },
  };
};

/**
 * A copy of a UTxO object, its transaction hash in lower case and its address in canonical
 * form, so that out refs and addresses compare as the parts store them
 */
export const copyUtxo = (value: unknown): UTxO => {
  if (!isObject(value) || !isObject(value.input) || !isObject(value.output))
    throw new Error("a UTxO is an object { input, output }");
  const { txHash, outputIndex } = value.input;
  if (typeof txHash !== "string" || !HASH_32_ANY_CASE.test(txHash))
    throw new Error(`invalid transaction hash ${String(txHash)}`);
  if (
    typeof outputIndex !== "number" ||
    !Number.isInteger(outputIndex) ||
    outputIndex < 0
  )
    throw new Error(`invalid output index ${String(outputIndex)}`);
  if (!Array.isArray(value.output.amount))
    throw new Error("a UTxO's amount is a list of assets");
  // `input` and `output` only: the `label` and `change` of a built output are not the UTxO's
  const utxo: UTxO = {
    input: { txHash: txHash.toLowerCase(), outputIndex },
    output: structuredClone(value.output) as unknown as UTxO["output"],
  };
  utxo.output.address = toAddressText(value.output.address);
  return utxo;
};

/** A UTxO given as an object or as CBOR, converted */
export const toUtxo = (entry: unknown): UTxO =>
  typeof entry === "string" ? decodeUtxo(entry) : copyUtxo(entry);

const invalidPayer = (value: unknown, reason: string, cause?: unknown) =>
  new TxBuildError("INVALID_OPTION", `invalid payer: ${reason}`, {
    details: { option: "payer", value, allowed: PAYER_FORMS },
    ...(cause !== undefined && { cause }),
  });

/**
 * Tells the form of a payer by its shape (a string, then a wallet, then a snapshot) and converts
 * what is given as data: an address and a snapshot. Nothing is requested.
 * @throws TxBuildError MISSING_PAYER for no payer; INVALID_OPTION for a payer of no known form,
 *   an address that does not parse or is a reward address, a snapshot entry that is not a UTxO
 */
export const toPayerSource = (payer: unknown): PayerSource => {
  if (payer === undefined || payer === null)
    throw new TxBuildError(
      "MISSING_PAYER",
      `no payer: give the build a payer, ${PAYER_FORMS}`,
    );
  if (typeof payer === "string") {
    try {
      return { form: "address", address: toAddressText(payer) };
    } catch (error) {
      throw invalidPayer(payer, errorText(error), error);
    }
  }
  if (!isObject(payer))
    throw invalidPayer(payer, `expected ${PAYER_FORMS}; got ${String(payer)}`);
  if (typeof payer.getChangeAddress === "function")
    return { form: "wallet", wallet: payer as TxWallet };
  if (typeof payer.changeAddress === "string" && Array.isArray(payer.utxos)) {
    let changeAddress: string;
    try {
      changeAddress = toAddressText(payer.changeAddress);
    } catch (error) {
      throw invalidPayer(
        payer.changeAddress,
        `the snapshot's change address: ${errorText(error)}`,
        error,
      );
    }
    const utxos = (payer.utxos as unknown[]).map((entry, i) => {
      try {
        return toUtxo(entry);
      } catch (error) {
        throw invalidPayer(
          entry,
          `the snapshot's UTxO ${i} is neither a UTxO object nor the CBOR of one: ${errorText(error)}`,
          error,
        );
      }
    });
    return { form: "snapshot", snapshot: { changeAddress, utxos } };
  }
  throw invalidPayer(
    payer,
    `expected ${PAYER_FORMS}; got an object of none of these forms`,
  );
};

/** The addresses a payer is given with, for the network check made before any request */
export const givenPayerEntries = (source: PayerSource): NetworkEntry[] => {
  switch (source.form) {
    case "address":
      return [{ role: "payer", address: source.address }];
    case "snapshot":
      return [
        { role: "payer", address: source.snapshot.changeAddress },
        ...source.snapshot.utxos.map((utxo) => utxoEntry(utxo)),
      ];
    default:
      return [];
  }
};

/** What reading a payer goes through */
export type PayerReadContext = {
  network: NetworkConfig;
  /** The provider as given, not its cache: a payer's UTxOs are always read fresh */
  provider?: IFetcher;
  /** No read is started once it is aborted */
  signal?: AbortSignal;
};

/** What a CIP-30 api's `getCollateral` takes and answers */
export type GetCollateral = (params: {
  amount: string;
}) => Promise<string[] | null | undefined>;

/**
 * A payer as read: the snapshot, and for a CIP-30 api, its `getCollateral` (or
 * `experimental.getCollateral`), the fallback for collateral
 */
export type PayerRead = {
  readonly snapshot: PayerSnapshot;
  readonly getCollateral?: GetCollateral;
};

/** The numeric `code` of a thrown value, as CIP-30 errors carry it; read without instanceof */
export const walletCodeOf = (error: unknown): number | undefined => {
  const code = isObject(error) ? error.code : undefined;
  return typeof code === "number" ? code : undefined;
};

/**
 * A wallet that cannot read UTxOs without a fetcher: the error's code, or, from a wallet released
 * before it had one, the start of its message
 */
const isFetcherRequired = (error: unknown) => {
  if (!isObject(error)) return false;
  if (error.code === "FETCHER_REQUIRED") return true;
  return (
    typeof error.message === "string" &&
    error.message.startsWith("[MeshWallet] Fetcher is required")
  );
};

const walletFailed = (what: string, error: unknown, decoding = false) => {
  const walletCode = decoding ? undefined : walletCodeOf(error);
  return new TxBuildError(
    "WALLET_FAILED",
    `reading the payer wallet failed: ${what}: ${errorText(error)}`,
    {
      details: walletCode === undefined ? {} : { walletCode },
      cause: error,
    },
  );
};

/** Calls a wallet method, a synchronous throw becoming a rejection */
const attempt = <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return Promise.resolve(call());
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * The UTxOs at an address, from the provider as given and so past its short-lived cache
 * @throws TxBuildError MISSING_FETCHER without a provider; PROVIDER_FAILED when the read fails
 */
const fetchPayerUtxos = async (
  address: string,
  ctx: PayerReadContext,
): Promise<UTxO[]> => {
  const { provider } = ctx;
  if (!provider)
    throw new TxBuildError(
      "MISSING_FETCHER",
      `the UTxOs of the payer ${address} have to be read through a provider, and the builder has none`,
    );
  let utxos: unknown;
  try {
    utxos = await provider.fetchAddressUTxOs(address);
  } catch (error) {
    throw providerFailed(address, error);
  }
  try {
    if (utxos === undefined || utxos === null) return [];
    if (!Array.isArray(utxos)) throw new Error("the answer is not a list");
    return utxos.map(copyUtxo);
  } catch (error) {
    throw providerFailed(address, error);
  }
};

const providerFailed = (address: string, error: unknown) =>
  new TxBuildError(
    "PROVIDER_FAILED",
    `fetching the UTxOs of the payer ${address} failed: ${errorText(error)}`,
    { details: { operation: "fetchAddressUTxOs" }, cause: error },
  );

/**
 * Reads a wallet once: its change address, UTxOs and network id, all three asked at once. The
 * UTxOs of a wallet that cannot read them are read at its change address through the provider.
 * The network id (only mainnet against the test networks) and the change address are checked
 * before that read, so the provider is never asked about an address of another network; the
 * UTxOs are checked once they are read.
 */
const readWallet = async (
  wallet: TxWallet,
  ctx: PayerReadContext,
): Promise<PayerRead> => {
  const ownUtxos = typeof wallet.getUtxos === "function";
  if (!ownUtxos && !ctx.provider)
    throw new TxBuildError(
      "MISSING_FETCHER",
      "the payer wallet cannot read its UTxOs, and the builder has no provider to read them through",
    );
  const [address, utxos, networkId] = await Promise.allSettled([
    attempt(() => wallet.getChangeAddress()),
    ownUtxos
      ? attempt(() => wallet.getUtxos!() as Promise<unknown>)
      : Promise.resolve(undefined),
    typeof wallet.getNetworkId === "function"
      ? attempt(() => wallet.getNetworkId!())
      : Promise.resolve(undefined),
  ]);
  if (address.status === "rejected")
    throw walletFailed("getChangeAddress", address.reason);
  if (networkId.status === "rejected")
    throw walletFailed("getNetworkId", networkId.reason);
  let changeAddress: string;
  try {
    changeAddress = toAddressText(address.value);
  } catch (error) {
    throw walletFailed("its change address", error, true);
  }
  const stated = networkId.value;
  checkNetworks(ctx.network, [
    ...(stated === 0 || stated === 1
      ? [{ role: "wallet" as const, networkId: stated }]
      : []),
    { role: "payer", address: changeAddress },
  ]);
  let read: UTxO[];
  if (!ownUtxos) {
    throwIfAborted(ctx.signal);
    read = await fetchPayerUtxos(changeAddress, ctx);
  } else if (utxos.status === "rejected") {
    if (!isFetcherRequired(utxos.reason))
      throw walletFailed("getUtxos", utxos.reason);
    throwIfAborted(ctx.signal);
    read = await fetchPayerUtxos(changeAddress, ctx);
  } else {
    const answer = utxos.value;
    try {
      if (answer === undefined || answer === null) read = [];
      else if (!Array.isArray(answer))
        throw new Error("getUtxos answered with something that is not a list");
      else read = answer.map(toUtxo);
    } catch (error) {
      throw walletFailed("its UTxOs", error, true);
    }
  }
  checkNetworks(
    ctx.network,
    read.map((utxo) => utxoEntry(utxo)),
  );
  const snapshot = { changeAddress, utxos: read };
  // A wallet answering in hex is a CIP-30 api; one in the Mesh format is never asked for
  // collateral, whatever members it has
  const getCollateral = isHexAddress(address.value)
    ? collateralMethodOf(wallet as Cip30WalletApi)
    : undefined;
  return getCollateral ? { snapshot, getCollateral } : { snapshot };
};

/** Whether an address text is the hex of the address's bytes, as a CIP-30 api gives it */
const isHexAddress = (text: unknown) =>
  typeof text === "string" &&
  /^[0-9a-f]+$/i.test(text) &&
  Address.fromString(text)?.toBytes().toString() === text.toLowerCase();

/** `getCollateral`, else `experimental.getCollateral`, bound to the api; one of them only */
const collateralMethodOf = (api: Cip30WalletApi): GetCollateral | undefined => {
  if (typeof api.getCollateral === "function")
    return (params) => api.getCollateral!(params);
  const { experimental } = api as { experimental?: unknown };
  if (
    isObject(experimental) &&
    typeof experimental.getCollateral === "function"
  )
    return (params) =>
      (experimental.getCollateral as GetCollateral).call(experimental, params);
  return undefined;
};

/**
 * Reads a payer whose given data was checked: a wallet, or the UTxOs of an address; a snapshot
 * is returned as it is. A CIP-30 api also gives its collateral method. What was read is checked
 * for its network: the wallet's network id (only mainnet against the test networks), the change
 * address and every UTxO.
 */
export const readPayerSource = async (
  source: PayerSource,
  ctx: PayerReadContext,
): Promise<PayerRead> => {
  if (source.form === "snapshot")
    return source.getCollateral
      ? { snapshot: source.snapshot, getCollateral: source.getCollateral }
      : { snapshot: source.snapshot };
  if (source.form === "wallet") return readWallet(source.wallet, ctx);
  const utxos = await fetchPayerUtxos(source.address, ctx);
  checkNetworks(
    ctx.network,
    utxos.map((utxo) => utxoEntry(utxo)),
  );
  return { snapshot: { changeAddress: source.address, utxos } };
};
