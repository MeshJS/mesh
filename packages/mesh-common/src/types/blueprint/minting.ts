import { LanguageVersion } from "..";
import { PlutusDataType } from "../../data";

export interface IMintingBlueprint {
  version: LanguageVersion;
  cbor: string;
  hash: string;
  paramScript(
    compiledCode: string,
    params: string[],
    paramsType: PlutusDataType,
  ): this;
  noParamScript(compiledCode: string): this;
}
