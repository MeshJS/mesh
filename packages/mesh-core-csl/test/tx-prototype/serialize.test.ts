import JSONbig from "json-bigint";

import type { TransactionPrototype } from "@meshsdk/common";

import { serializeTxPrototype } from "../../src/tx-prototype";

const TX_HASH = "11".repeat(32);
const ADDRESS =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";

const minimal = (): TransactionPrototype => ({
  body: {
    fee: "170000",
    inputs: [{ transaction_id: TX_HASH, index: 0 }],
    outputs: [{ address: ADDRESS, amount: { coin: "5000000" } }],
  },
  is_valid: true,
  witness_set: {},
});

describe("serializeTxPrototype", () => {
  it("serializes a minimal prototype to CBOR hex", () => {
    const hex = serializeTxPrototype(minimal());
    expect(typeof hex).toEqual("string");
    expect(hex.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/i.test(hex)).toBe(true);
  });

  const withDatum = (value: TransactionPrototype["body"]["outputs"][number]["plutus_data"]) => ({
    ...minimal(),
    body: {
      ...minimal().body,
      outputs: [{ address: ADDRESS, amount: { coin: "5000000" }, plutus_data: value }],
    },
  });

  // Documents a BLOCKING whisky bug, not desired behaviour: whisky types PlutusData::Integer and
  // Metadatum::Int as Rust i128, and serde_json cannot deserialize i128 without its
  // `arbitrary_precision` feature. Verified to fail for value: 0 — it is not a large-value issue,
  // and nothing on this side can work around it. If whisky is ever patched, these two tests
  // should start failing and must be inverted.
  it("REJECTS any manual integer datum — whisky i128/serde_json limitation", () => {
    expect(() =>
      serializeTxPrototype(
        withDatum({ type: "DATA", value: { type: "MANUAL", data: { type: "INTEGER", value: 0n } } }),
      ),
    ).toThrow(/i128 is not supported/);
  });

  it("REJECTS integer transaction metadata — same whisky i128 limitation", () => {
    const proto: TransactionPrototype = {
      ...minimal(),
      auxiliary_data: { metadata: { "674": { type: "INT", value: 1n } }, prefer_alonzo_format: true },
    };
    expect(() => serializeTxPrototype(proto)).toThrow(/i128 is not supported/);
  });

  it("accepts a CBOR-variant datum — the working workaround for the i128 bug", () => {
    const hex = serializeTxPrototype(withDatum({ type: "DATA", value: { type: "CBOR", hex: "00" } }));
    expect(/^[0-9a-f]+$/i.test(hex)).toBe(true);
  });

  it("accepts non-integer MANUAL arms (BYTES), so only the integer arm is affected", () => {
    const hex = serializeTxPrototype(
      withDatum({ type: "DATA", value: { type: "MANUAL", data: { type: "BYTES", value: "cafe" } } }),
    );
    expect(hex.toLowerCase()).toContain("cafe");
  });

  // The prototype follows the CDDL's three version-specific plutus-script keys; whisky's wire
  // shape has only one version-less `plutus_scripts`. V1-only is mappable; V2/V3 are not, and
  // must fail loudly rather than be silently mis-tagged in the output CBOR.
  it("maps a V1-only witness set onto whisky's single plutus_scripts field", () => {
    const proto: TransactionPrototype = {
      ...minimal(),
      witness_set: { plutus_v1_scripts: ["4d01000033222220051200120011"] },
    };
    expect(/^[0-9a-f]+$/i.test(serializeTxPrototype(proto))).toBe(true);
  });

  it.each(["plutus_v2_scripts", "plutus_v3_scripts"] as const)(
    "refuses to mis-tag %s through whisky's version-less field",
    (field) => {
      const proto: TransactionPrototype = {
        ...minimal(),
        witness_set: { [field]: ["4d01000033222220051200120011"] },
      };
      expect(() => serializeTxPrototype(proto)).toThrow(/cannot represent PlutusV2\/V3/);
    },
  );

  it("throws a descriptive error when whisky rejects the payload", () => {
    const broken = {
      body: { fee: "not-a-number", inputs: [], outputs: [] },
      is_valid: true,
      witness_set: {},
    } as unknown as TransactionPrototype;
    expect(() => serializeTxPrototype(broken)).toThrow(/serializeTxPrototype error/);
  });
});

describe("JSONbig vs JSON (the reason this module exists)", () => {
  it("plain JSON.stringify cannot serialize the prototype's bigint fields at all", () => {
    expect(() => JSON.stringify({ value: 1n })).toThrow(TypeError);
  });

  it("JSONbig emits bigints as unquoted JSON numbers, preserving full precision", () => {
    const out = JSONbig.stringify({ value: 18446744073709551615n });
    expect(out).toEqual('{"value":18446744073709551615}');
  });
});
