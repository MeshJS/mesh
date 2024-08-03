import {
  Asset,
  byteString,
  dict,
  Dict,
  Integer,
  integer,
  MeshValue,
  MValue,
  mValue,
  Value,
  value,
} from "@meshsdk/common";

import { mockUnit } from "./common";

describe("value", () => {
  it("should create a new Value instance with the correct value", () => {
    const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
    const datum: Value = value(val);
    const nameMap = dict<Integer>([[byteString(""), integer(1000000)]]);
    const valMap = dict<Dict<Integer>>([[byteString(""), nameMap]]);
    expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
  });
  it("Simple token Value", () => {
    const val: Asset[] = [
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
        quantity: "345",
      },
    ];
    const datum: Value = value(val);
    const nameMap = dict<Integer>([
      [byteString("74657374696e676e657777616c2e616461"), integer(345)],
    ]);
    const valMap = dict<Dict<Integer>>([
      [
        byteString("baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700"),
        nameMap,
      ],
    ]);
    expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
  });
  it("Complex Value", () => {
    const val: Asset[] = [
      { unit: "lovelace", quantity: "1000000" },
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
        quantity: "345",
      },
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
        quantity: "567",
      },
    ];
    const datum: Value = value(val);

    const nameMap = dict<Integer>([
      [byteString("1234"), integer(567)],
      [byteString("74657374696e676e657777616c2e616461"), integer(345)],
    ]);
    const valMap = dict<Dict<Integer>>([
      [byteString(""), dict([[byteString(""), integer(1000000)]])],
      [
        byteString("baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700"),
        nameMap,
      ],
    ]);
    expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
  });
});

describe("mValue", () => {
  it("should create a new Value instance with the correct value", () => {
    const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
    const datum: MValue = mValue(val);
    const nameMap = new Map().set("", 1000000);
    const valMap = new Map().set("", nameMap);
    expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
  });
  it("Simple token Value", () => {
    const val: Asset[] = [
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
        quantity: "345",
      },
    ];
    const datum: MValue = mValue(val);
    const nameMap = new Map().set("74657374696e676e657777616c2e616461", 345);
    const valMap = new Map().set(
      "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700",
      nameMap,
    );
    expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
  });
  it("Complex Value", () => {
    const val: Asset[] = [
      { unit: "lovelace", quantity: "1000000" },
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
        quantity: "345",
      },
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
        quantity: "567",
      },
    ];
    const datum: MValue = mValue(val);

    const lovelaceMap = new Map().set("", 1000000);
    const tokenMap = new Map()
      .set("1234", 567)
      .set("74657374696e676e657777616c2e616461", 345);
    const valMap = new Map()
      .set("", lovelaceMap)
      .set(
        "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700",
        tokenMap,
      );
    expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
  });
});

describe("MeshValue class", () => {
  describe("fromAssets", () => {
    it("should create a new Value instance with the correct value", () => {
      const assets: Asset[] = [
        { unit: mockUnit, quantity: "100" },
        { unit: "lovelace", quantity: "10" },
      ];
      const value = MeshValue.fromAssets(assets);
      expect(value.value).toEqual({
        [mockUnit]: BigInt(100),
        lovelace: BigInt(10),
      });
    });
  });
  describe("toAssets", () => {
    test("Simple ADA Value", () => {
      const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
      const plutusValue: Value = value(val);
      const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
      expect(JSON.stringify(val)).toBe(JSON.stringify(assets));
    });
    test("Simple token Value", () => {
      const val: Asset[] = [
        {
          unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
          quantity: "345",
        },
      ];
      const plutusValue: Value = value(val);
      const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
      expect(JSON.stringify(val)).toBe(JSON.stringify(assets));
    });
    test("Complex Value", () => {
      const val: Asset[] = [
        { unit: "lovelace", quantity: "1000000" },
        {
          unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
          quantity: "567",
        },
        {
          unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
          quantity: "345",
        },
      ];
      const plutusValue: Value = value(val);
      const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
      expect(JSON.stringify(val)).toBe(JSON.stringify(assets));
    });
  });
});
