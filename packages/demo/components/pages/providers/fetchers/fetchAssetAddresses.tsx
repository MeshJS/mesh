import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchAssetAddressesLeft({
  fetcherName,
  fetchAssetAddressesAsset,
}) {
  let code1 = `await ${fetcherName}.fetchAssetAddress(\n`;
  code1 += `  '${fetchAssetAddressesAsset}',\n`;
  code1 += `)`;
  return (
    <>
      <p>
        Fetch a list of a addresses containing a specific <code>asset</code>{' '}
        where it is the concatenation of policy ID and asset.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
export function fetchAssetAddressesRight({
  fetcher,
  fetchAssetAddressesAsset,
  setfetchAssetAddressesAsset,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchAssetAddresses(fetchAssetAddressesAsset);
      setResponse(res);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Input
          value={fetchAssetAddressesAsset}
          onChange={(e) => setfetchAssetAddressesAsset(e.target.value)}
          placeholder="Asset"
          label="Asset"
        />
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}
