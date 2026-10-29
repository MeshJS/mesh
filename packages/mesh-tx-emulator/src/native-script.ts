import type { UTxO } from "@meshsdk/common";
import { Cardano, deserializeTx, Serialization } from "@meshsdk/core-cst";

/**
 * The fewest key hashes whose signatures make a native script pass in a validity interval, or
 * undefined when no signatures can, as a time lock fails
 */
const signersFor = (
  script: Cardano.NativeScript,
  start: number | undefined,
  end: number | undefined,
): Set<string> | undefined => {
  const fewest = (scripts: Cardano.NativeScript[], count: number) => {
    const options = scripts
      .map((s) => signersFor(s, start, end))
      .filter((signers): signers is Set<string> => signers !== undefined)
      .sort((a, b) => a.size - b.size);
    return options.length < count
      ? undefined
      : new Set(options.slice(0, count).flatMap((signers) => [...signers]));
  };
  switch (script.kind) {
    case Cardano.NativeScriptKind.RequireSignature:
      return new Set([script.keyHash]);
    case Cardano.NativeScriptKind.RequireAllOf:
      return fewest(script.scripts, script.scripts.length);
    case Cardano.NativeScriptKind.RequireAnyOf:
      return fewest(script.scripts, 1);
    case Cardano.NativeScriptKind.RequireNOf:
      return fewest(script.scripts, script.required);
    case Cardano.NativeScriptKind.RequireTimeAfter:
      return start !== undefined && start >= Number(script.slot)
        ? new Set()
        : undefined;
    case Cardano.NativeScriptKind.RequireTimeBefore:
      return end !== undefined && end <= Number(script.slot)
        ? new Set()
        : undefined;
  }
};

/**
 * The native scripts a transaction carries or references that would pass once signed: by hash,
 * the fewest keys that must sign for each, as they fail only for want of signatures
 */
export const nativeScriptsPassingWhenSigned = (
  txHex: string,
  utxos: UTxO[],
): Map<string, Set<string>> => {
  const tx = deserializeTx(txHex);
  const body = tx.body();
  const start = body.validityStartInterval();
  const end = body.ttl();
  const scripts = [...(tx.witnessSet().nativeScripts()?.values() ?? [])];
  for (const { output } of utxos) {
    if (!output.scriptRef) continue;
    const native = Serialization.Script.fromCbor(
      output.scriptRef as never,
    ).asNative();
    if (native) scripts.push(native);
  }
  const passing = new Map<string, Set<string>>();
  for (const script of scripts) {
    const signers = signersFor(
      script.toCore(),
      start === undefined ? undefined : Number(start),
      end === undefined ? undefined : Number(end),
    );
    if (signers) passing.set(script.hash().toString(), signers);
  }
  return passing;
};
