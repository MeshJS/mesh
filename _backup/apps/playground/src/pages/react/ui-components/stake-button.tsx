// import { useState } from "react";

// import { StakeButton } from "@meshsdk/react";

// import { getProvider } from "~/components/cardano/mesh-wallet";
// import Input from "~/components/form/input";
// import Link from "~/components/link";
// import InputTable from "~/components/sections/input-table";
// import LiveCodeDemo from "~/components/sections/live-code-demo";
// import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
// import Codeblock from "~/components/text/codeblock";
// import { demoPool } from "~/data/cardano";
// import { useDarkmode } from "~/hooks/useDarkmode";

// export default function ReactStakeButton() {
//   return (
//     <TwoColumnsScroll
//       sidebarTo="stakeButton"
//       title="Stake ADA Button"
//       leftSection={Left()}
//       rightSection={Right()}
//     />
//   );
// }

// function Left() {
//   const isDark = useDarkmode((state) => state.isDark);

//   let codeSignature = ``;
//   codeSignature += `{\n`;
//   codeSignature += `  poolId: string;\n`;
//   codeSignature += `  onCheck: (rewardAddress: string) => Promise<AccountInfo>;\n`;
//   codeSignature += `  label?: string;\n`;
//   codeSignature += `  isDark?: boolean;\n`;
//   codeSignature += `  onDelegated?: () => void;\n`;
//   codeSignature += `}\n`;

//   return (
//     <>
//       <p>
//         Delegation is the process by which ADA holders delegate the stake
//         associated with their ADA to a stake pool. It allows ADA holders to
//         participate in the network and be rewarded in proportion to the amount
//         of stake delegated.
//       </p>
//       <p>
//         Put this <code>StakeButton</code> on your website to allow anyone to
//         delegate their ADA to your stake pool.
//       </p>

//       <p>
//         The <code>StakeButton</code> component has the following signature:
//       </p>
//       <Codeblock data={codeSignature} />

//       <p>
//         Both <code>poolId</code> and <code>onCheck</code> are required props.{" "}
//         <code>onCheck</code> is a function that takes a reward address and
//         returns an account info object, which you may use{" "}
//         <code>fetchAccountInfo()</code> from one of the{" "}
//         <Link href="/providers">Providers</Link>.
//       </p>

//       <p>For dark mode style, add isDark.</p>
//       <Codeblock data={`<StakeButton isDark={${isDark}} />`} />

//       <p>For a custom label, add the label prop.</p>
//       <Codeblock data={`<StakeButton label={"Stake your ADA"} />`} />

//       <p>
//         If you want to run a function after the user has staked, add the{" "}
//         <code>onDelegated</code> prop. See code example.
//       </p>
//     </>
//   );
// }

// function Right() {
//   const [poolId, setPoolId] = useState<string>(demoPool);
//   const isDark = useDarkmode((state) => state.isDark);

//   let example = `import { StakeButton } from "@meshsdk/react";\n\n`;
//   example += `export default function Page() {\n`;
//   example += `  // import one of the providers https://meshjs.dev/providers\n`;
//   example += `  const provider = new Provider();\n\n`;
//   example += `  function userHasStaked() {\n`;
//   example += `    // do something after user has staked to the pool");\n`;
//   example += `  }\n\n`;
//   example += `  return (\n`;
//   example += `    <StakeButton\n`;
//   example += `      isDark={${isDark}}\n`;
//   example += `      onCheck={(address) => provider.fetchAccountInfo(address)}\n`;
//   example += `      poolId="${poolId}"\n`;
//   example += `      onDelegated={userHasStaked}\n`;
//   example += `      label={"Stake your ADA"}\n`;
//   example += `    />\n`;
//   example += `  )\n`;
//   example += `}\n`;

//   function userHasStaked() {
//     // do something after user has staked to the pool
//   }

//   const provider = getProvider();

//   return (
//     <LiveCodeDemo
//       title="Stake ADA Button UI Component"
//       subtitle="A UI component to allow users to delegate their ADA to a specific stake pool."
//       code={example}
//       childrenAfterCodeFunctions={true}
//     >
//       <InputTable
//         listInputs={[
//           <Input
//             value={poolId}
//             onChange={(e) => setPoolId(e.target.value)}
//             placeholder="Pool ID"
//             label="Pool ID"
//             key={0}
//           />,
//         ]}
//       />
//       <StakeButton
//         isDark={isDark}
//         poolId={poolId}
//         onCheck={(address) => provider.fetchAccountInfo(address)}
//         onDelegated={userHasStaked}
//         label={"Stake your ADA"}
//       />
//     </LiveCodeDemo>
//   );
// }

export default function ReactStakeButton() {
  return <></>;
}
