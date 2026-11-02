import { Cardano } from "@cardano-sdk/core";

import {
  MeshTxBuilder,
  OfflineFetcher,
  serializeRewardAddress,
} from "@meshsdk/core";

import {
  blake2b,
  CardanoSDKSerializer,
  CredentialType,
  Transaction,
  TxCBOR,
} from "../src";

const ADDR =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const txHash = (seed: string): string =>
  blake2b.hash(Buffer.from(seed, "utf-8"), 32);
const keyHashHex = (i: number): string =>
  Buffer.from(String(i).padStart(28, "0"), "utf-8").toString("hex");
const lovelace = [{ unit: "lovelace", quantity: "100000000" }];

const keyStake = serializeRewardAddress(keyHashHex(1));
const keyStake2 = serializeRewardAddress(keyHashHex(2));
const credential = (i: number) => ({
  type: CredentialType.KeyHash,
  hash: keyHashHex(i),
});

const fetcher = new OfflineFetcher();
fetcher.addUTxOs([
  {
    input: { txHash: txHash("tx1"), outputIndex: 0 },
    output: { address: ADDR, amount: lovelace },
  },
]);

const txBuilder = () =>
  new MeshTxBuilder({
    fetcher,
    evaluator: null,
    serializer: new CardanoSDKSerializer(),
  });

const certificates = (txHex: string) =>
  Transaction.fromCbor(TxCBOR(txHex))
    .body()
    .certs()!
    .values()
    .map((cert) => cert.toCore());

describe("Stake registration certificates", () => {
  it("emits the Conway certificates stating the deposit when a coin is given", async () => {
    const txHex = await txBuilder()
      .registerStakeCertificate(keyStake, 2000000)
      .deregisterStakeCertificate(keyStake2, 2000000)
      .txIn(txHash("tx1"), 0)
      .changeAddress(ADDR)
      .complete();
    expect(certificates(txHex)).toEqual([
      {
        __typename: Cardano.CertificateType.Registration,
        stakeCredential: credential(1),
        deposit: 2000000n,
      },
      {
        __typename: Cardano.CertificateType.Unregistration,
        stakeCredential: credential(2),
        deposit: 2000000n,
      },
    ]);
  });

  it("emits the legacy certificates when no coin is given", async () => {
    const txHex = await txBuilder()
      .registerStakeCertificate(keyStake)
      .deregisterStakeCertificate(keyStake2)
      .txIn(txHash("tx1"), 0)
      .changeAddress(ADDR)
      .complete();
    expect(certificates(txHex)).toEqual([
      {
        __typename: Cardano.CertificateType.StakeRegistration,
        stakeCredential: credential(1),
      },
      {
        __typename: Cardano.CertificateType.StakeDeregistration,
        stakeCredential: credential(2),
      },
    ]);
  });
});
