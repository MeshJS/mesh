import { MeshWallet } from "@meshsdk/wallet";

describe("MeshWallet", () => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: {
      type: "mnemonic",
      words: "solution,".repeat(24).split(",").slice(0, 24),
    },
  });

  beforeAll(async () => {
    await wallet.init();
  });

  it("private keys", async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "root",
        bech32:
          "xprv1cqa46gk29plgkg98upclnjv5t425fcpl4rgf9mq2txdxuga7jfq5shk7np6l55nj00sl3m4syzna3uwgrwppdm0azgy9d8zahyf32s62klfyhe0ayyxkc7x92nv4s77fa0v25tufk9tnv7x6dgexe9kdz5gpeqgu",
      },
    });
    await wallet.init();
    expect(await wallet.getChangeAddress()).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
  });

  it("stake key sign tx", async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "mnemonic",
        words: "summer,".repeat(24).split(",").slice(0, 24),
      },
      accountType: "stake",
    });
    await wallet.init();
    expect(
      await wallet.signTx(
        "84a4008182582004509185eb98edd8e2420c1ceea914d6a7a3142041039b2f12b4d4f03162d56f04018282581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a000f42408258390004845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe71a15d35396021a0002917d075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030ca0f5d90103a0",
      ),
    ).toEqual(
      "84a4008182582004509185eb98edd8e2420c1ceea914d6a7a3142041039b2f12b4d4f03162d56f04018282581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a000f42408258390004845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe71a15d35396021a0002917d075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030ca10081825820a024a8d7da8512189b6c14f45a3fd4d5bfd820541ca864dcf2126987d9349847584081a833fcbf2542de672833708ae48355a8481106c1f1d20e3ced3b8df0890516811f04e2d7eb7bab10499ce67740ff7dd8d9c3ebd892cccae94addd0afbc720cf5d90103a0",
    );
  });

  it("drep key sign tx", async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "mnemonic",
        words: "summer,".repeat(24).split(",").slice(0, 24),
      },
      accountType: "drep",
    });
    await wallet.init();
    expect(
      await wallet.signTx(
        "84a4008182582004509185eb98edd8e2420c1ceea914d6a7a3142041039b2f12b4d4f03162d56f04018282581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a000f42408258390004845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe71a15d35396021a0002917d075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030ca0f5d90103a0",
      ),
    ).toEqual(
      "84a4008182582004509185eb98edd8e2420c1ceea914d6a7a3142041039b2f12b4d4f03162d56f04018282581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a000f42408258390004845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe71a15d35396021a0002917d075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030ca10081825820498d6d749c6faec8d2d8e306daf1a50ed2da6a44842e26fe6b63a1aae1c6db6e58408c976bd43bca2eeb83633a7393c7b6ed22a08146fe3f569d628af5507436b9b55281625e48bdf2bc23130c0020172bbadeeb65e944f6c0079b9feb7df58f3109f5d90103a0",
    );
  });

  it("cli keys", async () => {
    const _wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "cli",
        payment:
          "5820f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241",
        stake:
          "5820b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe9241",
      },
    });
    await _wallet.init();
    expect(await _wallet.getChangeAddress()).toEqual(
      "addr_test1qqdy60gf798xrl20wwvapvsxj3kr8yz8ac6zfmgwg6c5g9p3x07mt562mneg8jxgj03p2uvmhyfyvktjn259mws8e6wq3cdn8p",
    );
    expect((await _wallet.getRewardAddresses())[0]).toEqual(
      "stake_test1uqcn8ld46d9deu5reryf8cs4wxdmjyjxt9ef42zahgrua8qctnd74",
    );
  });

  it("init with address", async () => {
    const _wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "address",
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      },
    });
    await _wallet.init();
    expect(_wallet.addresses.baseAddressBech32).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
    expect(_wallet.addresses.enterpriseAddressBech32).toEqual(
      "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
    );
    expect(_wallet.addresses.rewardAddressBech32).toEqual(
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n",
    );
  });

  it("getChangeAddress", async () => {
    const changeAddress = await wallet.getChangeAddress();
    expect(changeAddress).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
  });

  it("getNetworkId", async () => {
    const networkId = await wallet.getNetworkId();
    expect(networkId).toEqual(0);
  });

  it("getRewardAddresses", async () => {
    const addresses = await wallet.getRewardAddresses();
    expect(addresses).toEqual([
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n",
    ]);
  });

  it("getUnusedAddresses", async () => {
    const addresses = await wallet.getUnusedAddresses();
    expect(addresses).toEqual([
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    ]);
  });

  it("getUsedAddresses", async () => {
    const addresses = await wallet.getUsedAddresses();
    expect(addresses).toEqual([
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    ]);
  });

  it("getUsedAddress", async () => {
    const address = wallet.getUsedAddress();
    expect(address.toBech32()).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
  });
});

describe("MeshWallet cli key", () => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: {
      type: "cli",
      payment:
        "58201aae63d93899640e91b51c5e8bd542262df3ecf3246c3854f39c40f4eb83557d",
    },
  });

  beforeAll(async () => {
    await wallet.init();
  });

  it("getChangeAddress", async () => {
    const changeAddress = await wallet.getChangeAddress();
    expect(changeAddress).toEqual(
      "addr_test1qpsthwvxgfkkm2lm8ggy0c5345u6vrfctmug6tdyx4rf4m9g500utfac3r6wvsygpnvt57a5ht0edjs0n6ejlwvuytns23durk",
    );
  });
});
