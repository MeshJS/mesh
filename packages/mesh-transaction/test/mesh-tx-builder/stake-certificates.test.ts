import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { OfflineFetcher, serializeRewardAddress } from "@meshsdk/core";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";

import { MeshTxBuilder } from "../../src";
import { calculateOutputLovelaces, keyHashHex, txHash } from "../test-util";

const ADDR =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];
const keyStake = serializeRewardAddress(keyHashHex(1));
const keyStake2 = serializeRewardAddress(keyHashHex(2));

const fetcher = new OfflineFetcher();
fetcher.addUTxOs([
  {
    input: { txHash: txHash("tx1"), outputIndex: 0 },
    output: { address: ADDR, amount: lovelace("10000000") },
  },
]);

/** What the inputs paid for: everything the transaction puts out plus its fee */
const spent = (txHex: string) =>
  calculateOutputLovelaces(txHex) +
  Transaction.fromCbor(TxCBOR(txHex)).body().fee();

describe("MeshTxBuilder - stake certificate deposits", () => {
  it("records the stated deposit on the certificate", () => {
    const txBuilder = new MeshTxBuilder()
      .registerStakeCertificate(keyStake, 3000000)
      .deregisterStakeCertificate(keyStake2, 2500000)
      .registerStakeCertificate(keyStake2);
    expect(
      txBuilder.meshTxBuilderBody.certificates.map((cert) => cert.certType),
    ).toEqual([
      { type: "RegisterStake", stakeKeyAddress: keyStake, coin: 3000000 },
      { type: "DeregisterStake", stakeKeyAddress: keyStake2, coin: 2500000 },
      { type: "RegisterStake", stakeKeyAddress: keyStake2 },
    ]);
  });

  it("takes the stated deposit out of the balance", async () => {
    const txHex = await new MeshTxBuilder({ fetcher, evaluator: null })
      .registerStakeCertificate(keyStake, 3000000)
      .txIn(txHash("tx1"), 0)
      .changeAddress(ADDR)
      .complete();
    expect(spent(txHex)).toBe(7000000n);
  });

  it("adds the stated refund to the balance", async () => {
    const txHex = await new MeshTxBuilder({ fetcher, evaluator: null })
      .deregisterStakeCertificate(keyStake, 3000000)
      .txIn(txHash("tx1"), 0)
      .changeAddress(ADDR)
      .complete();
    expect(spent(txHex)).toBe(13000000n);
  });

  it("falls back to the key deposit of the protocol parameters without a stated deposit", async () => {
    const txHex = await new MeshTxBuilder({ fetcher, evaluator: null })
      .registerStakeCertificate(keyStake)
      .txIn(txHash("tx1"), 0)
      .changeAddress(ADDR)
      .complete();
    expect(spent(txHex)).toBe(
      10000000n - BigInt(DEFAULT_PROTOCOL_PARAMETERS.keyDeposit),
    );
  });
});
