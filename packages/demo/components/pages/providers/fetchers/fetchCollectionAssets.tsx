import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchCollectionAssetsLeft({ fetcherName, policyId, cursor }) {
  let code1 = `await ${fetcherName}.fetchCollectionAssets(\n`;
  code1 += `  '${policyId}', ${cursor},\n`;
  code1 += `)`;

  let code2 = '';
  code2 += `{\n`;
  code2 += `  "assets": [\n`;
  code2 += `    {\n`;
  code2 += `      "unit": "d9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e",\n`;
  code2 += `      "quantity": "1"\n`;
  code2 += `    },\n`;
  code2 += `  ],\n`;
  code2 += `  "next": null\n`;
  code2 += `}\n`;

  return (
    <>
      <p>
        Fetch a list of assets belonging to a collection by providing its Policy
        ID.
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        The API will return a list of <code>assets</code> and a cursor{' '}
        <code>next</code>. If the cursor is not null, you can use it to fetch
        the next page of results. Here is an example of the response.
      </p>
      <Codeblock data={code2} isJson={false} />
    </>
  );
}

export function fetchCollectionAssetsRight({
  fetcher,
  policyId,
  setPolicyId,
  cursor,
  setCursor,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = cursor ? await fetcher.fetchCollectionAssets(policyId, cursor) : await fetcher.fetchCollectionAssets(policyId);
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
          value={policyId}
          onChange={(e) => setPolicyId(e.target.value)}
          placeholder="Policy ID"
          label="Policy ID"
        />
        <Input
          value={cursor}
          onChange={(e) => setCursor(e.target.value)}
          placeholder="Cursor"
          label="Cursor"
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
