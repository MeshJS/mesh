import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import { resolveDataHash } from '@martifylabs/mesh';
import type { Data } from '@martifylabs/mesh';

export default function ResolveDataHash() {
  return (
    <SectionTwoCol
      sidebarTo="resolveDataHash"
      header="Resolve DataHash"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>resolveDataHash</code> converts datum into hash. This is useful
        when you need to query for the UTXO that contain the assets you need for
        your transaction's input.
      </p>
      <Codeblock
        data={``}
        isJson={false}
      />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const datum: Data = "supersecret";
    const dataHash = resolveDataHash(datum);
    setResponse(dataHash);
    setLoading(false);
  }

  return (
    <>
      <Card>
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
      </Card>
    </>
  );
}
