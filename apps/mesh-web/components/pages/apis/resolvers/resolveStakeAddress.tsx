import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { resolveRewardAddress } from '@meshsdk/core';
import Input from '../../../ui/input';

export default function ResolveStakeAddress() {
  const [userinput, setUserinput] = useState<string>(
    'addr_test1qzl2r3fpmav0fmh0vrry0e0tmzxxqwv32sylnlty2jj8dwg636sfudakhsh65qggs4ttjjsk8fuu3fkd65uaxcxv0tfqv3z0y3'
  );

  return (
    <SectionTwoCol
      sidebarTo="resolveStakeAddress"
      header="Resolve Stake Address"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function Left(userinput) {
  let code = `import { resolveRewardAddress } from '@meshsdk/core';\nconst rewardAddress = resolveRewardAddress('${userinput}');`;

  return (
    <>
      <p>
        Provide a wallet address, and <code>resolveRewardAddress</code> will
        return a staking address in bech32 format.
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
      const rewardAddress = resolveRewardAddress(userinput);
      setResponse(rewardAddress);
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
