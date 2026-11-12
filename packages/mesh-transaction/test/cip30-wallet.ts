import { Cip30WalletApi, IFetcher, ISubmitter } from "@meshsdk/core";
import { MeshWallet } from "@meshsdk/wallet";

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

/**
 * A CIP-30 wallet api made from a `MeshWallet` of the payment account: its change address in
 * hex, its UTxOs as CBOR, and `signTx` answering with the witness set of the payment key
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
    signTx: (tx: string) => wallet.signTx(tx, true, false),
    ...(submitter && { submitTx: (tx: string) => submitter.submitTx(tx) }),
    ...(collateral && { getCollateral: collateral }),
  };
};
