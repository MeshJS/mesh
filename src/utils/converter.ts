// import Cardano from "../cardano";

// export const fromBech32 = (bech32) =>
//   Cardano.Instance.BaseAddress.from_address(
//     Cardano.Instance.Address.from_bech32(bech32)
//   );

export const fromHex = (hex) => Buffer.from(hex, "hex");

export const toHex = (bytes) => Buffer.from(bytes).toString("hex");

export const fromLovelace = (lovelace) => lovelace / 1000000;

export const toLovelace = (ada) => ada * 1000000;

export const fromStr = (str) => Buffer.from(str, "utf-8");

export const toStr = (bytes) => String.fromCharCode.apply(String, bytes);
