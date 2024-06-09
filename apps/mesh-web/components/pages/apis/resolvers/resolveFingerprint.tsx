import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolveFingerprint } from '@meshsdk/core';
import Input from '../../../ui/input';

export default function ResolveFingerprint() {
  const [userinput, setUserinput] = useState<string>(
    '426117329844ccb3b0ba877220ff06a5bdf21eab3fb33e2f3a3f8e69'
  );
  const [userinput2, setUserinput2] = useState<string>('meshtoken');

  return (
    <SectionTwoCol
      sidebarTo="resolveFingerprint"
      header="Resolve Fingerprint"
      leftFn={Left(userinput, userinput2)}
      rightFn={Right(userinput, setUserinput, userinput2, setUserinput2)}
    />
  );
}

function Left(userinput, userinput2) {
  return (
    <>
      <p>
        <code>resolveFingerprint</code> takes policy ID and asset name, and
        return asset fingerprint based on{' '}
        <a
          href="https://cips.cardano.org/cips/cip14/"
          target="_blank"
          rel="noreferrer"
        >
          CIP-14
        </a>
        .
      </p>
      <Codeblock
        data={`import { resolveFingerprint } from '@meshsdk/core';\nconst hash = resolveFingerprint(\n  '${userinput}',\n  '${userinput2}'\n);`}
        isJson={false}
      />
    </>
  );
}

function Right(userinput, setUserinput, userinput2, setUserinput2) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const policyId = userinput;
      const assetName = userinput2;
      const hash = resolveFingerprint(policyId, assetName);
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
          placeholder="Policy ID"
          label="Policy ID"
        />
        <Input
          value={userinput2}
          onChange={(e) => setUserinput2(e.target.value)}
          placeholder="Asset name"
          label="Asset name"
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
