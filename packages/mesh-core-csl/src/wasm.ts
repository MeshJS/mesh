import { EvalWasmResult } from "whisky-evaluator";

export const parseWasmResult = (result: EvalWasmResult): string => {
  if (result.get_status() !== "success") {
    throw new Error(result.get_error());
  }
  return result.get_data();
};
