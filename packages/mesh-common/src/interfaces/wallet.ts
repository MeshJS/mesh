import { Asset, AssetExtended } from "../types";
import { IInitiator } from "./initiator";
import { ISigner } from "./signer";
import { ISubmitter } from "./submitter";

export interface IWallet extends IInitiator, ISigner, ISubmitter {
  getAssets(): Promise<AssetExtended[]>;
  getBalance(): Promise<Asset[]>;
  getExtensions(): Promise<number[]>;
  getUsedAddresses(): Promise<string[]>;
  getLovelace(): Promise<string>;
  getNetworkId(): Promise<number>;
  getRewardAddresses(): Promise<string[]>;
  getDRep(): Promise<
    | {
        publicKey: string;
        publicKeyHash: string;
        dRepIDCip105: string;
      }
    | undefined
  >;
  getUnusedAddresses(): Promise<string[]>;
  getPolicyIdAssets(policyId: string): Promise<AssetExtended[]>;
  getPolicyIds(): Promise<string[]>;
  getRegisteredPubStakeKeys(): Promise<
    | {
        pubStakeKeys: string[];
        pubStakeKeyHashes: string[];
      }
    | undefined
  >;
  getUnregisteredPubStakeKeys(): Promise<
    | {
        pubStakeKeys: string[];
        pubStakeKeyHashes: string[];
      }
    | undefined
  >;
}

/**
 * The part of a CIP-30 wallet api that a transaction builder calls. A wallet's full api object
 * has more members and still fits.
 */
export type Cip30WalletApi = {
  getNetworkId(): Promise<number>;
  /** The change address, as hex */
  getChangeAddress(): Promise<string>;
  /**
   * The wallet's UTxOs as CBOR; called without `amount` and `paginate`. `null` or `undefined`:
   * no UTxOs
   */
  getUtxos(): Promise<string[] | null | undefined>;
  /** The witnesses of this call, as a CBOR witness set */
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  /** Needed only by a wallet that submits */
  submitTx?(tx: string): Promise<string>;
  /**
   * UTxOs set aside as collateral, as CBOR; `amount` is a CBOR `Coin`. `null` or `undefined`:
   * none
   */
  getCollateral?(params: {
    amount: string;
  }): Promise<string[] | null | undefined>;
  /** Members a wallet offers outside the standard; some wallets keep `getCollateral` here */
  experimental?: {
    getCollateral?(params: {
      amount: string;
    }): Promise<string[] | null | undefined>;
  };
};
