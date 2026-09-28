import { MeshWallet } from "@meshsdk/wallet";

import { FakeFetcher, FakeSubmitter } from "./fakes";

/**
 * TEST-ONLY mnemonic. Never fund this wallet - it is committed to a public repository and
 * anyone can derive its keys.
 */
export const TEST_MNEMONIC = [
  "borrow", "cream", "heavy", "question", "arm", "eager",
  "popular", "defy", "rebel", "hole", "punch", "limb",
  "stool", "decade", "police", "spin", "floor", "behave",
  "seek", "blur", "duck", "crash", "order", "auction",
];

/** A second TEST-ONLY mnemonic, distinct from `TEST_MNEMONIC`, for seller/counterparty roles. */
export const TEST_SELLER_MNEMONIC = [
  "amazing", "strategy", "oil", "choose", "noble", "maximum",
  "velvet", "border", "sudden", "grain", "fork", "salon",
  "region", "father", "nuclear", "perfect", "filter", "tell",
  "reunion", "hole", "calm", "large", "antique", "maximum",
];

export const buildTestWallet = async (
  fetcher: FakeFetcher = new FakeFetcher(),
  submitter: FakeSubmitter = new FakeSubmitter(),
  words: string[] = TEST_MNEMONIC,
): Promise<MeshWallet> => {
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher,
    submitter,
    key: { type: "mnemonic", words },
  });
  await wallet.init();
  return wallet;
};
