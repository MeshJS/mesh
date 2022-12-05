import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolvePlutusScriptHash } from '@meshsdk/core';
import Input from '../../../ui/input';

export default function ResolvePlutusScriptHash() {
  const [userinput, setUserinput] = useState<string>(
    'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8'
  );

  return (
    <SectionTwoCol
      sidebarTo="resolvePlutusScriptHash"
      header="Resolve Plutus Script Hash"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function Left(userinput) {
  let code = `import { resolvePlutusScriptHash } from '@meshsdk/core';\nconst hash = resolvePlutusScriptHash('${userinput}');`;

  return (
    <>
      <p>
        Provide the Plutus script address, and <code>resolveScriptHash</code>{' '}
        will return a script hash. This script hash can be use for building
        minting transaction with Plutus contract.
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
      const hash = resolvePlutusScriptHash(userinput);
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
          placeholder="Plutus script address"
          label="Plutus script address"
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
