import {
  Action,
  Asset,
  Budget,
  Data,
  Mint,
  NativeScript,
  PlutusScript,
  PoolParams,
  Recipient,
  Token,
  UTxO,
} from "@meshsdk/common";

export interface TransactionV2 {
  sendAssets(
    receiver: string,
    assets: Asset[],
    datum?: Data,
    inlineScript?: string,
    isInline?: boolean,
  ): this;
  sendLovelace(recipient: Recipient, lovelace: string): this;
  sendToken(recipient: Recipient, ticker: Token, amount: string): this;
  sendValue(recipient: Recipient, value: UTxO): this;
  setTxInputs(inputs: UTxO[]): this;
  setTxRefInputs(inputs: UTxO[]): this;
  setNativeScriptInput(script: NativeScript, utxo: UTxO): this;
  redeemValue(options: {
    value: UTxO;
    script: PlutusScript | UTxO;
    redeemer?: Pick<Action, "data"> & { budget?: Budget };
    datum?: Data | UTxO;
  }): this;
  mintAsset(
    forgeScript: string | PlutusScript | UTxO,
    mint: Mint,
    redeemer?: Pick<Action, "data"> & { budget?: Budget },
  ): this;
  burnAsset(
    forgeScript: string | PlutusScript | UTxO,
    asset: Asset,
    redeemer?: Pick<Action, "data"> & { budget?: Budget },
  ): this;
  setChangeAddress(changeAddress: string): this;
  setCollateral(collateral: UTxO[]): this;
  setRequiredSigners(addresses: string[]): this;
  setTimeToExpire(slot: string): this;
  setTimeToStart(slot: string): this;
  setMetadata(key: number, value: unknown): this;
  withdrawRewards(rewardAddress: string, lovelace: string): this;
  delegateStake(rewardAddress: string, poolId: string): this;
  deregisterStake(rewardAddress: string): this;
  registerStake(rewardAddress: string): this;
  registerPool(params: PoolParams): this;
  retirePool(poolId: string, epochNo: number): this;
  spendUtxo(utxo: UTxO, redeemer?: Data): this;
}
