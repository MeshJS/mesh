/**
 * Builds a continuation datum for the escrow's script output: every field copied from the
 * currently-parsed on-chain datum except the 2-4 the calling action explicitly overrides. Every
 * state-preserving action (`SetRefundRequested`, `AuthorizeWithdrawal`, `SubmitResult`,
 * `AuthorizeRefund`) uses this same pattern - the validator's own continuation check is an
 * exact-match `list.find` over ALL 19 fields, so getting even one unrelated field wrong makes
 * the whole spend abort with no other diagnostic.
 */
import { Data } from "@meshsdk/common";

import { buildMasumiDatum, MasumiDatumView } from "../datum";

export const buildContinuationDatum = (
  current: MasumiDatumView,
  overrides: Partial<Pick<MasumiDatumView, "resultHash" | "sellerCooldownTime" | "buyerCooldownTime" | "state">>,
): Data => buildMasumiDatum({ ...current, ...overrides });
