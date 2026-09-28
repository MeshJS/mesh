/**
 * Every terminal action (`Withdraw`, `WithdrawRefund`, `WithdrawDisputed`) pays out via
 * "tagged" outputs: the validator's `outputs_with_reference_tag` only counts an output toward
 * a required payout sum if its inline datum is the exact `OutputReference`
 * (`{transaction_id, output_index}`) of the UTxO being spent - confirmed flat (`Constr0[ByteArray,
 * Int]`, no wrapping) against Aiken stdlib's `Hash<alg,a> = ByteArray` alias, which is exactly
 * `@meshsdk/common`'s existing `mOutputReference` helper.
 */
import { mOutputReference } from "@meshsdk/common";

/** The inline datum every payout output tagged to `ownRef` must carry. */
export const taggedOutputDatum = (ownRef: { txHash: string; outputIndex: number }) =>
  mOutputReference(ownRef.txHash, ownRef.outputIndex);
