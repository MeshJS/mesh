import { useState } from "react";

import { serializeRewardAddress } from "@meshsdk/core";

import Input from "~/components/form/input";
import Select from "~/components/form/select";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPubKeyHash } from "~/data/cardano";

export default function SerializeRewardAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="serializeRewardAddress"
      title="Serialize Reward Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Serialize a script hash or key hash into bech32 reward address.</p>
      <p>
         The function <code>serializeRewardAddress</code> allows you to provide either the <code>scriptHash</code>{" "}
         or <code>pubKeyHash</code>, specifying <code>isScriptHash</code> as true if a <code>scriptHash</code> {" "}
         was provided and false {" "} if a <code>pubKeyHash</code> was provided. Additionally, you can specify the <code>networkId</code> {" "}
         The function returns:
         <ul>
          <li>
          Bech32 reward address
          </li>
         </ul>
         This example demonstrates how to serialize a <code>pubKeyHash</code> or <code>scriptHash</code> into a Bech32 reward address.
      </p>
    </>
  );
};

function Right() {
  const [userInput, setUserInput] = useState(demoPubKeyHash)
  const [isScriptHash, setIsScriptHash] = useState(true);
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");

  async function runDemo() {
    return serializeRewardAddress(userInput, isScriptHash, network === "testnet" ? 0 : 1);
  }

  let codeSnippet = `serializeRewardAddress('${userInput}', ${isScriptHash === true ? 'true': 'false'}, ${network === "testnet" ? 0 : 1});`;

  return (
    <LiveCodeDemo
      title="Serialize Reward Address"
      subtitle="Serialize a script hash or key hash into bech32 reward address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Script Hash/Key Hash"
            key={0}
          />,
          <Select
          id="chooseIsScriptHash"
          options={{
            'true': 'true',
            'false': 'false', 
          }}
          value={isScriptHash === true ? 'true': 'false'}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setIsScriptHash(
              e.target.value === 'true' ? true : false,
            )
          }
          label="Is Script Hash"
          key={1}
        />,
        <Select
            id="chooseNetwork"
            options={{
              testnet: "testnet",
              mainnet: "mainnet",
            }}
            value={userInput}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setNetwork(
                e.target.value as  "testnet" | "mainnet",
              )
            }
            label="Select network"
            key={2}
          />,
        ]}
      />

    </LiveCodeDemo>
  );
}
