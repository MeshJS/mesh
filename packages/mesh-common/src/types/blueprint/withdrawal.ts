import { PlutusDataType } from "../../data";
import { LanguageVersion } from "../plutus-script";

export interface IWithdrawalBlueprint {
  version: LanguageVersion;
  networkId: number;
  cbor: string;
  hash: string;
  address: string;
  paramScript(
    compiledCode: string,
    params: string[],
    paramsType: PlutusDataType,
  ): this;
  noParamScript(compiledCode: string): this;
}
