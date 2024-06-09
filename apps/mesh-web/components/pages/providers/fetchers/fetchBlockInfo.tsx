import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchBlockInfoLeft({ fetcherName, block }) {
  let code1 = `await ${fetcherName}.fetchBlockInfo(\n`;
  code1 += `  '${block}',\n`;
  code1 += `)`;
  return (
    <>
      <p>
        Fetch block infomation. You can get the hash from{' '}
        <code>fetchTxInfo()</code>.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

export function fetchBlockInfoRight({ fetcher, block, setBlock }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchBlockInfo(block);
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
          value={block}
          onChange={(e) => setBlock(e.target.value)}
          placeholder="Block hash"
          label="Block hash"
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
