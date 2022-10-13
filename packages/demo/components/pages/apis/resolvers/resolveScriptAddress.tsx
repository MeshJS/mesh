import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import { resolvePlutusScriptAddress } from '@martifylabs/mesh';
import Input from '../../../ui/input';

export default function ResolveScriptAddress() {
  const [userinput, setUserinput] = useState<number>(0);
  const [userinput2, setUserinput2] = useState<string>(
    '4e4d01000033222220051200120011'
  );

  return (
    <SectionTwoCol
      sidebarTo="resolvePlutusScriptAddress"
      header="Resolve Script Address"
      leftFn={Left(userinput, userinput2)}
      rightFn={Right(userinput, setUserinput, userinput2, setUserinput2)}
    />
  );
}

function Left(userinput, userinput2) {
  let code = `import { resolvePlutusScriptAddress } from '@martifylabs/mesh';\nconst hash = resolvePlutusScriptAddress({ code:${userinput}, version: 'V1' }, '${userinput2}');`;

  return (
    <>
      <p>
        Provide the Plutus script in CBOR, and <code>resolvePlutusScriptAddress</code>{' '}
        will return a bech32 address of the script.
      </p>
      <p>
        For example, we can get the address of the <code>always succeed</code>{' '}
        smart contract.
      </p>
      <Codeblock data={code} isJson={false} />
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
      const hash = resolvePlutusScriptAddress({
        code: userinput,
        version: 'V1',
      }, userinput2);
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
          placeholder="Network ID"
          label="Network ID"
          type="number"
        />
        <Input
          value={userinput2}
          onChange={(e) => setUserinput2(e.target.value)}
          placeholder="Plutus script CBOR"
          label="Plutus script CBOR"
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
