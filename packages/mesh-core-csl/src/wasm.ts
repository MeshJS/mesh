import { csl } from "./deser/csl";

export const parseWasmResult = (result: csl.WasmResult): string => {
  if (result.get_status() !== "success") {
    throw new Error(result.get_error());
  }
  return result.get_data();
};
