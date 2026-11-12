import { mConStr0 } from "@meshsdk/common";
import { HexBlob, Serialization, TxCBOR } from "@meshsdk/core-cst";

import { MeshTxBuilder } from "../../src/mesh-tx-builder";
import { Transaction } from "../../src/transaction";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  rewardAddress,
  txHash,
} from "../test-util";

const inputCoin = 20_000_000n;
const decode = (hex: string) => Serialization.Transaction.fromCbor(TxCBOR(hex));

const fundedBuilder = () =>
  new MeshTxBuilder()
    .txIn(
      txHash("stake-certificates"),
      0,
      [{ unit: "lovelace", quantity: inputCoin.toString() }],
      baseAddress(0),
      0,
    )
    .changeAddress(baseAddress(0));

describe("deposit-bearing stake certificates", () => {
  it.each([
    ["registerStakeCertificate", 7, "RegistrationCertificate", 1n],
    ["deregisterStakeCertificate", 8, "UnRegistrationCertificate", -1n],
  ] as const)(
    "%s serializes and balances the stated amount",
    async (method, tag, typename, sign) => {
      const builder = fundedBuilder().protocolParams({
        keyDeposit: sign === 1n ? 2_000_000 : 3_000_000,
      });
      // The refund can differ from today's keyDeposit: it is the original deposit.
      builder[method](rewardAddress(1), 2_000_000);
      const tx = decode(await builder.complete());
      const cert = tx.body().certs()!.values()[0]!;
      expect(cert.toCbor().slice(0, 4)).toBe(`830${tag}`);
      expect(cert.toCore()).toMatchObject({
        __typename: typename,
        deposit: 2_000_000n,
      });
      const outputs = tx
        .body()
        .outputs()
        .reduce((sum, out) => sum + out.amount().coin(), 0n);
      expect(outputs + tx.body().fee() + sign * 2_000_000n).toBe(inputCoin);
      // The payment key and the distinct stake key both need witnesses.
      expect(
        decode(builder.serializeMockTx()).witnessSet().vkeys()!.values(),
      ).toHaveLength(2);
    },
  );

  it.each(["registerStakeCertificate", "deregisterStakeCertificate"] as const)(
    "%s resolves an omitted amount from protocol parameters at serialization",
    async (method) => {
      const builder = fundedBuilder();
      builder[method](rewardAddress(1));
      builder.protocolParams({ keyDeposit: 3_000_000 });
      const tx = decode(await builder.complete());
      const sign = method === "registerStakeCertificate" ? 1n : -1n;
      const outputs = tx
        .body()
        .outputs()
        .reduce((sum, out) => sum + out.amount().coin(), 0n);
      expect(outputs + tx.body().fee() + sign * 3_000_000n).toBe(inputCoin);
      expect(tx.body().certs()!.values()[0]!.toCore()).toMatchObject({
        deposit: 3_000_000n,
      });
    },
  );

  it.each(["registerStakeCertificate", "deregisterStakeCertificate"] as const)(
    "%s preserves an explicitly zero amount",
    (method) => {
      const builder = fundedBuilder();
      builder[method](rewardAddress(1), 0);
      expect(
        decode(builder.completeSync()).body().certs()!.values()[0]!.toCore(),
      ).toMatchObject({ deposit: 0n });
    },
  );

  it.each(["registerStakeCertificate", "deregisterStakeCertificate"] as const)(
    "%s includes native and Plutus V3 script witnesses",
    (method) => {
      const nativeCbor = "8200581c" + "aa".repeat(28);
      const nativeHash = Serialization.NativeScript.fromCbor(
        HexBlob(nativeCbor),
      ).hash();
      const builder = fundedBuilder();
      builder[method](
        builder.serializer.serializeRewardAddress(nativeHash, true),
      );
      builder.certificateScript(nativeCbor);
      builder[method](
        builder.serializer.serializeRewardAddress(alwaysSucceedHash, true),
      );
      builder
        .certificateScript(alwaysSucceedCbor, "V3")
        .certificateRedeemerValue(mConStr0([]));
      const tx = decode(builder.completeSync());
      expect(tx.body().certs()!.values()).toHaveLength(2);
      expect(tx.witnessSet().nativeScripts()!.values()).toHaveLength(1);
      expect(tx.witnessSet().plutusV3Scripts()!.values()).toHaveLength(1);
      const redeemer = tx.witnessSet().redeemers()!.values()[0]!;
      expect(redeemer.tag()).toBe(2); // Certifying
      expect(redeemer.index()).toBe(1n);
    },
  );

  it("Transaction forwards explicit deposits and refunds", () => {
    const tx = new Transaction({ initiator: {} as never });
    tx.registerStake(rewardAddress(1), 3_000_000).deregisterStake(
      rewardAddress(2),
      2_000_000,
    );
    const certs = decode(tx.txBuilder.completeSync()).body().certs()!.values();
    expect(certs.map((cert) => cert.toCore())).toMatchObject([
      { __typename: "RegistrationCertificate", deposit: 3_000_000n },
      { __typename: "UnRegistrationCertificate", deposit: 2_000_000n },
    ]);
  });
});
