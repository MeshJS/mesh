import type { NativeScript } from "@meshsdk/common";

import {
  buildScriptPubkey,
  deserializeEd25519KeyHash,
  toNativeScript,
  resolvePaymentKeyHash,
} from "@meshsdk/core-cst";

export class ForgeScript {
  static withOneSignature(address: string): string {
    const keyHash = deserializeEd25519KeyHash(resolvePaymentKeyHash(address));
    return buildScriptPubkey(keyHash).toCbor();
  }

  // static withAtLeastNSignatures(
  //   addresses: string[], minimumRequired: number,
  // ): string {
  //   const nativeScripts = csl.NativeScripts.new();

  //   addresses.forEach((address) => {
  //     const keyHash = deserializeEd25519KeyHash(
  //       resolvePaymentKeyHash(address),
  //     );
  //     nativeScripts.add(buildScriptPubkey(keyHash));
  //   });

  //   const scriptNOfK = csl.ScriptNOfK.new(minimumRequired, nativeScripts);
  //   return csl.NativeScript.new_script_any(scriptNOfK).to_hex();
  // }

  // static withAnySignature(addresses: string[]): string {
  //   const nativeScripts = csl.NativeScripts.new();

  //   addresses.forEach((address) => {
  //     const keyHash = deserializeEd25519KeyHash(
  //       resolvePaymentKeyHash(address),
  //     );
  //     nativeScripts.add(buildScriptPubkey(keyHash));
  //   });

  //   const scriptAny = csl.ScriptAny.new(nativeScripts);
  //   return csl.NativeScript.new_script_any(scriptAny).to_hex();
  // }

  // static withAllSignatures(addresses: string[]): string {
  //   const nativeScripts = csl.NativeScripts.new();

  //   addresses.forEach((address) => {
  //     const keyHash = deserializeEd25519KeyHash(
  //       resolvePaymentKeyHash(address),
  //     );
  //     nativeScripts.add(buildScriptPubkey(keyHash));
  //   });

  //   const scriptAll = csl.ScriptAll.new(nativeScripts);
  //   return csl.NativeScript.new_script_any(scriptAll).to_hex();
  // }

  static fromNativeScript(script: NativeScript): string {
    return toNativeScript(script).toCbor();
  }
}
