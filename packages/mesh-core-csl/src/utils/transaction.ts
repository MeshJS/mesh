import { csl, deserializeTx } from "../deser";
import { parseWasmResult } from "../wasm";
import { UTxO, Network, Action, Budget, RedeemerTagType } from "@meshsdk/common";

type RedeemerTagWasm = "cert" | "mint" | "reward" | "spend" | "vote" | "propose";
type ActionWasm = {
  index: number;
  budget: BudgetWasm;
  tag: RedeemerTagWasm;
};
type BudgetWasm = {
  mem: number;
  steps: number;
};

export const calculateTxHash = (txHex: string) => {
  const result = csl.js_calculate_tx_hash(txHex);
  return parseWasmResult(result);
};

export const signTransaction = (txHex: string, signingKeys: string[]) => {
  const cslSigningKeys = csl.JsVecString.new();
  signingKeys.forEach((key) => {
    cslSigningKeys.add(key);
  });
  const result = csl.js_sign_transaction(txHex, cslSigningKeys);
  return parseWasmResult(result);
};

export const evaluateTransaction = (txHex: string, resolvedUtxos: UTxO[], network: Network): Omit<Action, "data">[] => {
  const additionalTxs = csl.JsVecString.new();
  const mappedUtxos = csl.JsVecString.new();
  for (const utxo of resolvedUtxos) {
    mappedUtxos.add(JSON.stringify(utxo));
  }
  const result = csl.evaluate_tx_scripts_js(txHex, mappedUtxos, additionalTxs, network);
  const unwrappedResult = parseWasmResult(result);
  try {
    const actions = JSON.parse(unwrappedResult) as ActionWasm[];
    return actions.map(mapAction);
  } catch (e) {
    throw new Error("Cannot parse result from evaluate_tx_scripts_js. Expected Action[] type");
  }
}

const mapAction = (action: ActionWasm): Omit<Action, "data"> => {
  return {
    index: action.index,
    budget: mapBudget(action.budget),
    tag: mapRedeemerTag(action.tag),
  };
}

const mapBudget = (budget: BudgetWasm): Budget => {
  return {
    mem: budget.mem,
    steps: budget.steps,
  };
}

const mapRedeemerTag = (tag: RedeemerTagWasm): RedeemerTagType => {
  switch (tag) {
    case "cert":
      return "CERT"
    case "mint":
      return "MINT"
    case "reward":
      return "REWARD"
    case "spend":
      return "SPEND"
    case "vote":
      return "VOTE"
    case "propose":
      return "PROPOSE"
    default:
      throw new Error(`Unknown RedeemerTag: ${tag}`);
  }
}

export const getTransactionInputs = (txHex: string): {
  txHash: string;
  index: number;
}[] => {
  const inputs = []
  const deserializedTx = deserializeTx(txHex);
  const body = deserializedTx.body();
  const cslInputs = body.inputs();
  for (let i = 0; i < cslInputs.len(); i++) {
    const input = cslInputs.get(i);
    inputs.push({
      txHash: input.transaction_id().to_hex(),
      index: input.index(),
    });
  }
  const cslCollaterals = body.collateral();
  if (cslCollaterals) {
    for (let i = 0; i < cslCollaterals.len(); i++) {
      const collateral = cslCollaterals.get(i);
      inputs.push({
        txHash: collateral.transaction_id().to_hex(),
        index: collateral.index(),
      });
    }
  }
  const cslRefInputs = body.reference_inputs();
  if (cslRefInputs) {
    for (let i = 0; i < cslRefInputs.len(); i++) {
      const refInput = cslRefInputs.get(i);
      inputs.push({
        txHash: refInput.transaction_id().to_hex(),
        index: refInput.index(),
      });
    }
  }

  return inputs;
}
