import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolveEpochNo } from '@meshsdk/core';
import Select from '../../../ui/select';

export default function ResolveEpochNo() {
  const [userinput, setUserinput] = useState<string>('mainnet');

  return (
    <SectionTwoCol
      sidebarTo="resolveEpochNo"
      header="Resolve Epoch Number"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function Left(userinput) {
  let code1 = `import { resolveEpochNo } from '@meshsdk/core';\n`;

  let code2 = `${code1}const epoch = resolveEpochNo('${userinput}');`;

  let code3 = `${code1}`;
  code3 += `let oneYearFromNow = new Date();\n`;
  code3 += `oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);\n`;
  code3 += `const epoch = resolveEpochNo('${userinput}', oneYearFromNow.getTime());`;

  return (
    <>
      <p>
        With <code>resolveEpochNo</code>, you can get the current epoch with:
      </p>
      <Codeblock data={code2} isJson={false} />
      <p>
        You can also provide date in <code>milliseconds</code> to get epoch in
        the past or the future. For example, get the epoch 1 year from now:
      </p>
      <Codeblock data={code3} isJson={false} />
    </>
  );
}

function Right(userinput, setUserinput) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  const networks = {
    mainnet: 'Mainnet',
    preprod: 'Preprod',
    preview: 'Preview',
    testnet: 'Testnet',
  };

  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    // let oneYearFromNow = new Date();
    // oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    // const epoch = resolveEpochNo('mainnet', oneYearFromNow.getTime());

    try {
      const epoch = resolveEpochNo(userinput);
      setResponse(epoch);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <>
      <Card>
        <Select
          id="resolveEpochNoNetwork"
          options={networks}
          value={userinput}
          onChange={(e) => setUserinput(e.target.value)}
          label="Select network"
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
