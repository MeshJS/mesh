import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";

export default function YaciCommands() {
  return (
    <TwoColumnsScroll
      sidebarTo="commands"
      title="Useful commands"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Here are some useful commands to interact with the Yaci DevKit.</p>

      <h3>Topup ADA</h3>

      <p>
        After you have started your devnet, you can topup ADA in your wallet. To
        topup ADA in your wallet, run the following command from devnet:
      </p>
      <Codeblock data={`devnet:default>topup <address> <amount>`} />
      <p>For example:</p>
      <Codeblock
        data={`devnet:default>topup ${demoAddresses.testnetPayment} 1000`}
      />

      <h3>Check UTXO</h3>
      <p>
        To check the UTXO of an address, run the following command from devnet:
      </p>
      <Codeblock data={`devnet:default>utxos <address>`} />
      <p>For example:</p>
      <Codeblock
        data={`devnet:default>utxos ${demoAddresses.testnetPayment}`}
      />

      <h3>Default address info</h3>
      <p>You can get the default addresses of the devnet by running:</p>
      <Codeblock data={`devnet:default> default-addresses`} />
      <p>By default, wallet mnemonic is</p>
      <Codeblock
        data={`test test test test test test test test test test test test test test test test test test test test test test test sauce`}
      />
      <p>And it's address is </p>
      <Codeblock
        data={`addr_test1qryvgass5dsrf2kxl3vgfz76uhp83kv5lagzcp29tcana68ca5aqa6swlq6llfamln09tal7n5kvt4275ckwedpt4v7q48uhex`}
      />
      
      <h3>Stop Devnet and yaci-cli</h3>

      <p>To stop the devnet, run the following command from devnet:</p>
      <Codeblock data={`devnet:default>exit`} />

      <p>To stop yaci-cli, run the following command:</p>
      <Codeblock data={`yaci-cli:>exit`} />

      <p>
        To stop the DevKit containers, run the following command from the Yaci
        DevKit root directory:
      </p>
      <Codeblock data={`./bin/devkit.sh stop`} />

      <p>
        Sometimes you just want to reset the devnet and start from scratch. To
        do that, run:
      </p>
      <Codeblock data={`devnet:default>reset`} />
    </>
  );
}
