import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import SectionTwoCol from '../../../common/sectionTwoCol';

export default function UsingRedeemer() {
  return (
    <SectionTwoCol
      sidebarTo="redeemer"
      header="Using Redeemer"
      leftFn={Left({})}
      rightFn={Right({})}
    />
  );
}

function Left({}) {
  const [codeSnippetHaskellRedeemer, setCodeSnippetHaskellRedeemer] =
    useState('');
  const [codeSnippetFirstRedeemer, setCodeSnippetFirstRedeemer] = useState('');
  const [codeSnippetSecondRedeemer, setCodeSnippetSecondRedeemer] =
    useState('');
  const [codeSnippetThirdRedeemer, setCodeSnippetThirdRedeemer] = useState('');
  const [codeSnippetRedeemer, setCodeSnippetRedeemer] = useState('');
  useState('');

  useEffect(() => {
    // haskell redeemer type
    let haskellRedeemer = '-- The Redeemer data type in Plutus\n';
    haskellRedeemer +=
      'data MyRedeemer = StartRedeemer PaymentPubKeyHash | SecondRedeemer | EndRedeemer\n';
    haskellRedeemer +=
      "PlutusTx.makeIsDataIndexed ''MyRedeemer [('StartRedeemer,0),('SecondRedeemer,1),('EndRedeemer,2)]";
    setCodeSnippetHaskellRedeemer(haskellRedeemer);

    // 1st redeemer
    let firstRedeemer = '';
    firstRedeemer += 'const addresses = await wallet.getUsedAddresses();\n';
    firstRedeemer += 'const pkh = resolvePaymentKeyHash(addresses[0]);\n';
    firstRedeemer += 'const redeemer = {\n';
    firstRedeemer += '  data: { alternative: 0, fields: [pkh]},\n';
    firstRedeemer += '};\n';
    setCodeSnippetFirstRedeemer(firstRedeemer);
    // 2nd redeemer
    let secondRedeemer = 'const redeemer = {\n';
    secondRedeemer += '  data: { alternative: 1, fields: []},\n';
    secondRedeemer += '};\n';
    setCodeSnippetSecondRedeemer(secondRedeemer);
    // 1st redeemer
    let thirdRedeemer = 'const redeemer = {\n';
    thirdRedeemer += '  data: { alternative: 2, fields: []},\n';
    thirdRedeemer += '};\n';
    setCodeSnippetThirdRedeemer(thirdRedeemer);
    let txWithRedeemer = 'const tx = new Transaction({ initiator: wallet })\n';
    // txWithRedeemer +=
    //   "  .redeemValue('4e4d01000033222220051200120011', assetUtxo, { datum: 'supersecret', redeemer: redeemer })\n";
    txWithRedeemer += `  .redeemValue(\n`;
    txWithRedeemer += `    '4e4d01000033222220051200120011',\n`;
    txWithRedeemer += `    assetUtxo,\n`;
    txWithRedeemer += `    { datum: 'supersecret', redeemer: redeemer }\n`;
    txWithRedeemer += `  )\n`;
    txWithRedeemer += '  .sendValue(address, assetUtxo)\n';
    txWithRedeemer += '  .setRequiredSigners([address]);';
    setCodeSnippetRedeemer(txWithRedeemer);
  });

  return (
    <>
      <p>
        You can design the redeemer with a similar logic as datum. Redeemer is
        with type <code>Action</code>. With Mesh, you can only supply the{' '}
        <code>Data</code> part to construct the redeemer.
      </p>

      <Codeblock
        data={`import { resolvePaymentKeyHash } from '@meshsdk/core';\nimport type { Data } from '@meshsdk/core';`}
        isJson={false}
      />
      <Codeblock
        data={codeSnippetHaskellRedeemer}
        isJson={false}
        language="language-hs"
      />
      <h3>Designing Redeemer</h3>
      <p>
        A redeemer could be designed in a similar manner as datum, but it has to
        be supplied differently.
      </p>
      <p>
        Supplying the <code>StartRedeemer</code> as defined above with the first{' '}
        <code>Used Address</code> as input:
      </p>
      <Codeblock data={codeSnippetFirstRedeemer} isJson={false} />
      <p>
        Supplying the <code>SecondRedeemer</code> as defined above:
      </p>
      <Codeblock data={codeSnippetSecondRedeemer} isJson={false} />
      <p>
        Supplying the <code>EndRedeemer</code> as defined above:
      </p>
      <Codeblock data={codeSnippetThirdRedeemer} isJson={false} />
      <h3>Transaction construction</h3>
      <p>
        We can define the redeemer in <code>redeemValue</code>:
      </p>
      <Codeblock data={codeSnippetRedeemer} isJson={false} />
    </>
  );
}

function Right({}) {
  // const [userDefine, setUserDefine] = useState(`meshtoken`);
  // const [response, setResponse] = useState<null | any>(null);

  // useEffect(() => {
  //   const datumHash = resolveDataHash(userDefine);
  //   setResponse(datumHash);
  // }, [userDefine]);

  return <></>;
  // return (
  //   <Card>
  //     <div className="overflow-x-auto relative">
  //       <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
  //         <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
  //           Design your own datum
  //           <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
  //             Test your datum and get the datum hash. This demo is particularly
  //             helpful as you can use this to validate the datum hash against
  //             those generated by Cardano-CLI.
  //           </p>
  //         </caption>
  //         <thead className="thead">
  //           <tr>
  //             <th scope="col" className="py-3">
  //               Datum
  //             </th>
  //           </tr>
  //         </thead>
  //         <tbody>
  //           <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
  //             <td>
  //               <Textarea
  //                 value={userDefine}
  //                 onChange={(e) => setUserDefine(e.target.value)}
  //                 rows={8}
  //               />
  //             </td>
  //           </tr>
  //         </tbody>
  //       </table>
  //     </div>
  //     {response !== null && (
  //       <>
  //         <p>
  //           <b>Result:</b>
  //         </p>
  //         <Codeblock data={response} />
  //       </>
  //     )}
  //   </Card>
  // );
}
