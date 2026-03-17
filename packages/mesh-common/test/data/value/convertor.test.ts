import {
  Asset,
  assocMap,
  byteString,
  currencySymbol,
  dict,
  Dict,
  Integer,
  integer,
  MeshValue,
  MValue,
  mValue,
  tokenName,
  Value,
  value,
} from "@meshsdk/common";

import { mockUnit } from "./common";

const unsortedValue: Value = assocMap([
  [currencySymbol(""), assocMap([[tokenName(""), integer(200000000)]])],
  [
    currencySymbol("c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913"),
    assocMap([[tokenName("5553444d"), integer(200000000)]]),
  ],
  [
    currencySymbol("a2818ba06a88bb6c08d10f4f9b897c09768f28d274093628ad7086fc"),
    assocMap([[tokenName("484f534b59"), integer(100000000)]]),
  ],
  [
    currencySymbol("82e46eb16633bf8bfa820c83ffeb63192c6e21757d2bf91290b2f41d"),
    assocMap([[tokenName("494147"), integer(100000000)]]),
  ],
  [
    currencySymbol("378f9732c755ed6f4fc8d406f1461d0cca95d7d2e69416784684df39"),
    assocMap([[tokenName("534e454b"), integer(100000000)]]),
  ],
  [
    currencySymbol("3363b99384d6ee4c4b009068af396c8fdf92dafd111e58a857af0429"),
    assocMap([[tokenName("4e49474854"), integer(100000000)]]),
  ],
]);

const sortedValue: Value = assocMap([
  [currencySymbol(""), assocMap([[tokenName(""), integer(200000000)]])],
  [
    currencySymbol("3363b99384d6ee4c4b009068af396c8fdf92dafd111e58a857af0429"),
    assocMap([[tokenName("4e49474854"), integer(100000000)]]),
  ],
  [
    currencySymbol("378f9732c755ed6f4fc8d406f1461d0cca95d7d2e69416784684df39"),
    assocMap([[tokenName("534e454b"), integer(100000000)]]),
  ],
  [
    currencySymbol("82e46eb16633bf8bfa820c83ffeb63192c6e21757d2bf91290b2f41d"),
    assocMap([[tokenName("494147"), integer(100000000)]]),
  ],
  [
    currencySymbol("a2818ba06a88bb6c08d10f4f9b897c09768f28d274093628ad7086fc"),
    assocMap([[tokenName("484f534b59"), integer(100000000)]]),
  ],
  [
    currencySymbol("c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913"),
    assocMap([[tokenName("5553444d"), integer(200000000)]]),
  ],
]);

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
  describe("toData", () => {
    test("Empty Value", () => {
      const val: Asset[] = [];
      const plutusValue: Value = value(val);
      const data = MeshValue.fromValue(plutusValue).toData();
      const expected: MValue = mValue(val);
      expect(JSON.stringify(expected)).toBe(JSON.stringify(data));
    });

    test("Multiple Assets with Same Policy", () => {
      const val: Asset[] = [
        {
          unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
          quantity: "100",
        },
        {
          unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
          quantity: "200",
        },
      ];
      const plutusValue: Value = value(val);
      const data = MeshValue.fromValue(plutusValue).toData();
      const expected: MValue = mValue(val);

      expect(JSON.stringify(expected)).toBe(JSON.stringify(data));
    });

    test("Mixed Assets", () => {
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
        {
          unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
          quantity: "100",
        },
      ];
      const plutusValue: Value = value(val);
      const data = MeshValue.fromValue(plutusValue).toData();
      const expected: MValue = mValue(val);
      expect(JSON.stringify(expected)).toBe(JSON.stringify(data));
    });

    test("Single Asset with Large Quantity", () => {
      const val: Asset[] = [{ unit: "lovelace", quantity: "1000000000000" }];
      const plutusValue: Value = value(val);
      const data = MeshValue.fromValue(plutusValue).toData();
      const expected: MValue = mValue(val);
      expect(JSON.stringify(expected)).toBe(JSON.stringify(data));
    });
  });
  describe("toJSON", () => {
    test("should correctly convert MeshValue to JSON with multiple assets", () => {
      const assets: Asset[] = [
        { unit: "lovelace", quantity: "1000000" },
        {
          unit: "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
          quantity: "500",
        },
      ];

      const expectedValue = assocMap([
        [currencySymbol(""), assocMap([[tokenName(""), integer(1000000)]])],
        [
          currencySymbol(
            "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c",
          ),
          assocMap([[tokenName("000643b04d65736820676f6f64"), integer(500)]]),
        ],
      ]);

      const meshValue = new MeshValue();
      meshValue.toAssets = () => assets;

      const jsonValue = meshValue.toJSON();
      expect(JSON.stringify(jsonValue)).toEqual(JSON.stringify(expectedValue));
    });

    test("should correctly convert MeshValue to JSON with no asset", () => {
      const assets: Asset[] = [];

      const expectedValue = assocMap([]);

      const meshValue = new MeshValue();
      meshValue.toAssets = () => assets;

      const jsonValue = meshValue.toJSON();
      expect(JSON.stringify(jsonValue)).toEqual(JSON.stringify(expectedValue));
    });
  });
  describe("sortValue", () => {
    test("should sort policies and tokens by byte ordering", () => {
      const sortedValue = MeshValue.sortValue(unsortedValue);
      expect(JSON.stringify(sortedValue)).toEqual(JSON.stringify(sortedValue));
    });

    test("should handle empty Value", () => {
      const emptyValue: Value = assocMap([]);
      const sortedValue = MeshValue.sortValue(emptyValue);
      expect(JSON.stringify(sortedValue)).toEqual(JSON.stringify(emptyValue));
    });

    test("should handle already sorted Value", () => {
      const alreadySorted: Value = assocMap([
        [currencySymbol(""), assocMap([[tokenName(""), integer(200000000)]])],
        [
          currencySymbol(
            "3363b99384d6ee4c4b009068af396c8fdf92dafd111e58a857af0429",
          ),
          assocMap([[tokenName("4e49474854"), integer(100000000)]]),
        ],
      ]);

      const sortedValue = MeshValue.sortValue(alreadySorted);
      expect(JSON.stringify(sortedValue)).toEqual(
        JSON.stringify(alreadySorted),
      );
    });
  });
});
