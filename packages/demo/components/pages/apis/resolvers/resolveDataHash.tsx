import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolveDataHash } from '@meshsdk/core';
import type { Data } from '@meshsdk/core';
import Input from '../../../ui/input';
import Link from 'next/link';

export default function ResolveDataHash() {
  const [userinput, setUserinput] = useState<string>('supersecretdatum');
  return (
    <SectionTwoCol
      sidebarTo="resolveDataHash"
      header="Resolve DataHash"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function isNumeric(value) {
  return /^\d+$/.test(value);
}

function Left(userinput) {
  if (isNumeric(userinput)) {
    userinput = parseInt(userinput);
  }
  let code1 = '';
  code1 += `import { resolveDataHash } from '@meshsdk/core';\n`;
  code1 += `import type { Data } from '@meshsdk/core';\n`;
  code1 += `const datum: Data = ${
    isNumeric(userinput) ? userinput : `'${userinput}'`
  };\n`;
  code1 += `const dataHash = resolveDataHash(datum);\n`;

  return (
    <>
      <p>
        <code>resolveDataHash</code> converts datum into hash. Getting the hash
        is useful when you need to query for the UTXO that contain the assets
        you need for your transaction's input.
      </p>
      <p>
        Explore <Link href="/apis/transaction">Transaction</Link> to learn more
        about designing Datum, and learn how to query for UTXOs containing the
        datum hash.
      </p>
      <Codeblock data={code1} isJson={false} />
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
      if (isNumeric(userinput)) {
        userinput = parseInt(userinput);
      }
      const datum: Data = userinput;
      const dataHash = resolveDataHash(datum);
      setResponse(dataHash);
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
          placeholder="Datum"
          label="Datum"
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
