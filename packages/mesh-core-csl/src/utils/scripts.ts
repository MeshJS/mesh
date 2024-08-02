import { csl } from "../deser";

export const getV2ScriptHash = (script: string): string =>
  csl.get_v2_script_hash(script);
