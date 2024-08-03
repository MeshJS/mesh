import {
  byteString,
  conStr,
  conStr0,
  conStr1,
  conStr2,
  mConStr,
  mConStr0,
  mConStr1,
  mConStr2,
} from "@meshsdk/common";

import { serializeData } from "./common";

const testByteString = "abcd";

describe("Plutus data type", () => {
  describe("constructor", () => {
    test("mConStr", () => {
      const mesh = mConStr(0, [testByteString]);
      const [meshCbor, jsonCbor] = serializeData(
        mesh,
        conStr(0, [byteString(testByteString)]),
      );
      expect(meshCbor).toBe(jsonCbor);
    });

    test("mConStr0", () => {
      const mesh = mConStr0([testByteString]);
      const [meshCbor, jsonCbor] = serializeData(
        mesh,
        conStr0([byteString(testByteString)]),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
    test("mConStr1", () => {
      const mesh = mConStr1([testByteString]);
      const [meshCbor, jsonCbor] = serializeData(
        mesh,
        conStr1([byteString(testByteString)]),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
    test("mConStr2", () => {
      const mesh = mConStr2([testByteString]);
      const [meshCbor, jsonCbor] = serializeData(
        mesh,
        conStr2([byteString(testByteString)]),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
  });
});
