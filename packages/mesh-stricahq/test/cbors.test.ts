import { BigNumber } from "bignumber.js";
import {
  CborTag,
  Decoder,
  Encoder,
  IndefiniteArray,
  IndefiniteMap,
} from "@meshsdk/stricahq";
import _ from "lodash";

const deepEql = _.isEqual;

const emptyIndefiniteArray = new IndefiniteArray();
const indefiniteArray = new IndefiniteArray();
indefiniteArray.push(1);
indefiniteArray.push(2);
const emptyIndefiniteMap = new IndefiniteMap();
const indefiniteMap = new IndefiniteMap().set(1, 2).set(3, 4);

type TestCase = {
  name: string;
  cbor: string;
  value: any;
  byteSpan: [number, number];
  indefiniteSupport?: boolean;
  tag?: number;
  isBigNumber?: boolean;
};

const tests: Array<TestCase> = [
  { name: "unsigned 0", cbor: "00", value: 0, byteSpan: [0, 1] },
  { name: "unsigned 10", cbor: "0a", value: 10, byteSpan: [0, 1] },
  { name: "unsigned8 25", cbor: "1819", value: 25, byteSpan: [0, 2] },
  { name: "unsigned16 1000", cbor: "1903e8", value: 1000, byteSpan: [0, 2] },
  {
    name: "unsigned32 1000000",
    cbor: "1a000f4240",
    value: 1000000,
    byteSpan: [0, 6],
  },
  {
    name: "unsigned64 1000000000000",
    cbor: "1b000000e8d4a51000",
    value: 1000000000000,
    byteSpan: [0, 9],
  },
  {
    name: "BigNumber64 18446744073709551615",
    cbor: "1bffffffffffffffff",
    value: new BigNumber("18446744073709551615"),
    byteSpan: [0, 9],
  },
  { name: "negative -1", cbor: "20", value: -1, byteSpan: [0, 1] },
  { name: "negative -10", cbor: "29", value: -10, byteSpan: [0, 1] },
  { name: "negative -25", cbor: "3818", value: -25, byteSpan: [0, 2] },
  { name: "negative16 -1000", cbor: "3903e7", value: -1000, byteSpan: [0, 2] },
  {
    name: "negative32 -1000000",
    cbor: "3a000f423f",
    value: -1000000,
    byteSpan: [0, 5],
  },
  {
    name: "negative64 1000000000000",
    cbor: "3b000000e8d4a50fff",
    value: -1000000000000,
    byteSpan: [0, 9],
  },
  {
    name: "NegativeBigNumber64 -18446744073709551616",
    cbor: "3bffffffffffffffff",
    value: new BigNumber("-18446744073709551616"),
    byteSpan: [0, 9],
  },
  { name: "bytes ''", cbor: "40", value: Buffer.alloc(0), byteSpan: [0, 1] },
  {
    name: "bytes 0x01020304",
    cbor: "4401020304",
    value: Buffer.from("01020304", "hex"),
    byteSpan: [0, 5],
  },
  {
    name: "bytes 0x010203040506070809100a0b0c0d0e0f11121314151617181920",
    cbor: "581a010203040506070809100a0b0c0d0e0f11121314151617181920",
    value: Buffer.from(
      "010203040506070809100A0B0C0D0E0F11121314151617181920",
      "hex"
    ),
    byteSpan: [0, 28],
  },
  {
    name: "indefinite bytes 0x0102030405",
    cbor: "5f42010243030405ff",
    value: Buffer.from("0102030405", "hex"),
    indefiniteSupport: true,
    byteSpan: [0, 9],
  },
  { name: "string ''", cbor: "60", value: "", byteSpan: [0, 1] },
  {
    name: "string 'Ashish'",
    cbor: "66417368697368",
    value: "Ashish",
    byteSpan: [0, 7],
  },
  {
    name: "Indefinite 'Ashish'",
    cbor: "7f6a496E646566696E69746566417368697368ff",
    value: "IndefiniteAshish",
    indefiniteSupport: true,
    byteSpan: [0, 20],
  },
  { name: "array []", cbor: "80", value: [], byteSpan: [0, 1] },
  {
    name: "array [].26",
    cbor: "981a0101010101010101010101010101010101010101010101010101",
    value: [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1,
    ],
    byteSpan: [0, 28],
  },
  {
    name: "Array ['a', {'b': 'c'}]",
    cbor: "826161a161626163",
    value: ["a", new Map().set("b", "c")],
    byteSpan: [0, 8],
  },
  {
    name: "IndefiniteArray []",
    cbor: "9fff",
    value: emptyIndefiniteArray,
    byteSpan: [0, 2],
  },
  {
    name: "IndefiniteArray [1, 2]",
    cbor: "9f0102ff",
    value: indefiniteArray,
    byteSpan: [0, 4],
  },
  { name: "Map {}", cbor: "a0", value: new Map(), byteSpan: [0, 1] },
  {
    name: "Map {1: 2, 3: 4}",
    cbor: "a201020304",
    value: new Map().set(1, 2).set(3, 4),
    byteSpan: [0, 5],
  },
  {
    name: "IndefiniteMap {}",
    cbor: "bfff",
    value: emptyIndefiniteMap,
    byteSpan: [0, 2],
  },
  {
    name: "IndefiniteMap {1: 2, 3: 4}",
    cbor: "bf01020304ff",
    value: indefiniteMap,
    byteSpan: [0, 6],
  },
  {
    name: "Tagged [123, []]",
    cbor: "d86682187b80",
    value: [123, []],
    tag: 102,
    byteSpan: [0, 6],
  },
  {
    name: "Bignumber Tagged 123",
    cbor: "c2417b",
    value: new BigNumber(123),
    byteSpan: [0, 3],
    tag: 2,
  },
];

