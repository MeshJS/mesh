import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolveStakeKeyHash } from '@meshsdk/core';
import Input from '../../../ui/input';

export default function ResolveStakeKeyHash() {
  const [userinput, setUserinput] = useState<string>(
    'stake1u93r8fsv43jyuw84yv4xwzfmka5sms5u5karqjysw2jszaq2kapyl'
  );

  return (
    <SectionTwoCol
      sidebarTo="resolveStakeKeyHash"
      header="Resolve Stake Key Hash"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function Left(userinput) {
  let code = `import { resolveStakeKeyHash } from '@meshsdk/core';\nconst hash = resolveStakeKeyHash('${userinput}');`;

  return (
    <>
      <p>
        Provide a stake address, and <code>resolveStakeKeyHash</code> will
        return the pub key hash of the stake address. This key hash is useful
        for building the NativeScript.
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
      const hash = resolveStakeKeyHash(userinput);
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
