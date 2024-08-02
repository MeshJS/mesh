import {
  Asset,
  byteString,
  ByteString,
  dict,
  Dict,
  Integer,
  integer,
  parsePlutusValueToAssets,
  Value,
  value,
} from "@meshsdk/common";

describe("value", () => {
  test("Simple ADA Value", () => {
    const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
    const datum: Value = value(val);

    const nameMap = dict<Integer>([[byteString(""), integer(1000000)]]);
    const valMap = dict<Dict<Integer>>([[byteString(""), nameMap]]);
    expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
  });
  test("Simple token Value", () => {
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
  test("Complex Value", () => {
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

describe("Value", () => {
  test("Simple ADA Value", () => {
    const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
    const plutusValue: Value = value(val);
    const assets: Asset[] = parsePlutusValueToAssets(plutusValue);

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
    const assets: Asset[] = parsePlutusValueToAssets(plutusValue);

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
    const assets: Asset[] = parsePlutusValueToAssets(plutusValue);
    expect(JSON.stringify(val)).toBe(JSON.stringify(assets));
  });
});
