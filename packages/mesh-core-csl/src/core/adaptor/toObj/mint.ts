import {
  MintItem,
  ScriptSource,
  SimpleScriptSourceInfo,
} from "@meshsdk/common";

import { redeemerToObj } from "./data";
import { scriptSourceToObj, simpleScriptSourceToObj } from "./script";

export const mintItemToObj = (mintItem: MintItem): object => {
  switch (mintItem.type) {
    case "Plutus":
      return {
        scriptMint: plutusMintItemToObj(mintItem as Required<MintItem>),
      };
    case "Native":
      return {
        simpleScriptMint: nativeMintItemToObj(
          mintItem as Omit<Required<MintItem>, "redeemer">,
        ),
      };
  }
};

export const plutusMintItemToObj = (mintItem: Required<MintItem>): object => {
  let scriptSource: object = scriptSourceToObj(
    mintItem.scriptSource as ScriptSource,
  );

  return {
    mint: mintParametersObj(mintItem),
    redeemer: mintItem.redeemer ? redeemerToObj(mintItem.redeemer) : null,
    scriptSource,
  };
};

export const nativeMintItemToObj = (
  mintItem: Omit<Required<MintItem>, "redeemer">,
): object => {
  return {
    mint: mintParametersObj(mintItem),
    scriptSource: simpleScriptSourceToObj(
      mintItem.scriptSource as SimpleScriptSourceInfo,
    ),
  };
};

export const mintParametersObj = (mintItem: MintItem): object => {
  return {
    policyId: mintItem.policyId,
    assetName: mintItem.assetName,
    amount: BigInt(mintItem.amount),
  };
};
