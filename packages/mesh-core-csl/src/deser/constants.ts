import { csl } from "./csl";

export const LANGUAGE_VERSIONS = {
  V1: csl.Language.new_plutus_v1(),
  V2: csl.Language.new_plutus_v2(),
  V3: csl.Language.new_plutus_v3(),
};

export const REDEEMER_TAGS = {
  CERT: csl.RedeemerTag.new_cert(),
  MINT: csl.RedeemerTag.new_mint(),
  REWARD: csl.RedeemerTag.new_reward(),
  SPEND: csl.RedeemerTag.new_spend(),
};

export const POLICY_ID_LENGTH = 56;
