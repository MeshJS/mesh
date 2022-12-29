import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchAccountInfoLeft({ fetcherName, fetchAccountInfoAddress }) {
  let code1 = `await ${fetcherName}.fetchAddressUTxOs(\n`;
  code1 += `  '${fetchAccountInfoAddress}',\n`;
  code1 += `)`;
  return (
    <>
      <p>Fetch account infomation</p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

export function fetchAccountInfoRight({
  fetcher,
  fetchAccountInfoAddress,
  setFetchAccountInfoAddress,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchAccountInfo(fetchAccountInfoAddress);
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
          value={fetchAccountInfoAddress}
          onChange={(e) => setFetchAccountInfoAddress(e.target.value)}
          placeholder="Reward Address"
          label="Reward Address"
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
