import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import {
  resolveNativeScriptHash,
  resolvePaymentKeyHash,
  resolveSlotNo,
} from '@meshsdk/core';
import Input from '../../../ui/input';
import type { NativeScript } from '@meshsdk/core';
import { demoAddresses } from '../../../../configs/demo';

export default function ResolveNativeScriptHash() {
  const [userinput, setUserinput] = useState<string>(demoAddresses.mainnet);
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
  let code1 = `import { resolveNativeScriptHash, resolvePaymentKeyHash, resolveSlotNo } from '@meshsdk/core';\n\n`;
  code1 += `const keyHash = resolvePaymentKeyHash('${userinput}');\n`;
  code1 += `\n`;
  code1 += `let oneYearFromNow = new Date();\n`;
  code1 += `oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);\n`;
  code1 += `const slot = resolveSlotNo('mainnet', oneYearFromNow.getTime());\n`;
  code1 += `\n`;
  code1 += `const nativeScript: NativeScript = {\n`;
  code1 += `  type: 'all',\n`;
  code1 += `  scripts: [\n`;
  code1 += `    {\n`;
  code1 += `      type: 'before',\n`;
  code1 += `      slot: slot,\n`;
  code1 += `    },\n`;
  code1 += `    {\n`;
  code1 += `      type: 'sig',\n`;
  code1 += `      keyHash: keyHash,\n`;
  code1 += `    },\n`;
  code1 += `  ],\n`;
  code1 += `};\n`;
  code1 += `\n`;
  code1 += `const hash = resolveNativeScriptHash(nativeScript);\n`;

  return (
    <>
      <p>
        Converts <code>NativeScript</code> into hash.
      </p>
      <Codeblock data={code1} isJson={false} />
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
      const keyHash = resolvePaymentKeyHash(userinput);

      let oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      const slot = resolveSlotNo('mainnet', oneYearFromNow.getTime());

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
