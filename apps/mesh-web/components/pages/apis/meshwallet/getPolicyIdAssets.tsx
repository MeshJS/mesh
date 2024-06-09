import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Input from '../../../ui/input';
import { getMeshWallet } from './common';
import { assetPolicyId } from '../../../../configs/demo';

export default function GetPolicyIdAssets() {
  const [policyId, setPolicyId] = useState<string>(assetPolicyId);
  return (
    <SectionTwoCol
      sidebarTo="getPolicyIdAssets"
      header="Get a Collection of Assets"
      leftFn={Left({ policyId })}
      rightFn={Right({ policyId, setPolicyId })}
    />
  );
}

function Left({ policyId }) {
  return (
    <>
      <p>
        Returns a list of assets from a policy ID. If no assets in wallet
        belongs to the policy ID, an empty list is returned. Query for a list of
        assets&apos; policy ID with <code>wallet.getPolicyIds()</code>.
      </p>
    </>
  );
}

function Right({ policyId, setPolicyId }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const wallet = getMeshWallet();
    let results = await wallet.getPolicyIdAssets(policyId);
    setResponse(results);
    setLoading(false);
  }
  return (
    <Card>
      <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
        Get a Collection of Assets
        <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
          Get a list of assets belonging to the policy ID
        </p>
      </div>
      <Input
        value={policyId}
        onChange={(e) => setPolicyId(e.target.value)}
        placeholder="Policy ID"
        label="Policy ID"
      />
      <Codeblock
        data={`const assets = await wallet.getPolicyIdAssets('${policyId}');`}
        isJson={false}
      />
      <RunDemoButton
        runDemoFn={runDemo}
        loading={loading}
        response={response}
      />
      <RunDemoResult response={response} />
    </Card>
  );
}