describe("cbors", (): void => {
  beforeEach(async () => {});

  for (const test of tests) {
    it(`Decode ${test.name}`, () => {
      const decoded = Decoder.decode(Buffer.from(test.cbor, "hex"))
        .value as any;
      if (BigNumber.isBigNumber(decoded)) {
        expect(JSON.stringify(decoded)).toBe(JSON.stringify(test.value));
      } else if (decoded instanceof Buffer) {
        expect(decoded.compare(test.value)).toBe(0);
      } else if (decoded instanceof Array || decoded instanceof Map) {
        expect(deepEql(decoded, test.value)).toBe(true);
      } else if (test.tag) {
        const dValue = JSON.parse(JSON.stringify(decoded.value));
        if (BigNumber.isBigNumber(test.value)) {
          expect(deepEql(dValue.data[0], test.value.toNumber())).toBe(true);
        } else {
          expect(deepEql(dValue, test.value)).toBe(true);
        }
      } else {
        expect(decoded).toBe(test.value);
      }
      if (typeof decoded !== "number" && typeof decoded !== "string") {
        const span = decoded.getByteSpan();
        expect(deepEql(span, test.byteSpan)).toBe(true);
      }
    });
    it(`Encode ${test.value}`, () => {
      // indefinite encoded not supported for some types
      let encoded;
      if (!test.indefiniteSupport) {
        if (test.tag) {
          if (BigNumber.isBigNumber(test.value)) {
            encoded = Encoder.encode(test.value, {
              collapseBigNumber: false,
            }).toString("hex");
          } else {
            const value = new CborTag(test.value, test.tag);
            encoded = Encoder.encode(value).toString("hex");
          }
        } else if (BigNumber.isBigNumber(test.value)) {
          encoded = Encoder.encode(test.value).toString("hex");
        } else {
          encoded = Encoder.encode(test.value).toString("hex");
        }
        expect(encoded).toBe(test.cbor);
      }
    });
  }

  it("Indefinite Array byteSpan", () => {
    const indAryItems = Buffer.from("9fa10001a10101a10200ff", "hex");
    const decoded = Decoder.decode(indAryItems).value;
    const firstByteSpan = decoded[0].getByteSpan();
    expect(firstByteSpan[0]).toBe(1);
    expect(firstByteSpan[1]).toBe(4);

    const secondByteSpan = decoded[1].getByteSpan();
    expect(secondByteSpan[0]).toBe(4);
    expect(secondByteSpan[1]).toBe(7);
  });

  it("Indefinite Buffer byteSpan", () => {
    // indef buffer containing 2 def buffers
    const indBuf = Buffer.from(
      "5f5840697066733a2f2f626166796265696571616c727875627969737734326c696472327a746b68677767686563783571746b7173726f32793769696b6e6935797168426365ff",
      "hex"
    );
    const decoded = Decoder.decode(indBuf).value;
    const byteSpan = decoded.getByteSpan();
    expect(byteSpan[0]).toBe(0);
    expect(byteSpan[1]).toBe(71);
  });

  it("Indefinite Map byteSpan", () => {
    const indMapItems = Buffer.from("bf00a1000101a1010102a10200ff", "hex");
    const decoded = Decoder.decode(indMapItems).value;
    const firstByteSpan = decoded.get(0).getByteSpan();
    expect(firstByteSpan[0]).toBe(2);
    expect(firstByteSpan[1]).toBe(5);

    const secondByteSpan = decoded.get(1).getByteSpan();
    expect(secondByteSpan[0]).toBe(6);
    expect(secondByteSpan[1]).toBe(9);
  });
});
