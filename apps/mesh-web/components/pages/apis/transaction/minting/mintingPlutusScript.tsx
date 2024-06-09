import Codeblock from '../../../../ui/codeblock';
import SectionTwoCol from '../../../../common/sectionTwoCol';

export default function MintinPlutusScript() {
  return (
    <SectionTwoCol
      sidebarTo="mintingPlutusScript"
      header="Minting Assets with Plutus Script"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let codeSnippetPlutusScript = ``;
  codeSnippetPlutusScript += `const script: PlutusScript = {\n`;
  codeSnippetPlutusScript += `  code: '<plutusScript.compiledCode.cborHex>',\n`;
  codeSnippetPlutusScript += `  version: "V2",\n`;
  codeSnippetPlutusScript += `};\n`;

  let codeSnippetRedeemer = ``;
  codeSnippetRedeemer += `const redeemer = {\n`;
  codeSnippetRedeemer += `  data: { alternative: 0, fields: ["mesh"] },\n`;
  codeSnippetRedeemer += `  tag: "MINT",\n`;
  codeSnippetRedeemer += `};\n`;

  let codeSnippetTransaction = ``;
  codeSnippetTransaction += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippetTransaction += `  .mintAsset(script, asset, redeemer)\n`;
  codeSnippetTransaction += `  .setRequiredSigners([address]);\n`;

  let codeSnippetFull = ``;
  codeSnippetFull += `const address = (await wallet.getUsedAddresses())[0];\n`;
  codeSnippetFull += `\n`;
  codeSnippetFull += `const script: PlutusScript = {\n`;
  codeSnippetFull += `  code: '<plutusScript.compiledCode.cborHex>',\n`;
  codeSnippetFull += `  version: "V2",\n`;
  codeSnippetFull += `};\n`;
  codeSnippetFull += `\n`;
  codeSnippetFull += `const redeemer = {\n`;
  codeSnippetFull += `  data: { alternative: 0, fields: [] },\n`;
  codeSnippetFull += `  tag: "MINT",\n`;
  codeSnippetFull += `};\n`;
  codeSnippetFull += `\n`;
  codeSnippetFull += `const asset: Mint = {\n`;
  codeSnippetFull += `  assetName: "MeshToken",\n`;
  codeSnippetFull += `  assetQuantity: "1",\n`;
  codeSnippetFull += `  metadata: assetMetadata,\n`;
  codeSnippetFull += `  label: "721",\n`;
  codeSnippetFull += `  recipient: address,\n`;
  codeSnippetFull += `};\n`;
  codeSnippetFull += `\n`;
  codeSnippetFull += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippetFull += `  .mintAsset(script, asset, redeemer)\n`;
  codeSnippetFull += `  .setRequiredSigners([address]);\n`;
  codeSnippetFull += `\n`;
  codeSnippetFull += `const unsignedTx = await tx.build();\n`;
  codeSnippetFull += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeSnippetFull += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        For minting assets with a Plutus Script, you need to define the{' '}
        <code>PlutusScript</code>:
      </p>
      <Codeblock data={codeSnippetPlutusScript} isJson={false} />
      <p>
        You also need to define the <code>Redeemer</code>:
      </p>
      <Codeblock data={codeSnippetRedeemer} isJson={false} />
      <p>
        Then you can create the transaction with the <code>Transaction</code>{' '}
        class:
      </p>
      <Codeblock data={codeSnippetTransaction} isJson={false} />
      <p>Here is the full code:</p>
      <Codeblock data={codeSnippetFull} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
