import { csl } from '@mesh/core';
import { buildScriptPubkey } from '@mesh/common/utils';

export class ForgeScript {
  static requireOneSignature(address: string): string {
    return buildScriptPubkey(address).to_hex();
  }

  static requireAnySignature(addresses: string[]): string {
    const nativeScripts = csl.NativeScripts.new();

    addresses.forEach((address) => {
      nativeScripts.add(buildScriptPubkey(address));
    });

    const scriptAny = csl.ScriptAny.new(nativeScripts);

    return csl.NativeScript.new_script_any(scriptAny)
      .to_hex();
  }

  static requireAllSignature(addresses: string[]): string {
    const nativeScripts = csl.NativeScripts.new();

    addresses.forEach((address) => {
      nativeScripts.add(buildScriptPubkey(address));
    });

    const scriptAll = csl.ScriptAll.new(nativeScripts);

    return csl.NativeScript.new_script_any(scriptAll)
      .to_hex();
  }

  static fromNativeScript(json: string): string {
    return csl.NativeScript.from_json(json)
      .to_hex();
  }
}
