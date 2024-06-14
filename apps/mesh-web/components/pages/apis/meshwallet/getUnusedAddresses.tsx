import { useState } from "react";
import Codeblock from "../../../ui/codeblock";
import Card from "../../../ui/card";
import RunDemoButton from "../../../common/runDemoButton";
import RunDemoResult from "../../../common/runDemoResult";
import SectionTwoCol from "../../../common/sectionTwoCol";
import { getMeshWallet } from "./common";

export default function GetUnusedAddresses() {
  return (
    <SectionTwoCol
      sidebarTo="getUnusedAddresses"
      header="Get Unused Addresses"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  "addr_test1qzk9x08mtre4jp8f7j8zu8802...r8c3grjmys7fl22c",\n`;
  example += `  "addr_test1qrmf35xyw2petfr0e0p4at0r7...8sc3grjmysm73dk8",\n`;
  example += `  "addr_test1qq6ts58hdaasd2q78fdjj0arm...i8c3grjmys85k8mf",\n`;
  example += `]\n`;
  return (
    <>
      <p>
        Returns a list of unused addresses controlled by the wallet. For
        example:
      </p>
      <Codeblock data={example} isJson={false} />
      <p>Options:</p>
      <ul>
        <li>
          <code>addressType</code> - "enterprise" | "base" = "base"
        </li>
      </ul>
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const wallet = getMeshWallet();
    let results = await wallet.getUnusedAddresses();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Unused Addresses
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get addresses that are unused
          </p>
        </div>
        <Codeblock
          data={`const unusedAddresses = await wallet.getUnusedAddresses();`}
          isJson={false}
        />
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
