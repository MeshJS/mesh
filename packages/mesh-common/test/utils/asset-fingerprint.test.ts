import { AssetFingerprint } from "@meshsdk/common";

function createFingerprint(policyId: string, assetName: string): string {
  const fingerprint = AssetFingerprint.fromParts(
    Buffer.from(policyId, "hex"),
    Buffer.from(assetName, "hex"),
  );
  return fingerprint.fingerprint();
}
test("Fingerprint is correctly generated", () => {
  expect(
    createFingerprint(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "",
    ),
  ).toEqual("asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3");

  expect(
    createFingerprint(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc37e",
      "",
    ),
  ).toEqual("asset1nl0puwxmhas8fawxp8nx4e2q3wekg969n2auw3");

  expect(
    createFingerprint(
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
      "",
    ),
  ).toEqual("asset1uyuxku60yqe57nusqzjx38aan3f2wq6s93f6ea");

  expect(
    createFingerprint(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "504154415445",
    ),
  ).toEqual("asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92");

  expect(
    createFingerprint(
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
      "504154415445",
    ),
  ).toEqual("asset1hv4p5tv2a837mzqrst04d0dcptdjmluqvdx9k3");

  expect(
    createFingerprint(
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
    ),
  ).toEqual("asset1aqrdypg669jgazruv5ah07nuyqe0wxjhe2el6f");

  expect(
    createFingerprint(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
    ),
  ).toEqual("asset17jd78wukhtrnmjh3fngzasxm8rck0l2r4hhyyt");

  expect(
    createFingerprint(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "0000000000000000000000000000000000000000000000000000000000000000",
    ),
  ).toEqual("asset1pkpwyknlvul7az0xx8czhl60pyel45rpje4z8w");
});

function roundtripFromHash(policyId: string, assetName: string): string {
  const fingerprint = AssetFingerprint.fromParts(
    Buffer.from(policyId, "hex"),
    Buffer.from(assetName, "hex"),
  );

  const hash = Buffer.from(fingerprint.hash(), "hex");

  const reconstructed = AssetFingerprint.fromHash(hash);
  return reconstructed.fingerprint();
}
test("Can generate fingerprint with hash", () => {
  expect(
    roundtripFromHash(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "",
    ),
  ).toEqual("asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3");

  expect(
    roundtripFromHash(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc37e",
      "",
    ),
  ).toEqual("asset1nl0puwxmhas8fawxp8nx4e2q3wekg969n2auw3");

  expect(
    roundtripFromHash(
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
      "",
    ),
  ).toEqual("asset1uyuxku60yqe57nusqzjx38aan3f2wq6s93f6ea");

  expect(
    roundtripFromHash(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "504154415445",
    ),
  ).toEqual("asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92");

  expect(
    roundtripFromHash(
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
      "504154415445",
    ),
  ).toEqual("asset1hv4p5tv2a837mzqrst04d0dcptdjmluqvdx9k3");

  expect(
    roundtripFromHash(
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
    ),
  ).toEqual("asset1aqrdypg669jgazruv5ah07nuyqe0wxjhe2el6f");

  expect(
    roundtripFromHash(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209",
    ),
  ).toEqual("asset17jd78wukhtrnmjh3fngzasxm8rck0l2r4hhyyt");

  expect(
    roundtripFromHash(
      "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373",
      "0000000000000000000000000000000000000000000000000000000000000000",
    ),
  ).toEqual("asset1pkpwyknlvul7az0xx8czhl60pyel45rpje4z8w");
});

test("can get hash from bech32", () => {
  expect(
    AssetFingerprint.fromBech32(
      "asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3",
    ).hash(),
  ).toEqual("1cadfc0e7068801d51d240d14a4085f2a3673cbb");

  expect(
    AssetFingerprint.fromBech32(
      "asset1nl0puwxmhas8fawxp8nx4e2q3wekg969n2auw3",
    ).hash(),
  ).toEqual("9fde1e38dbbf6074f5c609e66ae5408bb3641745");

  expect(
    AssetFingerprint.fromBech32(
      "asset1uyuxku60yqe57nusqzjx38aan3f2wq6s93f6ea",
    ).hash(),
  ).toEqual("e1386b734f20334f4f9000a4689fbd9c52a70350");
});

test("can get checksum from bech32", () => {
  expect(
    AssetFingerprint.fromBech32(
      "asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3",
    ).checksum(),
  ).toEqual("lgvlc3");

  expect(
    AssetFingerprint.fromBech32(
      "asset1nl0puwxmhas8fawxp8nx4e2q3wekg969n2auw3",
    ).checksum(),
  ).toEqual("n2auw3");

  expect(
    AssetFingerprint.fromBech32(
      "asset1uyuxku60yqe57nusqzjx38aan3f2wq6s93f6ea",
    ).checksum(),
  ).toEqual("93f6ea");
});
