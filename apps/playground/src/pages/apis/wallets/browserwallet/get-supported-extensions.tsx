import { useEffect, useState } from "react";

import { BrowserWallet } from "@meshsdk/core";
import { useWalletList } from "@meshsdk/react";

import Select from "~/components/form/select";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function BrowserWalletGetSupportedExtensions() {
  return (
    <TwoColumnsScroll
      sidebarTo="getSupportedExtensions"
      title="Get Supported Extensions"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>getSupportedExtensions</code> is a static function that returns a
        list of CIPs that are supported by a wallet. You can query this function
        without connecting to a wallet, by providing the wallet name.
      </p>
      <p>
        You can get the list of wallet on user's device with{" "}
        <code>await BrowserWallet.getAvailableWallets()</code>.
      </p>
    </>
  );
}

function Right() {
  const wallets = useWalletList();
  const [selectedWallet, setSelectedWallet] = useState<string>("");

  async function runDemo() {
    let results = BrowserWallet.getSupportedExtensions(selectedWallet);
    return results;
  }

  useEffect(() => {
    if (wallets.length > 0) {
      setSelectedWallet(wallets[0]!.id);
    }
  }, [wallets]);

  return (
    <LiveCodeDemo
      title="Get Supported Extensions"
      subtitle="Get a list of CIPs that are supported by a wallet"
      code={`await wallet.getSupportedExtensions('${selectedWallet}');`}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Select
            id="chooseWallet"
            options={
              wallets.length > 0
                ? wallets.reduce(
                    (acc, wallet) => {
                      acc[wallet.id] = wallet.name;
                      return acc;
                    },
                    {} as { [key: string]: string },
                  )
                : {}
            }
            value={selectedWallet}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedWallet(e.target.value)
            }
            label="Select wallet"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
