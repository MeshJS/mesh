import {
  plutusDataPrototypeToCardano,
  plutusDataVariantToCardano,
} from "../../src/tx-prototype-to-cbor/plutus-data";
import { PlutusDataKind } from "../../src/types";

describe("plutusDataPrototypeToCardano", () => {
  it("converts INTEGER", () => {
    const data = plutusDataPrototypeToCardano({ type: "INTEGER", value: 42n });
    expect(data.getKind()).toEqual(PlutusDataKind.Integer);
    expect(data.asInteger()).toEqual(42n);
  });

  it("converts a negative INTEGER", () => {
    const data = plutusDataPrototypeToCardano({ type: "INTEGER", value: -7n });
    expect(data.asInteger()).toEqual(-7n);
  });

  it("converts BYTES from hex", () => {
    const data = plutusDataPrototypeToCardano({ type: "BYTES", value: "deadbeef" });
    expect(data.getKind()).toEqual(PlutusDataKind.Bytes);
    expect(Buffer.from(data.asBoundedBytes()!).toString("hex")).toEqual("deadbeef");
  });

  it("converts a nested LIST", () => {
    const data = plutusDataPrototypeToCardano({
      type: "LIST",
      value: [
        { type: "INTEGER", value: 1n },
        { type: "BYTES", value: "ff" },
      ],
    });
    expect(data.getKind()).toEqual(PlutusDataKind.List);
    const list = data.asList()!;
    expect(list.getLength()).toEqual(2);
    expect(list.get(0).asInteger()).toEqual(1n);
    expect(Buffer.from(list.get(1).asBoundedBytes()!).toString("hex")).toEqual("ff");
  });

  it("converts a MAP", () => {
    const data = plutusDataPrototypeToCardano({
      type: "MAP",
      value: [[{ type: "INTEGER", value: 1n }, { type: "INTEGER", value: 2n }]],
    });
    expect(data.getKind()).toEqual(PlutusDataKind.Map);
    const map = data.asMap()!;
    const keys = map.getKeys();
    expect(keys.getLength()).toEqual(1);
    expect(map.get(keys.get(0))?.asInteger()).toEqual(2n);
  });

  it("converts a CONSTR with fields", () => {
    const data = plutusDataPrototypeToCardano({
      type: "CONSTR",
      alternative: 0n,
      fields: [{ type: "INTEGER", value: 7n }],
    });
    expect(data.getKind()).toEqual(PlutusDataKind.ConstrPlutusData);
    const constr = data.asConstrPlutusData()!;
    expect(constr.getAlternative()).toEqual(0n);
    expect(constr.getData().get(0).asInteger()).toEqual(7n);
  });

  it("accepts a CONSTR alternative beyond Number.MAX_SAFE_INTEGER as a bigint", () => {
    // whisky's own `alternative` field is Rust `u64` (general constr tag 102), not `u32` like
    // e.g. epoch/n fields — a plain `number` would silently lose precision for values this size.
    const huge = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2, unrepresentable exactly as number
    const data = plutusDataPrototypeToCardano({ type: "CONSTR", alternative: huge, fields: [] });
    expect(data.asConstrPlutusData()!.getAlternative()).toEqual(huge);
  });

  it("round-trips through CBOR", () => {
    const data = plutusDataPrototypeToCardano({
      type: "CONSTR",
      alternative: 1n,
      fields: [{ type: "BYTES", value: "cafe" }],
    });
    const roundTripped = plutusDataPrototypeToCardano({
      type: "CONSTR",
      alternative: 1n,
      fields: [{ type: "BYTES", value: "cafe" }],
    });
    expect(data.toCbor()).toEqual(roundTripped.toCbor());
  });
});

describe("plutusDataVariantToCardano", () => {
  it("decodes a CBOR variant directly", () => {
    const rawInt = plutusDataPrototypeToCardano({ type: "INTEGER", value: 5n });
    const data = plutusDataVariantToCardano({ type: "CBOR", hex: rawInt.toCbor() });
    expect(data.asInteger()).toEqual(5n);
  });

  it("converts a MANUAL variant via plutusDataPrototypeToCardano", () => {
    const data = plutusDataVariantToCardano({
      type: "MANUAL",
      data: { type: "BYTES", value: "1234" },
    });
    expect(Buffer.from(data.asBoundedBytes()!).toString("hex")).toEqual("1234");
  });
});
