import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchTxInfoLeft({ fetcherName, txHash }) {
  let code1 = `await ${fetcherName}.fetchTxInfo(\n`;
  code1 += `  '${txHash}',\n`;
  code1 += `)`;
  return (
    <>
      <p>
        Fetch transaction infomation. Only confirmed transaction can be
        retrieved.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

export function fetchTxInfoRight({ fetcher, txHash, setTxHash }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchTxInfo(txHash);
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
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="Transaction hash"
          label="Transaction hash"
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
