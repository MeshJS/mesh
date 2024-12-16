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
