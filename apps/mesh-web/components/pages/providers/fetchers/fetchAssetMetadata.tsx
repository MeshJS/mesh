import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchAssetMetadataLeft({ fetcherName, fetchAssetMetadataAsset }) {
  let code1 = `await ${fetcherName}.fetchAssetMetadata(\n`;
  code1 += `  '${fetchAssetMetadataAsset}',\n`;
  code1 += `)`;
  return (
    <>
      <p>
        Fetch the asset metadata by providing asset's <code>unit</code>, which
        is the concatenation of policy ID and asset name in hex.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
export function fetchAssetMetadataRight({
  fetcher,
  fetchAssetMetadataAsset,
  setfetchAssetMetadataAsset,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchAssetMetadata(fetchAssetMetadataAsset);
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
          value={fetchAssetMetadataAsset}
          onChange={(e) => setfetchAssetMetadataAsset(e.target.value)}
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