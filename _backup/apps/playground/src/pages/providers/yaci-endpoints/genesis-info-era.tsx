import { useState } from "react";

import { YaciProvider } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function YacigetGenesisByEra({
  provider,
  providerName,
}: {
  provider: YaciProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="getGenesisByEra"
      title="Admin Get Genesis Info By Era"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  let code = JSON.stringify(
    {
      activeSlotsCoeff: 1,
      epochLength: 500,
      genDelegs: {
        "337bc5ef0f1abf205624555c13a37258c42b46b1259a6b1a6d82574e": {
          delegate: "41fd6bb31f34469320aa47cf6ccc3918e58a06d60ea1f2361efe2458",
          vrf: "7053e3ecd2b19db13e5338aa75fb518fc08b6c218f56ad65760d3eb074be95d4",
        },
      },
      initialFunds: {
        "60ba957a0fff6816021b2afa7900beea68fd10f2d78fb5b64de0d2379c": 3000000000000000,
        "007290ea8fa9433c1045a4c8473959ad608e6c03a58c7de33bdbd3ce6f295b987135610616f3c74e11c94d77b6ced5ccc93a7d719cfb135062": 300000000000,
        "605276322ac7882434173dcc6441905f6737689bd309b68ad8b3614fd8": 3000000000000000,
        "60a0f1aa7dca95017c11e7e373aebcf0c4568cf47ec12b94f8eb5bba8b": 3000000000000000,
        "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6": 1000000000,
      },
      maxKESEvolutions: 60,
      maxLovelaceSupply: 45000000000000000,
      networkId: "Testnet",
      networkMagic: 42,
      protocolParams: {
        a0: 0,
        decentralisationParam: 0,
        eMax: 18,
        extraEntropy: {
          tag: "NeutralNonce",
        },
        keyDeposit: 2000000,
        maxBlockBodySize: 65536,
        maxBlockHeaderSize: 1100,
        maxTxSize: 16384,
        minFeeA: 0,
        minFeeB: 0,
        minPoolCost: 340000000,
        minUTxOValue: 1000000,
        nOpt: 100,
        poolDeposit: 500000000,
        protocolVersion: {
          major: 8,
          minor: 0,
        },
        rho: 0.003,
        tau: 0.2,
      },
      securityParam: 300,
      slotLength: 1,
      slotsPerKESPeriod: 129600,
      staking: {
        pools: {
          "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57": {
            cost: 340000000,
            margin: 0,
            metadata: null,
            owners: [],
            pledge: 0,
            publicKey:
              "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
            relays: [],
            rewardAccount: {
              credential: {
                keyHash:
                  "11a14edf73b08a0a27cb98b2c57eb37c780df18fcfcf6785ed5df84a",
              },
              network: "Testnet",
            },
            vrf: "c2b62ffa92ad18ffc117ea3abeb161a68885000a466f9c71db5e4731d6630061",
          },
        },
        stake: {
          "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6":
            "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
        },
      },
      systemStart: "2024-10-30T05:11:07.442512Z",
      updateQuorum: 1,
    },
    null,
    2,
  );
  return (
    <>
      <p>
        You can topup ADA for any address. To topup ADA in your wallet, run the
        following command from devnet:
      </p>
      <Codeblock data={`await provider.getGenesisByEra(<era>)`} />

      <p>Example response:</p>
      <Codeblock data={code} />
    </>
  );
}

function Right(provider: YaciProvider, providerName: string) {
  const [userInput, setUserInput] = useState<string>("shelley");
  async function runDemo() {
    return await provider.getGenesisByEra(userInput);
  }

  let code = `await provider.getGenesisByEra('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Get Genesis Info By Era"
      subtitle="Admin function to get genesis info by era"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
      code={code}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="e.g. shelley"
            label="Era"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
