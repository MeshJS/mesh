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
  let codeSnippet = ``;
  codeSnippet += `const signedTx = await mesh\n`;
  codeSnippet += `  .txIn('a02913bff2a1681f562e0b3aa1effa20a8ff192986f9106698b691707b274d8f', 3)\n`;
  codeSnippet += `  .readOnlyTxInReference('8b7ea04a142933b3d8005bf98be906bdba10978891593b383deac933497e2ea7', 1)\n`;
  codeSnippet += `  .mintPlutusScriptV2()\n`;
  codeSnippet += `  .mint(1, mintPolicyIdHex, mintTokenNameHex)\n`;
  codeSnippet += `  .mintTxInReference('63210437b543c8a11afbbc6765aa205eb2733cb74e2805afd4c1c8cb72bd8e22', 0)\n`;
  codeSnippet += `  .mintRedeemerValue({ alternative: 0, fields: [myMintRedeemerValue] }, { mem: 3386819, steps: 1048170931 })\n`;
  codeSnippet += `  .spendingPlutusScriptV2()\n`;
  codeSnippet += `  .txIn('42ee770080d0e440aabd5b328cc00a65edc4b7bf2612d2bbcf6302bf0e504714', 0)\n`;
  codeSnippet += `  .spendingReferenceTxInInlineDatumPresent()\n`;
  codeSnippet += `  .spendingReferenceTxInRedeemerValue(\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      alternative: 0,\n`;
  codeSnippet += `      fields: [mySpendRedeemerValue],\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `    { mem: 9978951, steps: 4541421719 }\n`;
  codeSnippet += `  )\n`;
  codeSnippet += `  .spendingTxInReference('bb712547a5abe3697f8aba72870e33a52fd2c0401715950197f9b7370d137998', 0)\n`;
  codeSnippet += `  .txOut(walletAddress, [\n`;
  codeSnippet += `    { unit: 'lovelace', quantity: '2000000' },\n`;
  codeSnippet += `    { unit: mintPolicyIdHex + mintTokenNameHex, quantity: '1' },\n`;
  codeSnippet += `  ])\n`;
  codeSnippet += `  .txOut(feeCollector, [{ unit: 'lovelace', quantity: '30000000' }])\n`;
  codeSnippet += `  .txOut(validatorAddress, [\n`;
  codeSnippet += `    { unit: 'lovelace', quantity: '20000000' },\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      unit: oracleTokenPolicyIdHex + oracleTokenNameHex,\n`;
  codeSnippet += `      quantity: '1',\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  ])\n`;
  codeSnippet += `  .txOutInlineDatumValue(complexDatumValue)\n`;
  codeSnippet += `  .requiredSignerHash(feeCollector)\n`;
  codeSnippet += `  .metadataValue('721', metadataObject)\n`;
  codeSnippet += `  .txInCollateral('3fbdf2b0b4213855dd9b87f7c94a50cf352ba6edfdded85ecb22cf9ceb75f814', 6)\n`;
  codeSnippet += `  .txInCollateral('3fbdf2b0b4213855dd9b87f7c94a50cf352ba6edfdded85ecb22cf9ceb75f814', 7)\n`;
  codeSnippet += `  .changeAddress(walletAddress)\n`;
  codeSnippet += `  .signingKey(appOwnerPrivateKey)\n`;
  codeSnippet += `  .signingKey(minterPrivateKey)\n`;
  codeSnippet += `  .complete();\n`;

  return (
    <>
      <p>The following shows a example of building complex transaction:</p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}
