import { LanguageVersion } from "..";
import { PlutusDataType } from "../../data";

export interface ISpendingBlueprint {
  version: LanguageVersion;
  networkId: number;
  cbor: string;
  hash: string;
  address: string;
  stakeHash?: string;
  isStakeScriptCredential: boolean;
  paramScript(
    compiledCode: string,
    params: string[],
    paramsType: PlutusDataType,
  ): this;
  noParamScript(compiledCode: string): this;
}
