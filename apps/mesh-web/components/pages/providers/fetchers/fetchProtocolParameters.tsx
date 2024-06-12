import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchProtocolParametersLeft({ fetcherName, fetchProtocolParameters }) {
  let code1 = `await ${fetcherName}.fetchProtocolParameters(`;
  if (fetchProtocolParameters.length > 0) {
    code1 += `${fetchProtocolParameters}`;
  }
  code1 += `)`;
  return (
    <>
      <p>
        Fetch the latest protocol parameters. Optionally, you can provide an
        epoch number to fetch the protocol parameters of that epoch.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
export function fetchProtocolParametersRight({
  fetcher,
  fetchProtocolParameters,
  setfetchProtocolParameters,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      if (fetchProtocolParameters.length > 0) {
        const res = await fetcher.fetchProtocolParameters(
          parseInt(fetchProtocolParameters)
        );
        setResponse(res);
      } else {
        const res = await fetcher.fetchProtocolParameters();
        setResponse(res);
      }
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Input
          value={fetchProtocolParameters}
          onChange={(e) => setfetchProtocolParameters(e.target.value)}
          placeholder="Epoch"
          label="Epoch"
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