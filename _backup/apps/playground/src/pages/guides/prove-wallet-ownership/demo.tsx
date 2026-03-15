import { useState } from "react";

import { checkSignature, generateNonce } from "@meshsdk/core";
import { CardanoWallet, useWallet } from "@meshsdk/react";

import Button from "~/components/button/button";
import DemoResult from "~/components/sections/demo-result";
import Codeblock from "~/components/text/codeblock";

export default function Demo() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(undefined);

  async function runDemo() {
    if (!connected) return;

    setLoading(true);
    const nonce = generateNonce("Sign to login in to Mesh: ");
    const address = (await wallet.getUsedAddresses())[0];
    const signature = await wallet.signData(nonce, address);

    const result = checkSignature(nonce, signature, address);
    setResponse(result.toString());
    setLoading(false);
  }

  let code = ``;
  code += `import { checkSignature, generateNonce } from "@meshsdk/core";\n`;
  code += `\n`;
  code += `const nonce = generateNonce("Sign to login in to Mesh: ");\n`;
  code += `\n`;
  code += `const address = (await wallet.getUsedAddresses())[0];\n`;
  code += `const signature = await wallet.signData(nonce, address);\n`;
  code += `\n`;
  code += `const result = checkSignature(nonce, signature, address);\n`;

  return (
    <>
      <Codeblock data={code} />
      <p>Connect your wallet and click on the button to sign a message.</p>
      <CardanoWallet />
      <Button
        onClick={() => runDemo()}
        style={loading ? "warning" : "light"}
        disabled={loading || !connected}
      >
        Sign Message
      </Button>
      <DemoResult response={response} />
    </>
  );
}
