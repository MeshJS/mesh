import { useState } from "react";
import JSONBig from "json-bigint";

import { useWallet } from "@meshsdk/react";

import RunDemoButton from "../button/run-demo-button";
import Card from "../card/card";
import BlockchainProviderKey from "../cardano/blockchain-providers-key";
import ConnectBrowserWallet from "../cardano/connect-browser-wallet";
import Codeblock from "../text/codeblock";
import DemoResult from "./demo-result";

export default function LiveCodeDemo({
  children,
  title,
  subtitle,
  code,
  runCodeFunction,
  disabled = false,
  childrenAfterCodeFunctions = false,
  runDemoButtonLabel = "Run code snippet",
  runDemoButtonTooltip,
  runDemoShowBrowseWalletConnect = false,
  runDemoShowProviderInit = false,
  runDemoProvider = undefined,
  hideDemoButtonIfnotConnected = false,
  hideConnectButtonIfConnected = false,
}: {
  children?: React.ReactNode;
  title: string;
  subtitle: string;
  code?: string;
  runCodeFunction?: () => void;
  disabled?: boolean;
  childrenAfterCodeFunctions?: boolean;
  runDemoButtonLabel?: string;
  runDemoButtonTooltip?: string;
  runDemoShowBrowseWalletConnect?: boolean;
  runDemoShowProviderInit?: boolean;
  runDemoProvider?: string | undefined;
  hideDemoButtonIfnotConnected?: boolean;
  hideConnectButtonIfConnected?: boolean;
}) {
  const { connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [demoResponse, setDemoResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function runDemo() {
    if (!runCodeFunction) return;
    setResponseError(null);
    setDemoResponse(null);
    setLoading(true);
    try {
      const response = await runCodeFunction();
      setDemoResponse(JSONBig.stringify(response, null, 2));
    } catch (error: any) {
      let message = `Error running code snippet`;
      if (error.message) {
        message = error.message;
      } else if (typeof error === "string") {
        if (error.substring(0, 1) === "{") {
          message = JSONBig.stringify(JSONBig.parse(error), null, 2);
        }
        message = error;
      }
      setResponseError(message);
    }
    setLoading(false);
  }

  return (
    <Card title={title} subtitle={subtitle}>
      {children && !childrenAfterCodeFunctions && (
        <div className="">{children}</div>
      )}

      {code && <Codeblock data={code} />}

      {runDemoShowProviderInit && runDemoProvider && (
        <BlockchainProviderKey provider={runDemoProvider} />
      )}

      {runCodeFunction && (connected || !hideDemoButtonIfnotConnected) && (
        <div>
          <RunDemoButton
            runFunction={runDemo}
            loading={loading}
            response={demoResponse}
            disabled={disabled}
            label={runDemoButtonLabel}
          />
          {runDemoButtonTooltip && (
            <p className="mt-0 text-sm text-gray-500 dark:text-gray-400">
              {runDemoButtonTooltip}
            </p>
          )}

          <DemoResult response={demoResponse} />
          <DemoResult response={responseError} label="Error" />
        </div>
      )}
      {runDemoShowBrowseWalletConnect &&
        (!connected || !hideConnectButtonIfConnected) && (
          <div>
            <ConnectBrowserWallet />
          </div>
        )}

      {children && childrenAfterCodeFunctions && (
        <div className="mb-4">{children}</div>
      )}
    </Card>
  );
}
