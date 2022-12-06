import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolvePrivateKey } from '@meshsdk/core';
import { demoMnemonic } from '../../../../configs/demo';
import Textarea from '../../../ui/textarea';

export default function ResolvePrivateKey() {
  const [userinput, setUserinput] = useState<string>(
    JSON.stringify(demoMnemonic, null, 2)
  );

  return (
    <SectionTwoCol
      sidebarTo="resolvePrivateKey"
      header="Resolve Private Key"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function Left(userinput) {
  let _mnemonic = JSON.stringify(demoMnemonic);
  try {
    _mnemonic = JSON.stringify(JSON.parse(userinput));
  } catch (e) {}

  let code = `import { resolvePrivateKey } from '@meshsdk/core';\nconst dataHash = resolvePrivateKey(${_mnemonic});`;

  return (
    <>
      <p>
        Provide the mnemonic phrases and <code>resolvePrivateKey</code> will
        return a private key.
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
    
    let _mnemonic = [];
    try {
      _mnemonic = JSON.parse(userinput);
    } catch (e) {
      setResponseError('Mnemonic input is not a valid array.');
    }

    try {
      const dataHash = resolvePrivateKey(_mnemonic);
      setResponse(dataHash);
    } catch (error) {
      setResponseError(`${error}`);
    }

    setLoading(false);
  }

  return (
    <>
      <Card>
        <Textarea
          value={userinput}
          onChange={(e) => setUserinput(e.target.value)}
          rows={8}
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
