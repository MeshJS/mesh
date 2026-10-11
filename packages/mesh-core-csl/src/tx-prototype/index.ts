import { js_tx_prototype_to_hex } from "@sidan-lab/whisky-js-nodejs";
import JSONbig from "json-bigint";

import type { TransactionPrototype } from "@meshsdk/common";

/**
 * Serializes a `TransactionPrototype` (`@meshsdk/common`) to transaction CBOR hex via whisky's
 * `js_tx_prototype_to_hex` WASM entry point.
 *
 * Uses `JSONbig.stringify`, not `JSON.stringify`, and that is load-bearing rather than stylistic:
 * `TransactionPrototype` carries `bigint` on every field whose Conway CDDL range exceeds
 * `Number.MAX_SAFE_INTEGER` (`PlutusDataPrototype`'s `INTEGER.value`/`CONSTR.alternative`,
 * `MetadatumPrototype`'s `INT.value`, `ScriptNOfKPrototype.n`, `PoolRetirementPrototype.epoch`,
 * `CommitteeMemberPrototype.term_limit`). Plain `JSON.stringify` throws outright on those
 * (`TypeError: Do not know how to serialize a BigInt`), and the obvious `(k, v) => Number(v)`
 * replacer would reintroduce exactly the precision loss the `bigint` typing exists to prevent.
 * `JSONbig.stringify` emits them as unquoted JSON number literals, which is what serde on the
 * Rust side expects. Same reason `mesh-core-csl/src/core/serializer.ts` already uses it for the
 * `js_serialize_tx_body` boundary.
 *
 * BLOCKING whisky BUG — `i128 is not supported`
 * ---------------------------------------------
 * whisky types both `PlutusData::Integer { value }` and `Metadatum::Int { value }` as Rust
 * `i128`, and `serde_json` refuses to deserialize `i128` unless built with its
 * `arbitrary_precision` feature (which whisky's WASM build is not). So `js_tx_prototype_to_hex`
 * rejects, with `Invalid TransactionPrototype JSON: Error("i128 is not supported")`:
 *   - ANY inline/manual Plutus datum containing an integer, and
 *   - ANY transaction metadata containing an integer.
 * This is not a large-value problem: it was verified to fail for `value: 0`, serialized with a
 * plain `JSON.stringify` and a plain `number`. Nothing on this side can work around it — the
 * failure is in whisky's deserialize step, before any of our encoding matters.
 *
 * WORKAROUND that does work today: use the `{ type: "CBOR", hex }` arm of `PlutusDataVariant`
 * instead of `{ type: "MANUAL", data }`. That bypasses whisky's `PlutusData` enum (and hence the
 * `i128` field) entirely, and is verified to serialize successfully. Non-integer `MANUAL` arms
 * (`BYTES`, `LIST`, `MAP`, `CONSTR` with no integer inside) also work.
 *
 * Until whisky is patched, `mesh-core-cst/src/tx-prototype-to-cbor/` is the only backend that
 * handles the full `TransactionPrototype` surface — it is pure TypeScript with no JSON/serde
 * boundary, so none of this applies there.
 *
 * SET ENCODING: whisky always emits the Conway `#6.258`-tagged form for every CBOR set, with no
 * option to disable it (verified: a body with inputs + collateral + reference inputs + required
 * signers comes back with all four tagged). That matches the default of
 * `mesh-core-cst`'s `transactionPrototypeToHex`, so the two backends agree out of the box. If you
 * specifically need untagged sets, only the CST converter can produce them
 * (`transactionPrototypeToHex(proto, { taggedSets: false })`).
 *
 * Separately, whisky's `ScriptNOfKPrototype.n`, `PoolRetirementPrototype.epoch` and
 * `CommitteeMemberPrototype.term_limit` are `u32` where the ledger allows `int64`/`uint .size 8`,
 * and `PlutusData::Integer` is `i128` where the ledger's `big_int` is effectively
 * arbitrary-precision. CDDL-legal values beyond those bounds are representable in
 * `TransactionPrototype` and handled correctly by the `mesh-core-cst` converter, but serde will
 * reject them here rather than truncate.
 */
/**
 * whisky's Rust structs carry a single, version-less `plutus_scripts: Vec<String>` on both the
 * witness set and the auxiliary data, whereas the Conway CDDL (and therefore
 * `TransactionPrototype`) splits them across three keys — witness-set 3/6/7 and
 * auxiliary-data 2/3/4 — because a Plutus script's language version is not recoverable from its
 * bytes. There is no lossless mapping: sending only `plutus_v1_scripts` would silently drop V2/V3
 * scripts, so the three lists are concatenated into whisky's single field. That means whisky
 * treats every script as though it were the version its own converter assumes, and a V2/V3 script
 * routed through this backend will be mis-tagged in the resulting CBOR.
 *
 * Rather than let that corrupt a transaction silently, this throws when V2/V3 scripts are present.
 * Use `mesh-core-cst/src/tx-prototype-to-cbor/` (which maps all three keys correctly) for those.
 */
const toWhiskyWireShape = (prototype: TransactionPrototype) => {
  const ws = prototype.witness_set;
  const aux = prototype.auxiliary_data;

  const misTagged =
    (ws.plutus_v2_scripts?.length ?? 0) +
    (ws.plutus_v3_scripts?.length ?? 0) +
    (aux?.plutus_v2_scripts?.length ?? 0) +
    (aux?.plutus_v3_scripts?.length ?? 0);
  if (misTagged > 0) {
    throw new Error(
      "serializeTxPrototype error: whisky's tx_prototype has a single version-less " +
        "`plutus_scripts` field and cannot represent PlutusV2/V3 scripts without mis-tagging " +
        "them. Use the mesh-core-cst converter (tx-prototype-to-cbor) for these transactions.",
    );
  }

  const flatten = (v1?: string[] | null) => (v1?.length ? v1 : undefined);

  return {
    ...prototype,
    witness_set: {
      ...ws,
      plutus_v1_scripts: undefined,
      plutus_v2_scripts: undefined,
      plutus_v3_scripts: undefined,
      plutus_scripts: flatten(ws.plutus_v1_scripts),
    },
    ...(aux
      ? {
          auxiliary_data: {
            ...aux,
            plutus_v1_scripts: undefined,
            plutus_v2_scripts: undefined,
            plutus_v3_scripts: undefined,
            plutus_scripts: flatten(aux.plutus_v1_scripts),
          },
        }
      : {}),
  };
};

export const serializeTxPrototype = (prototype: TransactionPrototype): string => {
  const result = js_tx_prototype_to_hex(JSONbig.stringify(toWhiskyWireShape(prototype)));
  if (result.get_status() !== "success") {
    throw new Error(`serializeTxPrototype error: ${result.get_error()}`);
  }
  return result.get_data();
};
