import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import {
  resolveNativeScriptHash,
  resolvePaymentKeyHash,
  resolveSlotNo,
} from '@martifylabs/mesh';
import Input from '../../../ui/input';
import type { NativeScript } from '@martifylabs/mesh';

export default function ResolveNativeScriptHash() {
  const [userinput, setUserinput] = useState<string>(
    '426117329844ccb3b0ba877220ff06a5bdf21eab3fb33e2f3a3f8e69'
  );
  const [userinput2, setUserinput2] = useState<string>('meshtoken');

  return (
    <SectionTwoCol
      sidebarTo="resolveNativeScriptHash"
      header="Resolve Native Script Hash"
      leftFn={Left(userinput, userinput2)}
      rightFn={Right(userinput, setUserinput, userinput2, setUserinput2)}
    />
  );
}

function Left(userinput, userinput2) {
  return (
    <>
      <p>
        <code>resolveNativeScriptHash</code> takes policy ID and asset name, and
        return asset fingerprint based on .
      </p>
      <Codeblock data={``} isJson={false} />
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
      // const slot = userinput;
      // const keyHash = userinput2;

      const slot = resolveSlotNo('mainnet');
      const keyHash = resolvePaymentKeyHash(
        'addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr'
      );

      const nativeScript: NativeScript = {
        type: 'all',
        scripts: [
          {
            type: 'before',
            slot: slot,
          },
          {
            type: 'sig',
            keyHash: keyHash,
          },
        ],
      };

      const hash = resolveNativeScriptHash(nativeScript);
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
