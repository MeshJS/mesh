import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function ComplexTransaction() {
  return (
    <Section
      sidebarTo="complexTransaction"
      header="Build a complex transaction"
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
  .mintPlutusScriptV2()
  .mint("1", policyId, tokenName)
  .mintingScript(mintingScript)
  .mintRedeemerValue(mConStr0([]))
  .txOut(this.constants.walletAddress, [{ unit: policyId + tokenName, quantity: "1" }])
  .changeAddress(this.constants.walletAddress)
  .txInCollateral(this.constants.collateralUTxO.txHash, this.constants.collateralUTxO.outputIndex)
  .signingKey(this.constants.skey)
  .complete();

const signedTx = mesh.completeSigning()`;

  return (
    <>
      <p>
        The following shows a simple example of building a transaction of both
        unlocking from script and minting tokens:
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        <a href="https://github.com/sidan-lab/mesh-lower-level-api-demo/blob/mesh-docs/src/transactions/demo.ts#L139C1-L171C5">
          Full Code Snippet in Github
        </a>
      </p>
    </>
  );
}
