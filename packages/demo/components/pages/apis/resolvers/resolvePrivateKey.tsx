import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import { resolvePrivateKey } from '@martifylabs/mesh';
import type { Data } from '@martifylabs/mesh';
import { demoMnemonic } from '../../../../configs/demo';
import Textarea from '../../../ui/textarea';

export default function ResolvePrivateKey() {
  const [userinput, setUserinput] = useState<string>(
    JSON.stringify(demoMnemonic, null, 2)
  );

  return (
    <SectionTwoCol
      sidebarTo="resolvePrivateKey"
      header="Resolve DataHash"
      leftFn={Left(userinput)}
      rightFn={Right(userinput, setUserinput)}
    />
  );
}

function Left(userinput) {
  return (
    <>
      <p>
        Provide the mnemonic phrases and <code>resolvePrivateKey</code> will
        return a bech32 private key.
      </p>
      <Codeblock data={``} isJson={false} />
    </>
  );
}

function Right(userinput, setUserinput) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);

    const datum: Data = 'supersecret';

    const dataHash = resolvePrivateKey(datum);

    setResponse(dataHash);
    setLoading(false);
  }

  return (
    <>
      <Card>
        <InputTable userinput={userinput} setUserinput={setUserinput} />
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

function InputTable({ userinput, setUserinput }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Mnemonic phrases
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400"></p>
        </caption>
        <tbody>
          <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
            <td>
              <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                Mnemonic phrases
              </label>
              <Textarea
                value={userinput}
                onChange={(e) => setUserinput(e.target.value)}
                rows={8}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
