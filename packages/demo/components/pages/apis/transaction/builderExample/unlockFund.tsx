import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function UnlockFund() {
  return (
    <Section
      sidebarTo="unlockFund"
      header="Build a transaction to unlock fund from smart contract"
      contentFn={Content()}
    />
  );
}

function Content() {
  const codeSnippet = `await mesh
  .txIn(txInHash, txInId)
  .spendingPlutusScriptV2()
  .txIn(validatorInput.txHash, validatorInput.outputIndex)
  .txInInlineDatumPresent()
  .txInRedeemerValue(mConStr0([]))
  .txInScript(getScriptCbor("Spending"))
  .txOut(this.constants.walletAddress, [])
  .changeAddress(this.constants.walletAddress)
  .txInCollateral(this.constants.collateralUTxO.txHash, this.constants.collateralUTxO.outputIndex)
  .signingKey(this.constants.skey)
  .complete();

const signedTx = mesh.completeSigning()`;

  return (
    <>
      <p>
        The following shows a simple example of building a transaction to unlock
        fund from a smart contract. It is equivalent to the following CLI
        command in{' '}
        <a href="https://plutuspbl.io/modules/102/1025">PPBL Module 102.5</a>
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        <a href="https://github.com/sidan-lab/mesh-lower-level-api-demo/blob/mesh-docs/src/transactions/demo.ts#L93C1-L107C5">
          Full Code Snippet in Github
        </a>
      </p>
    </>
  );
}
