import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolvePaymentKeyHash } from '@meshsdk/core';
import Input from '../../../ui/input';
import { demoAddresses } from '../../../../configs/demo';

export default function ResolvePaymentKeyHash() {
  const [userinput, setUserinput] = useState<string>(demoAddresses.testnet);

  return (
    <SectionTwoCol
      sidebarTo="resolvePaymentKeyHash"
      header="Resolve Payment Key Hash"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function Left(userinput) {
  let code = `import { resolvePaymentKeyHash } from '@meshsdk/core';\nconst hash = resolvePaymentKeyHash('${userinput}');`;

  return (
    <>
      <p>
        Provide an address, and <code>resolvePaymentKeyHash</code> will return
        the pub key hash of the payment key. This key hash is useful for building
        the NativeScript.
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right(userinput, setUserinput) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const hash = resolvePaymentKeyHash(userinput);
      setResponse(hash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <>
      <Card>
        <Input
          value={userinput}
          onChange={(e) => setUserinput(e.target.value)}
          placeholder="Address"
          label="Address"
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
