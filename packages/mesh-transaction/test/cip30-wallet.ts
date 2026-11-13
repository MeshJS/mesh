import {
  Cip30WalletApi,
  IFetcher,
  ISubmitter,
  NativeScriptPrototype,
} from "@meshsdk/core";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import { requiredSigners } from "../src/tx-builder";

export type Cip30WalletOptions = {
  /** The wallet's mnemonic */
  words: string[];
  /** What the wallet reads its UTxOs through */
  fetcher: IFetcher;
  networkId?: 0 | 1;
  /** Gives the wallet `submitTx` */
  submitter?: ISubmitter;
  /** Replaces what `getUtxos` answers */
  utxos?: () => Promise<string[] | null | undefined>;
  /** Gives the wallet `getCollateral`, answering with this */
  collateral?: (params: {
    amount: string;
  }) => Promise<string[] | null | undefined>;
};

/** A CIP-30 api over a `MeshWallet`, with the wallet itself, for tests */
export type Cip30Wallet = Cip30WalletApi & { readonly wallet: MeshWallet };

/** Every key a native script names */
const scriptKeys = (script: NativeScriptPrototype): string[] => {
  switch (script.type) {
    case "SCRIPT_PUBKEY":
      return [script.value.addr_keyhash];
    case "SCRIPT_ALL":
    case "SCRIPT_ANY":
    case "SCRIPT_N_OF_K":
      return script.value.native_scripts.flatMap(scriptKeys);
    default:
      return [];
  }
};

/**
 * The keys a transaction needs, with every key its native scripts name; the UTxOs it spends
 * are read through the fetcher
 */
const neededKeys = async (tx: string, fetcher: IFetcher) => {
  const body = Transaction.fromCbor(TxCBOR(tx)).body();
  const spent = await Promise.all(
    [...body.inputs().values(), ...(body.collateral()?.values() ?? [])].map(
      async (input) =>
        (
          await fetcher.fetchUTxOs(input.transactionId(), Number(input.index()))
        )[0]!,
    ),
  );
  const signers = requiredSigners(tx, spent);
  return [...signers.keyHashes, ...signers.nativeScripts.flatMap(scriptKeys)];
};

/**
 * A CIP-30 wallet api made from a `MeshWallet` of the payment account: its change address in
 * hex, its UTxOs as CBOR, and `signTx` answering with one witness set of each of its payment,
 * stake and DRep keys the transaction needs, or with `""` when it needs none of them
 */
export const cip30Wallet = async (
  options: Cip30WalletOptions,
): Promise<Cip30Wallet> => {
  const wallet = new MeshWallet({
    networkId: options.networkId ?? 0,
    key: { type: "mnemonic", words: options.words },
    fetcher: options.fetcher,
  });
  await wallet.init();
  const { submitter, utxos, collateral } = options;
  return {
    wallet,
    getNetworkId: () => wallet.getNetworkId(),
    getChangeAddress: () => wallet.getChangeAddressHex(),
    getUtxos: utxos ?? (() => wallet.getUtxosHex()),
    signTx: async (tx: string) => {
      const witnesses = await wallet.signTxWitnesses(
        tx,
        await neededKeys(tx, options.fetcher),
      );
      return witnesses === "a0" ? "" : witnesses;
    },
    ...(submitter && { submitTx: (tx: string) => submitter.submitTx(tx) }),
    ...(collateral && { getCollateral: collateral }),
  };
};
