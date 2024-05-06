import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { getMeshWallet } from './common';

export default function CreateCollateral() {
  return (
    <SectionTwoCol
      sidebarTo="createCollateral"
      header="Create Collateral UTXO"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Collateral is used to guarantee that nodes are compensated for their
        work in case phase-2 validation fails. Thus, collateral is the monetary
        guarantee a user gives to assure that the contract has been carefully
        designed and thoroughly tested. The collateral amount is specified at
        the time of constructing the transaction. Not directly, but by adding
        collateral inputs to the transaction. The total balance in the UTXOs
        corresponding to these specially marked inputs is the transaction’s
        collateral amount. If the user fulfills the conditions of the guarantee,
        and a contract gets executed, the collateral is safe.
      </p>
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const wallet = getMeshWallet();
    let results = await wallet.createCollateral();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Create Collateral UTXO
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Create a new UTXO that can be used as collateral in a transaction.
          </p>
        </div>
        <Codeblock
          data={`const txhash = await wallet.createCollateral();`}
          isJson={false}
        />
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
      </Card>
    </>
  );
}
