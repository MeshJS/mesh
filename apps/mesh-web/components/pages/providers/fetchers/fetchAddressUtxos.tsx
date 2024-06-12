import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchAddressUtxosLeft({
  fetcherName,
  fetchAddressUtxosAddress,
  fetchAddressUtxosAsset,
}) {
  let code1 = `await ${fetcherName}.fetchAddressUTxOs(\n`;
  code1 += `  '${fetchAddressUtxosAddress}',\n`;
  if (fetchAddressUtxosAsset.length > 0) {
    code1 += `  '${fetchAddressUtxosAsset}',\n`;
  }
  code1 += `)`;
  return (
    <>
      <p>
        Fetch UTXOs in the provided <code>address</code>. Optionally, you can
        filter UTXOs containing a particular asset by providing{' '}
        <code>asset</code>, where it is the concatenation of policy ID and
        asset.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
export function fetchAddressUtxosRight({
  fetcher,
  fetchAddressUtxosAddress,
  setfetchAddressUtxosAddress,
  fetchAddressUtxosAsset,
  setfetchAddressUtxosAsset,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchAddressUTxOs(
        fetchAddressUtxosAddress,
        fetchAddressUtxosAsset
      );
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
          value={fetchAddressUtxosAddress}
          onChange={(e) => setfetchAddressUtxosAddress(e.target.value)}
          placeholder="Address"
          label="Address"
        />
        <Input
          value={fetchAddressUtxosAsset}
          onChange={(e) => setfetchAddressUtxosAsset(e.target.value)}
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