import { AppWallet } from "@meshsdk/wallet";

describe("AppWallet", () => {
  const wallet = new AppWallet({
    networkId: 0,
    key: {
      type: "mnemonic",
      words: "solution,".repeat(24).split(",").slice(0, 24),
    },
  });

  it("brew", () => {
    const mnemonic = AppWallet.brew();
    expect(mnemonic.length).toEqual(24);
  });

  it("private keys", () => {
    const wallet = new AppWallet({
      networkId: 0,
      key: {
        type: "root",
        bech32:
          "xprv1cqa46gk29plgkg98upclnjv5t425fcpl4rgf9mq2txdxuga7jfq5shk7np6l55nj00sl3m4syzna3uwgrwppdm0azgy9d8zahyf32s62klfyhe0ayyxkc7x92nv4s77fa0v25tufk9tnv7x6dgexe9kdz5gpeqgu",
      },
    });

    const paymentAddress = wallet.getPaymentAddress();
    expect(paymentAddress).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
    const enterpriseAddress = wallet.getEnterpriseAddress();
    expect(enterpriseAddress).toEqual(
      "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
    );
    const rewardAddress = wallet.getRewardAddress();
    expect(rewardAddress).toEqual(
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n",
    );
  });

  it("cli keys", () => {
    const wallet = new AppWallet({
      networkId: 0,
      key: {
        type: "cli",
        payment:
          "5820f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241",
        stake:
          "5820b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe9241",
      },
    });

    const paymentAddress = wallet.getPaymentAddress();
    expect(paymentAddress).toEqual(
      "addr_test1qqdy60gf798xrl20wwvapvsxj3kr8yz8ac6zfmgwg6c5g9p3x07mt562mneg8jxgj03p2uvmhyfyvktjn259mws8e6wq3cdn8p",
    );
    const enterpriseAddress = wallet.getEnterpriseAddress();
    expect(enterpriseAddress).toEqual(
      "addr_test1vqdy60gf798xrl20wwvapvsxj3kr8yz8ac6zfmgwg6c5g9qh602xh",
    );
    const rewardAddress = wallet.getRewardAddress();
    expect(rewardAddress).toEqual(
      "stake_test1uqcn8ld46d9deu5reryf8cs4wxdmjyjxt9ef42zahgrua8qctnd74",
    );
  });

  it("correct payment address", () => {
    const paymentAddress = wallet.getPaymentAddress();
    expect(paymentAddress).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
  });

  it("correct enterprise address", () => {
    const enterpriseAddress = wallet.getEnterpriseAddress();
    expect(enterpriseAddress).toEqual(
      "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
    );
  });

  it("correct reward address", () => {
    const rewardAddress = wallet.getRewardAddress();
    expect(rewardAddress).toEqual(
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n",
    );
  });

  it("correct used addresses", () => {
    const paymentAddress = wallet.getUsedAddress();
    expect(paymentAddress.toBech32()).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
    const enterpriseAddress = wallet.getUsedAddress(0, 0, "enterprise");
    expect(enterpriseAddress.toBech32()).toEqual(
      "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
    );
  });
});
