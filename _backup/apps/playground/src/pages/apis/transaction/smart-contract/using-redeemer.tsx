import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ContractUsingRedeemer() {
  return (
    <TwoColumnsScroll
      sidebarTo="redeemer"
      title="Using Redeemer"
      leftSection={Left()}
    />
  );
}

function Left() {
  // haskell redeemer type
  let haskellRedeemer = "-- The Redeemer data type in Plutus\n";
  haskellRedeemer +=
    "data MyRedeemer = StartRedeemer PaymentPubKeyHash | SecondRedeemer | EndRedeemer\n";
  haskellRedeemer +=
    "PlutusTx.makeIsDataIndexed ''MyRedeemer [('StartRedeemer,0),('SecondRedeemer,1),('EndRedeemer,2)]";

  // 1st redeemer
  let firstRedeemer = "";
  firstRedeemer += "const addresses = await wallet.getUsedAddresses();\n";
  firstRedeemer += "const pkh = resolvePaymentKeyHash(addresses[0]);\n";
  firstRedeemer += "const redeemer = {\n";
  firstRedeemer += "  data: { alternative: 0, fields: [pkh]},\n";
  firstRedeemer += "};\n";

  // 2nd redeemer
  let secondRedeemer = "const redeemer = {\n";
  secondRedeemer += "  data: { alternative: 1, fields: []},\n";
  secondRedeemer += "};\n";

  // 3rd redeemer
  let thirdRedeemer = "const redeemer = {\n";
  thirdRedeemer += "  data: { alternative: 2, fields: []},\n";
  thirdRedeemer += "};\n";

  let txWithRedeemer = "const tx = new Transaction({ initiator: wallet })\n";
  txWithRedeemer += `  .redeemValue(\n`;
  txWithRedeemer += `    '4e4d01000033222220051200120011',\n`;
  txWithRedeemer += `    assetUtxo,\n`;
  txWithRedeemer += `    { datum: 'supersecret', redeemer: redeemer }\n`;
  txWithRedeemer += `  )\n`;
  txWithRedeemer += "  .sendValue(address, assetUtxo)\n";
  txWithRedeemer += "  .setRequiredSigners([address]);";

  return (
    <>
      <p>
        For redeemers in Mesh, you use the type <code>Action</code> and you only
        supply the <code>Data</code> part to construct it.
      </p>

      <Codeblock
        data={`import { resolvePaymentKeyHash } from '@meshsdk/core';\nimport type { Data } from '@meshsdk/core';`}
        isJson={false}
      />
      <Codeblock data={haskellRedeemer} isJson={false} language="language-hs" />
      <h3>Designing Redeemer</h3>
      <p>
        Similarly to the datum, there is freedom in design to suit any smart
        contract, but the redeemer needs to be supplied a little differently.
      </p>
      <p>
        In this example, we represent a redeemer which matches the{" "}
        <code>StartRedeemer</code>
        as defined above with the first <code>Used Address</code> as input:
      </p>
      <Codeblock data={firstRedeemer} />
      <p>
        Supplying the <code>SecondRedeemer</code> as defined above:
      </p>
      <Codeblock data={secondRedeemer} />
      <p>
        Supplying the <code>EndRedeemer</code> as defined above:
      </p>
      <Codeblock data={thirdRedeemer} />
      <h3>Transaction construction</h3>
      <p>
        Within the transaction, we can include the redeemer within{" "}
        <code>redeemValue</code>:
      </p>
      <Codeblock data={txWithRedeemer} />
    </>
  );
}
