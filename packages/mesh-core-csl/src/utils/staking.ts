import { csl, toRewardAddress } from "../deser";

export const poolIdHexToBech32 = (poolIdHash: string) => {
  const cslPoolIdHash = csl.Ed25519KeyHash.from_hex(poolIdHash);
  return cslPoolIdHash.to_bech32("pool");
};

export const poolIdBech32ToHex = (poolIdBech32: string) => {
  const cslPoolIdHash = csl.Ed25519KeyHash.from_bech32(poolIdBech32);
  return Buffer.from(cslPoolIdHash.to_bytes()).toString("hex");
};

export const baseAddressToStakeAddress = (
  baseAddressBech32: string,
  network = 1,
) => {
  const networkId =
    network === 1
      ? csl.NetworkId.mainnet().kind()
      : csl.NetworkId.testnet().kind();
  const stakeCred = csl.BaseAddress.from_address(
    csl.Address.from_bech32(baseAddressBech32),
  )?.stake_cred();
  if (stakeCred) {
    const stakeAddress = csl.RewardAddress.new(networkId, stakeCred)
      .to_address()
      .to_bech32();
    return stakeAddress;
  }
  return "";
};

export const rewardAddressToKeyHash = (rewardBech32: string) => {
  return toRewardAddress(rewardBech32)?.payment_cred().to_keyhash()?.to_hex();
};
