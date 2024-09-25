import { useState } from "react";

import { resolveSlotNo } from "@meshsdk/core";

import Select from "~/components/form/select";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ResolveSlotNumber() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveSlotNumber"
      title="Resolve Slot Number"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `import { resolveSlotNo } from '@meshsdk/core';\n`;

  let code2 = `${code1}const slot = resolveSlotNo('preprod');`;

  let code3 = `${code1}`;
  code3 += `let oneYearFromNow = new Date();\n`;
  code3 += `oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);\n`;
  code3 += `const slot = resolveSlotNo('preprod', oneYearFromNow.getTime());`;

  return (
    <>
      <>
        <p>
          With <code>resolveSlotNo</code>, you can get the current slot number
          with:
        </p>
        <Codeblock data={code2} />
        <p>
          You can also provide date in <code>milliseconds</code> to get slots in
          the past or the future. For example, get the slot number 1 year from
          now:
        </p>
        <Codeblock data={code3} />
      </>
    </>
  );
}

function Right() {
  return (
    <>
      <Right1 />
      <Right2 />
    </>
  );
}

function Right1() {
  const [userInput, setUserInput] = useState<
    "preprod" | "testnet" | "preview" | "mainnet"
  >("preprod");

  async function runDemo() {
    return resolveSlotNo(userInput);
  }

  let codeSnippet = `resolveSlotNo('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Resolve Slot number"
      subtitle="Get the Slot number for the network"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Select
            id="chooseNetwork"
            options={{
              preprod: "preprod",
              testnet: "testnet",
              preview: "preview",
              mainnet: "mainnet",
            }}
            value={userInput}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setUserInput(
                e.target.value as "preprod" | "testnet" | "preview" | "mainnet",
              )
            }
            label="Select network"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}

function Right2() {
  const [userInput, setUserInput] = useState<
    "preprod" | "testnet" | "preview" | "mainnet"
  >("preprod");

  async function runDemo() {
    let oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    return resolveSlotNo(userInput, oneYearFromNow.getTime());
  }

  let codeSnippet = ``;
  codeSnippet += `let oneYearFromNow = new Date()\n`;
  codeSnippet += `oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);\n`;
  codeSnippet += `resolveSlotNo(userInput, oneYearFromNow.getTime());\n`;

  return (
    <LiveCodeDemo
      title="Resolve Slot number 1 year from now"
      subtitle="Get the Slot number for the network 1 year from now"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Select
            id="chooseNetwork"
            options={{
              preprod: "preprod",
              testnet: "testnet",
              preview: "preview",
              mainnet: "mainnet",
            }}
            value={userInput}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setUserInput(
                e.target.value as "preprod" | "testnet" | "preview" | "mainnet",
              )
            }
            label="Select network"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}



// function Right() {
//   const [userInput, setUserInput] = useState<
//     "preprod" | "testnet" | "preview" | "mainnet"
//   >("preprod");

//   async function runDemo() {
//     const slot = resolveSlotNo(userInput);
//     return slot;
//   }

//   let codeSnippet = `resolveSlotNo('${userInput}');`;

//   return (
//     <LiveCodeDemo
//       title="Resolve Slot Number"
//       subtitle="Get the slot number for the network"
//       code={codeSnippet}
//       runCodeFunction={runDemo}
//     >
//       <InputTable
//         listInputs={[
//           <Select
//             id="chooseNetwork"
//             options={{
//               preprod: "preprod",
//               testnet: "testnet",
//               preview: "preview",
//               mainnet: "mainnet",
//             }}
//             value={userInput}
//             onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
//               setUserInput(
//                 e.target.value as "preprod" | "testnet" | "preview" | "mainnet",
//               )
//             }
//             label="Select network"
//             key={1}
//           />,
//         ]}
//       />
//     </LiveCodeDemo>
//   );
// }
