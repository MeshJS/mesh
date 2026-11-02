import {
  emptyTxBuilderBody,
  ITxParser,
  MeshTxBuilderBody,
  TxInput,
  TxTester,
  UTxO,
} from "@meshsdk/common";

import { getTransactionInputs } from "../utils/transaction";
import { parseCertificates } from "./certificates";
import { addressToString, TxParserContext } from "./context";
import {
  parseCollaterals,
  parseInputs,
  parseMints,
  parseOutputs,
  parseReferenceInputs,
  parseWithdrawals,
} from "./inputs-outputs";
import { parseMetadata, parseScriptMetadata } from "./metadata";
import { parseProposals } from "./proposals";
import { parseVotes } from "./votes";

export { fromCardanoMetadatum } from "./metadata";
export {
  fromCardanoGovernanceAction,
  fromCardanoProtocolParamUpdate,
} from "./proposals";

/**
 * Rebuild the `MeshTxBuilderBody` a transaction was built from.
 *
 * `resolvedUtxos` must contain the UTxOs of every input and collateral (their value and
 * address are not part of the transaction); reference inputs are optional and only used
 * to recover reference scripts and their sizes. `fee` is left at the body default "0";
 * `MeshTxBuilder.complete()` takes any non-empty fee as fixed, so drop or override it
 * before rebuilding. `changeAddress` is the address of the last output.
 */
export const parseTxBuilderBody = (
  txHex: string,
  resolvedUtxos: UTxO[] = [],
): MeshTxBuilderBody => {
  const ctx = new TxParserContext(txHex, resolvedUtxos);
  const body = emptyTxBuilderBody();

  body.inputs = parseInputs(ctx);
  body.outputs = parseOutputs(ctx);
  body.collaterals = parseCollaterals(ctx);
  body.referenceInputs = parseReferenceInputs(ctx);
  body.requiredSignatures = (ctx.body.requiredSigners()?.values() ?? []).map(
    (hash) => hash.toCore().toString(),
  );
  body.mints = parseMints(ctx);
  body.withdrawals = parseWithdrawals(ctx);
  body.certificates = parseCertificates(ctx);
  body.votes = parseVotes(ctx);
  body.proposals = parseProposals(ctx);

  const invalidBefore = ctx.body.validityStartInterval();
  if (invalidBefore !== undefined) {
    body.validityRange.invalidBefore = Number(invalidBefore);
  }
  const invalidHereafter = ctx.body.ttl();
  if (invalidHereafter !== undefined) {
    body.validityRange.invalidHereafter = Number(invalidHereafter);
  }

  const auxiliaryData = ctx.tx.auxiliaryData();
  body.metadata = parseMetadata(auxiliaryData);
  body.scriptMetadata = parseScriptMetadata(auxiliaryData);

  const lastOutput = body.outputs[body.outputs.length - 1];
  body.changeAddress = lastOutput?.address ?? "";

  const totalCollateral = ctx.body.totalCollateral();
  if (totalCollateral !== undefined) {
    body.totalCollateral = totalCollateral.toString();
  }
  const collateralReturn = ctx.body.collateralReturn();
  if (collateralReturn) {
    body.collateralReturnAddress = addressToString(collateralReturn.address());
  }
  const donation = ctx.body.donation();
  if (donation !== undefined) {
    body.donation = donation.toString();
  }

  return body;
};

export class CardanoSDKTxParser implements ITxParser {
  private txBuilderBody: MeshTxBuilderBody = emptyTxBuilderBody();

  getRequiredInputs = (txHex: string): TxInput[] => getTransactionInputs(txHex);

  parse = (txHex: string, resolvedUtxos: UTxO[] = []): void => {
    this.txBuilderBody = parseTxBuilderBody(txHex, resolvedUtxos);
  };

  toTester = (): TxTester => new TxTester(this.txBuilderBody);

  getBuilderBody = (): MeshTxBuilderBody => this.txBuilderBody;

  getBuilderBodyWithoutChange = (): MeshTxBuilderBody => {
    const txBuilderBody = { ...this.txBuilderBody };
    txBuilderBody.outputs = txBuilderBody.outputs.slice(0, -1);
    return txBuilderBody;
  };
}
