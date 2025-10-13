import { Cardano } from "@cardano-sdk/core";

describe("Miscellaneous", () => {
  it("Cardano Reward Account", () => {
    const rewardAccount = Cardano.RewardAccount.fromCredential(
      {
        hash: "b1f70b573b204c6695b8f66eb6e7c78c55ede9430024ebec6fd5f85d",
        type: Cardano.CredentialType.KeyHash,
      },
      Cardano.NetworkId.Testnet,
    );
    expect(Cardano.RewardAccount.toHash(rewardAccount)).toBe(
      "b1f70b573b204c6695b8f66eb6e7c78c55ede9430024ebec6fd5f85d",
    );
  });
});
