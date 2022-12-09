import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';

export function fetchHandleAddressLeft({
  fetcherName,
  fetchHandleAddressHandle,
}) {
  let code1 = `await ${fetcherName}.fetchHandleAddress(\n`;
  code1 += `  '${fetchHandleAddressHandle}',\n`;
  code1 += `)`;
  return (
    <>
      <p>
        <a href="https://adahandle.com/" target="_blank" rel="noreferrer">
          ADA Handle
        </a>{' '}
        allows users to use a human-readable "Handle" to associate an address.
      </p>
      <p>
        Each Handle is a unique NFT, minted and issued on the Cardano
        blockchain. These NFTs act as unique identifiers for the UTXO that they
        reside in.
      </p>
      <p>
        Working together with <code>{fetcherName}</code>, we can resolve the
        handle's address with this API.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
export function fetchHandleAddressRight({
  fetcher,
  fetchHandleAddressHandle,
  setfetchHandleAddressHandle,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchHandleAddress(fetchHandleAddressHandle);
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
          value={fetchHandleAddressHandle}
          onChange={(e) => setfetchHandleAddressHandle(e.target.value)}
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
        <p>
          Note: if you get an error here, you could be on the wrong network.
          Change the provider's network at the top of the page.
        </p>
      </Card>
    </>
  );
}
