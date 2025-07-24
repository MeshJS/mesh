import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetDRep() {
  return (
    <TwoColumnsScroll
      sidebarTo="getDRep"
      title="Get DRep"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSample = ``;
  codeSample += `{
`;
  codeSample += `  "publicKey": "6984e406dd81...39e43d798fe1a89ab",
`;
  codeSample += `  "publicKeyHash": "9f7f4b78...df83bd227e943e9808450",
`;
  codeSample += `  "dRepIDCip105": "drep1vz0h7jmc...0axqgg5q4dls5u"
`;
  codeSample += `}
`;

  return (
    <>
      <p>
        The DRep ID is a unique identifier for the user&apos;s wallet. It
        consists of three components:
      </p>
      <ul>
        <li>
          <code>publicKey</code>: The public key associated with the wallet.
        </li>
        <li>
          <code>publicKeyHash</code>: A hash of the public key for verification
          purposes.
        </li>
        <li>
          <code>dRepIDCip105</code>: The bech32 encoding of the DRep ID.
        </li>
      </ul>
      <p>Example response:</p>
      <Codeblock data={codeSample} />
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = wallet.getDRep();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get DRep ID Key"
      subtitle="Get the key, hash, and bech32 address of the DRep ID"
      code={`await wallet.getDRep();`}
      runCodeFunction={runDemo}
    />
  );
}
