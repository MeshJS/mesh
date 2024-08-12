import { useState } from "react";

import { checkSignature, generateNonce } from "@meshsdk/core";
import { CardanoWallet, useWallet } from "@meshsdk/react";

import Button from "~/components/button/button";
import DemoResult from "~/components/sections/demo-result";

export default function Demo() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(undefined);

  async function runDemo() {
    if (!connected) return;

    setLoading(true);
    const nonce = generateNonce("Sign to login in to Mesh: ");
    const signature = await wallet.signData(nonce);

    const result = checkSignature(nonce, signature);
    setResponse(result.toString());
    setLoading(false);
  }

  return (
    <>
      <h2>Demo</h2>
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
