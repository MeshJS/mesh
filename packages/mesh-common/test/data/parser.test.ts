import {
  bytesToHex,
  fromUTF8,
  hexToBytes,
  hexToString,
  isHexString,
  parseAssetUnit,
  stringToHex,
  toBytes,
  toUTF8,
} from "@meshsdk/core";

describe("Data parser utils", () => {
  const hexStr = "626f6f6f";
  const str = "booo";
  const buf = Buffer.from(str);
  const asset =
    "d65287fa32b1c9880150b548ce32d503000152fe1cc3e3947eb151901370db9a";
  const assetUnit = {
    policyId: "d65287fa32b1c9880150b548ce32d503000152fe1cc3e3947eb15190",
    assetName: "1370db9a",
  };

  it("converts bytes array to hex string", () => {
    expect(bytesToHex(buf)).toStrictEqual(hexStr);
  });

  it("converts hex string to bytes array", () => {
    expect(hexToBytes(hexStr)).toStrictEqual(buf);
  });

  it("converts utf-8 string to hex string", () => {
    expect(stringToHex(str)).toStrictEqual(hexStr);
  });

  it("verifies hex string correctness", () => {
    expect(isHexString(hexStr)).toBeTruthy();
  });

  it("converts hex string to utf-8 string", () => {
    expect(hexToString(hexStr)).toStrictEqual(str);
  });

  it("converts hex or utf-8 string to bytes", () => {
    expect(toBytes(hexStr)).toStrictEqual(buf);
    expect(toBytes(str)).toStrictEqual(buf);
  });

  it("converts utf-8 string to hex string", () => {
    expect(fromUTF8(str)).toStrictEqual(hexStr);
  });

  it("converts hex string to utf-8 string", () => {
    expect(toUTF8(hexStr)).toStrictEqual(str);
  });

  it("parse asset unit into an object with policyId and assetName", () => {
    expect(parseAssetUnit(asset)).toStrictEqual(assetUnit);
  });
});
