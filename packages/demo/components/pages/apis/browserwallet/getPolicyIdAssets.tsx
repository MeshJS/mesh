import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';
import Input from '../../../ui/input';

export default function GetPolicyIdAssets() {
  const [policyId, setPolicyId] = useState<string>(
    '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a42'
  );
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
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getPolicyIdAssets(policyId);
    setResponse(results);
    setLoading(false);
  }
  return (
    <Card>
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

      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={runDemo}
            loading={loading}
            response={response}
          />
          <RunDemoResult response={response} />
        </>
      ) : (
        <ConnectCipWallet />
      )}
    </Card>
  );
}
