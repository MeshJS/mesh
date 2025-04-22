import { MeshTxBuilderBody } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/transaction";
import {baseAddress, drepBech32, keyHashHex, poolIdBech32, rewardAddress, txHash, vrfKeyHashHex} from "../test-util";

describe("MeshTxBuilder expected signatures", () => {
  let txBuilder: MeshTxBuilder;

  beforeEach(() => {
    txBuilder = new MeshTxBuilder();
  });

  it("should have the correct number of possible vkeys for certificates", async () => {
   const serializeTxBodyWithMockSignatures = jest
      .spyOn(txBuilder.serializer as any, "serializeTxBodyWithMockSignatures");
    await txBuilder
      .txIn(
        txHash("tx3"),
        0,
        [
          {
            unit: "lovelace",
            quantity: "3000000000000",
          },
        ],
        baseAddress(0),
        0,
      )
      .drepRegistrationCertificate(
        drepBech32(1), undefined, "100")
      .drepDeregistrationCertificate(drepBech32(2), "100")
      .drepUpdateCertificate(drepBech32(3))
      .delegateStakeCertificate(rewardAddress(4), poolIdBech32(5))
      .deregisterStakeCertificate(rewardAddress(6))
      .registerPoolCertificate({
        vrfKeyHash: vrfKeyHashHex(8),
        operator: keyHashHex(7),
        pledge: "400",
        cost: "500",
        margin: [1, 2],
        relays: [{
          type: "MultiHostName",
          domainName: "localhost",
        }],
        owners: [
          keyHashHex(9),
          keyHashHex(10),
        ],
        rewardAddress: rewardAddress(11),
      })
      .retirePoolCertificate(poolIdBech32(12), 13)
      .registerStakeCertificate(rewardAddress(14))
      .changeAddress(baseAddress(15))
      .voteDelegationCertificate({alwaysAbstain: null}, rewardAddress(16))
      .complete()
      const callArg = serializeTxBodyWithMockSignatures.mock.calls[0]![0] as MeshTxBuilderBody;
      expect(callArg.expectedNumberKeyWitnesses).toEqual(12);
  });
});
