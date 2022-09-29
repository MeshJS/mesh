import { csl } from '@mesh/core';
import {
  buildScriptPubkey, resolvePaymentKeyHash,
} from '@mesh/common/utils';
import type { NativeScript } from '@mesh/common/types';

export class ForgeScript {
  static withOneSignature(address: string): string {
    const keyHash = resolvePaymentKeyHash(address);
    return buildScriptPubkey(keyHash).to_hex();
  }

  static withAtLeastNSignatures(
    addresses: string[], minimumRequired: number,
  ): string {
    const nativeScripts = csl.NativeScripts.new();

    addresses.forEach((address) => {
      const keyHash = resolvePaymentKeyHash(address);
      nativeScripts.add(buildScriptPubkey(keyHash));
    });

    const scriptNOfK = csl.ScriptNOfK.new(minimumRequired, nativeScripts);
    return csl.NativeScript.new_script_any(scriptNOfK).to_hex();
  }

  static withAnySignature(addresses: string[]): string {
    const nativeScripts = csl.NativeScripts.new();

    addresses.forEach((address) => {
      const keyHash = resolvePaymentKeyHash(address);
      nativeScripts.add(buildScriptPubkey(keyHash));
    });

    const scriptAny = csl.ScriptAny.new(nativeScripts);
    return csl.NativeScript.new_script_any(scriptAny).to_hex();
  }

  static withAllSignatures(addresses: string[]): string {
    const nativeScripts = csl.NativeScripts.new();

    addresses.forEach((address) => {
      const keyHash = resolvePaymentKeyHash(address);
      nativeScripts.add(buildScriptPubkey(keyHash));
    });

    const scriptAll = csl.ScriptAll.new(nativeScripts);
    return csl.NativeScript.new_script_any(scriptAll).to_hex();
  }

  static fromNativeScript(script: NativeScript): string {
    const json = JSON.stringify(script);
    return csl.NativeScript.from_json(json).to_hex();
  }
}
