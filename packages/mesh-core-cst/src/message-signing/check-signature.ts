import { ready } from "@cardano-sdk/crypto";

import { DataSignature, isHexString, stringToHex } from "@meshsdk/common";

import {
  Address,
  BaseAddress,
  CredentialCore,
  Ed25519PublicKey,
  EnterpriseAddress,
  Hash28ByteBase16,
  NetworkId,
  RewardAddress,
} from "../types";
import { CoseSign1, getPublicKeyFromCoseKey } from "./cose-sign1";

/**
 * Check the signature of a given data string
 * @param data The data string to verify the signature against
 * @param {key, signature} The signature obtained by `signData`
 * @param address Optional Bech32 string of a stake, stake_test1, addr, or addr_test1 address. If provided, this function will validate the signer's address against this value.
 * @returns boolean
 */
export const checkSignature = async (
  data: string,
  { key, signature }: DataSignature,
  address?: string,
): Promise<boolean> => {
  await ready();
  const builder = CoseSign1.fromCbor(signature);
  const publicKeyBuffer = getPublicKeyFromCoseKey(key);

  if (address) {
    let network = NetworkId.Mainnet;
    const paymentAddress = BaseAddress.fromAddress(Address.fromBech32(address));
    const coseSign1PublicKey = Ed25519PublicKey.fromBytes(publicKeyBuffer);

    const credential: CredentialCore = {
      hash: Hash28ByteBase16.fromEd25519KeyHashHex(
        coseSign1PublicKey.hash().hex(),
      ),
      type: 0,
    };

    if (address.startsWith("addr")) {
      if (address.startsWith("addr_test1")) {
        network = NetworkId.Testnet;
      }

      const stakeCredential = paymentAddress?.getStakeCredential();
      if (stakeCredential) {
        const paymentAddressBech32 = BaseAddress.fromCredentials(
          network,
          credential,
          stakeCredential,
        )
          .toAddress()
          .toBech32();

        if (address !== paymentAddressBech32) {
          const extractedRewardAddress = RewardAddress.fromCredentials(
            network,
            stakeCredential,
          )
            .toAddress()
            .toBech32();

          const rewardAddress = RewardAddress.fromCredentials(
            network,
            credential,
          )
            .toAddress()
            .toBech32();

          if (rewardAddress !== extractedRewardAddress) {
            return false;
          }
        }
      } else {
        const enterpriseAddress = EnterpriseAddress.fromCredentials(
          network,
          credential,
        )
          .toAddress()
          .toBech32();
        if (enterpriseAddress !== address) {
          return false;
        }
      }
    } else if (address.startsWith("stake")) {
      if (address.startsWith("stake_test1")) {
        network = NetworkId.Testnet;
      }
      const rewardAddress = RewardAddress.fromCredentials(network, credential)
        .toAddress()
        .toBech32();

      if (rewardAddress !== address) {
        return false;
      }
    } else {
      return false;
    }
  }

  if (builder.getPayload() === null) {
    return false;
  }
  const hexData = isHexString(data) ? data : stringToHex(data);
  if (Buffer.from(hexData, "hex").compare(builder.getPayload()!) !== 0) {
    return false;
  }

  return builder.verifySignature({
    publicKeyBuffer,
  });
};
