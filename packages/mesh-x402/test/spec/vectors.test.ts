/** Encoding test vectors copied verbatim from specs/schemes/exact/scheme_exact_cardano.md. */
import { dataFromCbor } from "@harmoniclabs/plutus-data";

import { fromBuilderToPlutusData } from "@meshsdk/core-cst";

import {
  buildIdentifierText,
  buildMasumiLockDatum,
  credentialsToBech32,
  decodeBlockchainIdentifier,
  encodeBlockchainIdentifier,
} from "../../src/masumi";

const CONTRACT =
  "addr_test1wzs4e6wc95hkwezlccjw9mdvq0r0rsgx6zk34avptga3ftgn37w4g";

describe("Masumi compatibility identifier (spec vectors)", () => {
  it("unregistered seller with an empty buyer nonce", () => {
    const text = buildIdentifierText({
      sellerNonce: "11".repeat(32),
      agentIdentifier: undefined,
      buyerNonce: "",
      referenceSignature: "55".repeat(16),
      referenceKey: "a10101",
      contractAddress: CONTRACT,
    });
    expect(text).toBe(
      `${"11".repeat(32)}..${"55".repeat(16)}.a10101.${CONTRACT}`,
    );
    const expected =
      "230d7c6574f41d1c0acc96ade8eae04360019f607004d8809c07d005c053019cae007700bce8058680d89818c04e44002c035931a2c00daf5e00ac9bf00b6c401b80473c6535d00e6003cb8b110199db615001ca8eecc6019b58076c603b13763a80";
    expect(encodeBlockchainIdentifier(text)).toBe(expected);
    expect(decodeBlockchainIdentifier(expected)).toBe(text);
  });

  it("registered seller", () => {
    const text = buildIdentifierText({
      sellerNonce: "22".repeat(32),
      agentIdentifier: `${"aa".repeat(28)}01`,
      buyerNonce: "01020304050607",
      referenceSignature: "66".repeat(16),
      referenceKey: "a10102",
      contractAddress: CONTRACT,
    });
    const expected =
      "130d7c6574f4218314e4b56f46e00602300e972d82c0662c0162c0562c0362c0763d6975b7d8f3b6f3874381e004d0402700fa005c0298067093803b802f19e4a6d05018c02715001601ac154a5006d36680560bb405b4100dc0239611ae64073001eb494192e4700e000e121e70240066610076240c0ae41e400000";
    expect(encodeBlockchainIdentifier(text)).toBe(expected);
    expect(decodeBlockchainIdentifier(expected)).toBe(text);
  });
});

describe("Masumi escrow datum (spec vector)", () => {
  it("encodes the same Plutus Data tree as the spec's CBOR", () => {
    const buyerAddress = credentialsToBech32(
      { payment: { isScript: false, hash: "11".repeat(28) } },
      0,
    );
    const sellerAddress = credentialsToBech32(
      { payment: { isScript: false, hash: "22".repeat(28) } },
      0,
    );
    const datum = buildMasumiLockDatum({
      buyerAddress,
      sellerAddress,
      referenceKey: "a10101",
      referenceSignature: "55".repeat(16),
      sellerNonce: "33".repeat(32),
      buyerNonce: "",
      agentIdentifier: "",
      collateralReturnLovelace: 1435230n,
      inputHash: "44".repeat(32),
      payByTime: 1785756000000n,
      submitResultTime: 1785759600000n,
      unlockTime: 1785763200000n,
      externalDisputeUnlockTime: 1785766800000n,
    });
    const ours = fromBuilderToPlutusData({
      type: "Mesh",
      content: datum,
    }).toCbor();
    const specCbor =
      "d8799fd8799fd8799f581c11111111111111111111111111111111111111111111111111111111ffd87a80ffd87a80d8799fd8799f581c22222222222222222222222222222222222222222222222222222222ffd87a80ffd87a8043a1010150555555555555555555555555555555555820333333333333333333333333333333333333333333333333333333333333333340401a0015e65e58204444444444444444444444444444444444444444444444444444444444444444401b0000019fc75a1f001b0000019fc7910d801b0000019fc7c7fc001b0000019fc7feea800000d87980ff";
    expect(dataFromCbor(ours).toJson()).toEqual(
      dataFromCbor(specCbor).toJson(),
    );
  });
});
