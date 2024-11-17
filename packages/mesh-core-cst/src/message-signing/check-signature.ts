import { Credential } from "@cardano-sdk/core/dist/cjs/Cardano";

import { DataSignature } from "@meshsdk/common";

import { StricaBip32PublicKey } from "../stricahq";
import {
  Address,
  BaseAddress,
  Ed25519KeyHashHex,
  EnterpriseAddress,
  Hash28ByteBase16,
  NetworkId,
  RewardAddress,
} from "../types";
import { CoseSign1, getPublicKeyFromCoseKey } from "./cose-sign1";

/** @param address - Optional Bech32 string of a stake, stake_test1, addr, or addr_test1 address. If provided, this function will validate the signer's address against this value. */
export const checkSignature = (
  data: string,
  { key, signature }: DataSignature,
  address?: string,
) => {
  const builder = CoseSign1.fromCbor(signature);
  const publicKeyBuffer = getPublicKeyFromCoseKey(key);

  if (address) {
    let network = NetworkId.Mainnet;
    const paymentAddress = BaseAddress.fromAddress(Address.fromBech32(address));
    const coseSign1PublicKey = new StricaBip32PublicKey(publicKeyBuffer);

    const credential: Credential = {
      hash: Hash28ByteBase16.fromEd25519KeyHashHex(
        Ed25519KeyHashHex(
          coseSign1PublicKey.toPublicKey().hash().toString("hex"),
        ),
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

  if (Buffer.from(data, "hex").compare(builder.getPayload()!) !== 0) {
    return false;
  }

  return builder.verifySignature({
    publicKeyBuffer,
  });
};
