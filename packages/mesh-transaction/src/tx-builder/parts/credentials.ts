import type {
  AnchorPrototype,
  CredTypePrototype,
  DRepPrototype,
} from "@meshsdk/common";
import { Cardano } from "@meshsdk/core-cst";

import {
  checkCredential,
  fail,
  isHash28,
  isHash32,
  PartContext,
  rewardCredential,
  toNativeScriptSource,
  toPlutusScriptSource,
  toRedeemer,
  withKnownHash,
} from "./normalize";
import {
  AnchorInput,
  CredentialInput,
  CredentialWitnessInput,
  DepositParameter,
  DRepCredentialInput,
  DRepInput,
  KeyWitness,
  NativeWitness,
  PlutusWitness,
  PoolInput,
} from "./types";

export type Credential = { type: "key" | "script"; hash: string };

export const toPrototypeCredential = (
  credential: Credential,
): CredTypePrototype =>
  credential.type === "script"
    ? { type: "SCRIPT", value: credential.hash }
    : { type: "KEY", value: credential.hash };

export const fromPrototypeCredential = (
  ctx: PartContext,
  credential: CredTypePrototype,
): Credential => {
  const hash =
    typeof credential.value === "string" ? credential.value.toLowerCase() : "";
  if (
    (credential.type !== "KEY" && credential.type !== "SCRIPT") ||
    !isHash28(hash)
  )
    fail(
      ctx,
      "INVALID_DATA",
      `invalid credential ${JSON.stringify(credential)}`,
    );
  return { type: credential.type === "SCRIPT" ? "script" : "key", hash };
};

/** A stake (or committee) credential, from a bech32 reward address or as given */
export const toCredential = (
  ctx: PartContext,
  input: CredentialInput,
): Credential =>
  typeof input === "string"
    ? rewardCredential(ctx, input)
    : fromPrototypeCredential(ctx, input);

export const toDRepCredential = (
  ctx: PartContext,
  input: DRepCredentialInput,
): Credential => {
  if (typeof input !== "string") return fromPrototypeCredential(ctx, input);
  if (!Cardano.DRepID.isValid(input))
    return fail(ctx, "INVALID_DATA", `invalid DRep id ${input}`);
  const credential = Cardano.DRepID.toCredential(Cardano.DRepID(input));
  return {
    type:
      credential.type === Cardano.CredentialType.ScriptHash ? "script" : "key",
    hash: credential.hash.toString(),
  };
};

export const toDRep = (ctx: PartContext, input: DRepInput): DRepPrototype => {
  if (input === "alwaysAbstain") return { type: "ALWAYS_ABSTAIN" };
  if (input === "alwaysNoConfidence") return { type: "ALWAYS_NO_CONFIDENCE" };
  if (typeof input === "object" && "type" in input) {
    if (
      input.type === "ALWAYS_ABSTAIN" ||
      input.type === "ALWAYS_NO_CONFIDENCE"
    )
      return { type: input.type };
    if (input.type === "KEY_HASH" || input.type === "SCRIPT_HASH") {
      const credential = fromPrototypeCredential(ctx, {
        type: input.type === "SCRIPT_HASH" ? "SCRIPT" : "KEY",
        value: input.value,
      });
      return { type: input.type, value: credential.hash };
    }
  }
  const credential = toDRepCredential(ctx, input as DRepCredentialInput);
  return credential.type === "script"
    ? { type: "SCRIPT_HASH", value: credential.hash }
    : { type: "KEY_HASH", value: credential.hash };
};

export const toPoolKeyHash = (ctx: PartContext, pool: PoolInput): string => {
  if (typeof pool === "string" && isHash28(pool.toLowerCase()))
    return pool.toLowerCase();
  try {
    return Cardano.PoolId.toKeyHash(Cardano.PoolId(pool)).toString();
  } catch {
    return fail(ctx, "INVALID_DATA", `invalid pool id ${pool}`);
  }
};

/** Anchor URLs are at most 128 bytes */
const MAX_ANCHOR_URL_BYTES = 128;

export const toAnchor = (
  ctx: PartContext,
  anchor: AnchorInput | undefined,
): AnchorPrototype | undefined => {
  if (anchor === undefined) return undefined;
  const dataHash =
    typeof anchor.dataHash === "string" ? anchor.dataHash.toLowerCase() : "";
  if (!isHash32(dataHash))
    fail(ctx, "INVALID_DATA", `invalid anchor data hash ${anchor.dataHash}`);
  if (
    typeof anchor.url !== "string" ||
    new TextEncoder().encode(anchor.url).length > MAX_ANCHOR_URL_BYTES
  )
    fail(ctx, "INVALID_DATA", `invalid anchor url ${anchor.url}`);
  return { anchor_url: anchor.url, anchor_data_hash: dataHash };
};

/** A deposit or refund: as given, or left to the named protocol parameter */
export const toDeposit = <P extends DepositParameter>(
  ctx: PartContext,
  amount: bigint | undefined,
  parameter: P,
): { coin?: string; depositParameter?: P } => {
  if (amount === undefined) return { depositParameter: parameter };
  if (typeof amount !== "bigint" || amount < 0n)
    fail(ctx, "INVALID_VALUE", `invalid deposit ${amount}`);
  return { coin: amount.toString() };
};

/**
 * What authorises a certificate for a credential: the key for a key credential, which takes
 * no witness argument, or the given script for a script credential, which must have one.
 * Certificates introduced with governance can only be witnessed by Plutus V3 scripts.
 */
export const toCredentialWitness = (
  ctx: PartContext,
  credential: Credential,
  witness: CredentialWitnessInput | undefined,
  { plutusV3Only }: { plutusV3Only: boolean },
): KeyWitness | NativeWitness | PlutusWitness => {
  const what = `${credential.type} credential ${credential.hash}`;
  if (credential.type === "key") {
    if (witness)
      fail(
        ctx,
        "WITNESS_MISMATCH",
        `${what} is authorised by its key, not a script`,
      );
    return { type: "key" };
  }
  if (!witness)
    return fail(
      ctx,
      "WITNESS_MISMATCH",
      `${what} needs a witness: { native } or { plutus, redeemer }`,
    );
  if ("native" in witness) {
    const script = withKnownHash(
      toNativeScriptSource(ctx, witness.native),
      credential,
    );
    checkCredential(ctx, what, credential, {
      type: "script",
      hash: script.scriptHash,
    });
    return { type: "native", script };
  }
  const script = withKnownHash(
    toPlutusScriptSource(ctx, witness.plutus),
    credential,
  );
  checkCredential(ctx, what, credential, {
    type: "script",
    hash: script.scriptHash,
  });
  if (plutusV3Only && script.version !== undefined && script.version !== "V3")
    fail(
      ctx,
      "WITNESS_MISMATCH",
      `this certificate can only be witnessed by a Plutus V3 script, not ${script.version}`,
    );
  return {
    type: "plutus",
    script,
    redeemer: toRedeemer(ctx, witness.redeemer),
  };
};
