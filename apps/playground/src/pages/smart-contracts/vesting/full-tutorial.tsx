import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function VestingFullTutorial() {
  return (
    <TwoColumnsScroll
      sidebarTo="tutorial"
      title="Full Tutorial"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Vesting contract is a smart contract that locks up funds for a period of
        time and allows the beneficiary to withdraw the funds after the lockup period.
        Usually, vesting contract defines a beneficiary who can be different
        from the original owner.
      </p>

      <p>
        When a new employee joins an organization, they typically receive a
        promise of compensation to be disbursed after a specified duration of
        employment. This arrangement often involves the organization depositing
        the funds into a vesting contract, with the employee gaining access to
        the funds upon the completion of a predetermined lockup period. Through
        the utilization of vesting contracts, organizations establish a
        mechanism to encourage employee retention by linking financial rewards
        to tenure.
      </p>

      <h2>On-Chain code</h2>

      <p>
        First, we define the datum's shape, as this datum serves as
        configuration and contains the different parameters of our vesting
        operation.
      </p>

      <Codeblock
        data={`pub type VestingDatum {
  /// POSIX time in milliseconds, e.g. 1672843961000
  lock_until: Int,
  /// Owner's credentials
  owner: ByteArray,
  /// Beneficiary's credentials
  beneficiary: ByteArray,
}
`}
      />

      <p>
        In this example, we define a `VestingDatum` that contains the following
        fields:
      </p>

      <ul>
        <li>
          `lock_until`: The POSIX timestamp in milliseconds until which the
          funds are locked.
        </li>
        <li>
          `owner`: The credentials (public key hash) of the owner of the funds.
        </li>
        <li>
          `beneficiary`: The credentials (public key hash) of the beneficiary of
          the funds.
        </li>
      </ul>

      <p>
        This datum can be found in
        `aiken-vesting/aiken-workspace/lib/vesting/types.ak`.
      </p>

      <p>Next, we define the spend validator.</p>

      <Codeblock
        data={`use aiken/transaction.{ScriptContext, Spend}
use vesting/types.{VestingDatum}
use vodka_extra_signatories.{key_signed}
use vodka_validity_range.{valid_after}

validator {
  pub fn vesting(datum: VestingDatum, _redeemer: Data, ctx: ScriptContext) {
    // In principle, scripts can be used for different purpose (e.g. minting
    // assets). Here we make sure it's only used when 'spending' from a eUTxO
    when ctx.purpose is {
      Spend(_) -> or {
          key_signed(ctx.transaction.extra_signatories, datum.owner),
          and {
            key_signed(ctx.transaction.extra_signatories, datum.beneficiary),
            valid_after(ctx.transaction.validity_range, datum.lock_until),
          },
        }
      _ -> False
    }
  }
}
`}
      />

      <p>
        In this example, we define a `vesting` validator that ensures the
        following conditions are met:
      </p>

      <ul>
        <li>The transaction must be signed by owner</li>
      </ul>
      <p>Or:</p>
      <ul>
        <li>The transaction must be signed by beneficiary</li>
        <li>The transaction must be valid after the lockup period</li>
      </ul>

      <p>
        This validator can be found in
        `aiken-vesting/aiken-workspace/validators/vesting.ak`.
      </p>

      <h3>How it works</h3>

      <p>
        The owner of the funds deposits the funds into the vesting contract. The
        funds are locked up until the lockup period expires.
      </p>

      <p>
        Transactions can include validity intervals that specify when the
        transaction is valid, both from and until a certain time. The ledger
        verifies these validity bounds before executing a script and will only
        proceed if they are legitimate.
      </p>

      <p>
        This approach allows scripts to incorporate a sense of time while
        maintaining determinism within the script's context. For instance, if a
        transaction has a lower bound `A`, we can infer that the current time is
        at least `A`.
      </p>

      <p>
        It's important to note that since we don't control the upper bound, a
        transaction might be executed even 30 years after the vesting delay.
        However, from the script's perspective, this is entirely acceptable.
      </p>

      <p>
        The beneficiary can withdraw the funds after the lockup period expires.
        The beneficiary can also be different from the owner of the funds.
      </p>

      <h2>Testing</h2>

      <p>
        To test the vesting contract, we have provided the a comphrehensive test
        script,you can run tests with `aiken check`.
      </p>

      <p>The test script includes the following test cases:</p>

      <ul>
        <li>success unlocking</li>
        <li>success unlocking with only owner signature</li>
        <li>success unlocking with beneficiary signature and time passed</li>
        <li>fail unlocking with only beneficiary signature</li>
        <li>fail unlocking with only time passed</li>
      </ul>

      <p>
        We recommend you to check out
        `aiken-vesting/aiken-workspace/validators/tests/vesting.ak` to learn
        more.
      </p>

      <h2>Compile and build script</h2>

      <p>To compile the script, run the following command:</p>

      <Codeblock
        data={`aiken build
`}
      />

      <p>
        This command will generate a CIP-0057 Plutus blueprint, which you can
        find in `aiken-vesting/aiken-workspace/plutus.json`.
      </p>

      <h2>Off-Chain code</h2>

      <h3>Deposit funds</h3>

      <p>
        First, the owner can deposit funds into the vesting contract. The owner
        can specify the lockup period and the beneficiary of the funds.
      </p>

      <Codeblock
        data={`const assets: Asset[] = [
  {
    unit: "lovelace",
    quantity: "10000000",
  },
];

const lockUntilTimeStamp = new Date();
lockUntilTimeStamp.setMinutes(lockUntilTimeStamp.getMinutes() + 1);

const beneficiary =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
`}
      />

      <p>
        In this example, we deposit 10 ADA into the vesting contract. The funds
        are locked up for 1 minute, and the beneficiary is specified.
      </p>

      <p>
        Then, we prepare a few variables to be used in the transaction. We get
        the wallet address and the UTXOs of the wallet. We also get the script
        address of the vesting contract, to send the funds to the script
        address. We also get the owner and beneficiary public key hashes.
      </p>

      <Codeblock
        data={`const { utxos, walletAddress } = await getWalletInfoForTx();

const { scriptAddr } = getScript();

const { pubKeyHash: ownerPubKeyHash } = deserializeAddress(walletAddress);
const { pubKeyHash: beneficiaryPubKeyHash } = deserializeAddress(beneficiary);
`}
      />

      <p>
        Next, we construct the transaction to deposit the funds into the vesting
        contract.
      </p>

      <Codeblock
        data={`const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
});

await txBuilder
  .txOut(scriptAddr, amount)
  .txOutInlineDatumValue(
    mConStr0([lockUntilTimeStampMs, ownerPubKeyHash, beneficiaryPubKeyHash])
  )
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

const unsignedTx = txBuilder.txHex;
`}
      />

      <p>
        In this example, we construct the transaction to deposit the funds into
        the vesting contract. We specify the script address of the vesting
        contract, the amount to deposit, and the lockup period, owner, and
        beneficiary of the funds.
      </p>

      <p>Finally, we sign and submit the transaction.</p>

      <Codeblock
        data={`const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);
`}
      />

      <p>
        To execute this code, ensure you have defined blockfrost key in the
        `.env` file. You can also define your wallet mnemonic in
        `aiken-vesting/src/configs.ts` file.
      </p>

      <p>You can run the following command execute the deposit funds code:</p>

      <Codeblock
        data={`npm run deposit
`}
      />

      <p>
        Upon successful execution, you will receive a transaction hash. Save
        this transaction hash for withdrawing the funds.
      </p>

      <p>
        Example of a{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/ede9f8176fe41f0c84cfc9802b693dedb5500c0cbe4377b7bb0d57cf0435200b">
          successful deposit transaction
        </Link>
        .
      </p>

      <h3>Withdraw funds</h3>

      <p>
        After the lockup period expires, the beneficiary can withdraw the funds
        from the vesting contract. The owner can also withdraw the funds from
        the vesting contract.
      </p>

      <p>
        First, let's look for the UTxOs containing the funds locked in the
        vesting contract.
      </p>

      <Codeblock
        data={`const txHashFromDesposit =
  "ede9f8176fe41f0c84cfc9802b693dedb5500c0cbe4377b7bb0d57cf0435200b";
const utxos = await provider.fetchUTxOs(txHash);
const vestingUtxo = utxos[0];
`}
      />

      <p>
        In this example, we fetch the UTxOs containing the funds locked in the
        vesting contract. We specify the transaction hash of the deposit
        transaction.
      </p>

      <p>
        Like before, we prepare a few variables to be used in the transaction.
        We get the wallet address and the UTXOs of the wallet. We also get the
        script address of the vesting contract, to send the funds to the script
        address. We also get the owner and beneficiary public key hashes.
      </p>

      <Codeblock
        data={`const { utxos, walletAddress, collateral } = await getWalletInfoForTx();
const { input: collateralInput, output: collateralOutput } = collateral;

const { scriptAddr, scriptCbor } = getScript();
const { pubKeyHash } = deserializeAddress(walletAddress);
`}
      />

      <p>
        Next, we prepare the datum and the slot number to set the transaction
        valid interval to be valid only after the slot.
      </p>

      <Codeblock
        data={`const datum = deserializeDatum<VestingDatum>(vestingUtxo.output.plutusData!);

const invalidBefore =
  unixTimeToEnclosingSlot(
    Math.min(datum.fields[0].int as number, Date.now() - 15000),
    SLOT_CONFIG_NETWORK.preprod
  ) + 1;
`}
      />

      <p>
        In this example, we prepare the datum and the slot number to set the
        transaction valid interval to be valid only after the slot. We get the
        lockup period from the datum and set the transaction valid interval to
        be valid only after the lockup period.
      </p>

      <p>
        Next, we construct the transaction to withdraw the funds from the
        vesting contract.
      </p>

      <Codeblock
        data={`const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
});

await txBuilder
  .spendingPlutusScriptV2()
  .txIn(
    vestingUtxo.input.txHash,
    vestingUtxo.input.outputIndex,
    vestingUtxo.output.amount,
    scriptAddr
  )
  .spendingReferenceTxInInlineDatumPresent()
  .spendingReferenceTxInRedeemerValue("")
  .txInScript(scriptCbor)
  .txOut(walletAddress, [])
  .txInCollateral(
    collateralInput.txHash,
    collateralInput.outputIndex,
    collateralOutput.amount,
    collateralOutput.address
  )
  .invalidBefore(invalidBefore)
  .requiredSignerHash(pubKeyHash)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

const unsignedTx = txBuilder.txHex;
`}
      />

      <p>
        In this example, we construct the transaction to withdraw the funds from
        the vesting contract. We specify the UTxO containing the funds locked in
        the vesting contract, the script address of the vesting contract, the
        wallet address to send the funds to, and the transaction valid interval.
      </p>

      <p>
        Finally, we sign and submit the transaction. Notice that since we are
        unlocking fund from validator, partial sign has to be specified by
        passing a `true` parameter into `wallet.signTx`.
      </p>

      <Codeblock
        data={`const signedTx = await wallet.signTx(unsignedTx, true);
const txHash = await wallet.submitTx(signedTx);
`}
      />

      <p>
        To execute this code, update `aiken-vesting/src/withdraw-fund.ts` with
        the transaction hash from the deposit transaction. Ensure you have
        defined blockfrost key in the `.env` file. You can also define your
        wallet mnemonic in `aiken-vesting/src/configs.ts` file.
      </p>

      <p>Run the following command:</p>

      <Codeblock
        data={`npm run withdraw
`}
      />

      <p>
        Example of a{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/b108f91a1dcd1b4c0bc978fb7557fc23ad052f1681cca078aa2515f8ab01e05e">
          successful withdraw transaction
        </Link>
        .
      </p>
    </>
  );
}
