import type { Budget, Network } from "../types";

export * from "./protocol-parameters";
export * from "./supported-wallets";
export * from "./cost-models";
export * from "./language-views";

export const DEFAULT_REDEEMER_BUDGET: Budget = {
  mem: 7_000_000,
  steps: 3_000_000_000,
};

export const POLICY_ID_LENGTH = 56;

export const LANGUAGE_VERSIONS = {
  V1: "V1",
  V2: "V2",
  V3: "V3",
};

export const HARDENED_KEY_START = 0x80000000;

export const SUPPORTED_CLOCKS: Record<
  Network,
  [epoch: string, slot: string, systemStart: string, epochLength: string]
> = {
  testnet: ["74", "1598400", "1595967616", "432000"],
  preview: ["183", "15811222", "1682467200", "86400"],
  preprod: ["65", "26438400", "1682121600", "432000"],
  mainnet: ["208", "4492800", "1596059091", "432000"],
};

export const SUPPORTED_HANDLES: Record<number, string> = {
  0: "8d18d786e92776c824607fd8e193ec535c79dc61ea2405ddf3b09fe3",
  1: "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a",
};

export const SUPPORTED_OGMIOS_LINKS: Record<Network, string> = {
  mainnet: "wss://ogmios-api.mainnet.dandelion.link",
  preprod: "wss://ogmios-api.iohk-preprod.dandelion.link",
  preview: "__TBD_SOON_TM__",
  testnet: "wss://ogmios-api.testnet.dandelion.link",
};

export const SUPPORTED_TOKENS = {
  LQ: "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51",
  MIN: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
  NTX: "edfd7a1d77bcb8b884c474bdc92a16002d1fb720e454fa6e993444794e5458",
  iBTC: "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069425443",
  iETH: "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069455448",
  iUSD: "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344",
  MILK: "8a1cfae21368b8bebbbed9800fec304e95cce39a2a57dc35e2e3ebaa4d494c4b",
  AGIX: "f43a62fdc3965df486de8a0d32fe800963589c41b38946602a0dc53541474958",
  MELD: "6ac8ef33b510ec004fe11585f7c5a9f0c07f0c23428ab4f29c1d7d104d454c44",
  INDY: "533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0494e4459",
  CLAY: "38ad9dc3aec6a2f38e220142b9aa6ade63ebe71f65e7cc2b7d8a8535434c4159",
  MCOS: "6f46e1304b16d884c85c62fb0eef35028facdc41aaa0fd319a152ed64d434f53",
  DING: "ce5b9e0f8a88255b65f2e4d065c6e716e9fa9a8a86dfb86423dd1ac044494e47",
  GERO: "10a49b996e2402269af553a8a96fb8eb90d79e9eca79e2b4223057b64745524f",
  NMKR: "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc928434894e4d4b52",
  PAVIA: "884892bcdc360bcef87d6b3f806e7f9cd5ac30d999d49970e7a903ae5041564941",
  HOSKY: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59",
  YUMMI: "078eafce5cd7edafdf63900edef2c1ea759e77f30ca81d6bbdeec92479756d6d69",
  C3: "8e51398904a5d3fc129fbf4f1589701de23c7824d5c90fdb9490e15a434841524c4933",
  GIMBAL:
    "2b0a04a7b60132b1805b296c7fcb3b217ff14413991bf76f72663c3067696d62616c",
  SUNDAE:
    "9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d7753554e444145",
  GREENS:
    "4623ab311b7d982d8d26fcbe1a9439ca56661aafcdcd8d8a0ef31fd6475245454e53",
  GENS: "dda5fdb1002f7389b33e036b6afee82a8189becb6cba852e8b79b4fb0014df1047454e53",
  SOCIETY:
    "25f0fc240e91bd95dcdaebd2ba7713fc5168ac77234a3d79449fc20c534f4349455459",
  DJED: "8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344",
  SHEN: "8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd615368656e4d6963726f555344",
  WMT: "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e",
  COPI: "b6a7467ea1deb012808ef4e87b5ff371e85f7142d7b356a40d9b42a0436f726e75636f70696173205b76696120436861696e506f72742e696f5d",
};

/**
 * The utility function to append the bytes for CIP-68 100 token in front of the token hex
 * @param tokenNameHex The hex of the token name
 * @returns The hex of the token name with the CIP-68 100 bytes appended
 */
export const CIP68_100 = (tokenNameHex: string) => {
  return `000643b0${tokenNameHex}`;
};

/**
 * The utility function to append the bytes for CIP-68 222 token in front of the token hex
 * @param tokenNameHex The hex of the token name
 * @returns The hex of the token name with the CIP-68 222 bytes appended
 */
export const CIP68_222 = (tokenNameHex: string) => {
  return `000de140${tokenNameHex}`;
};
