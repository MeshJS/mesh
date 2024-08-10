import { stringToHex } from "@meshsdk/common";
import { checkSignature, getPublicKeyFromCoseKey } from "@meshsdk/core-cst";
import { EmbeddedWallet } from "@meshsdk/wallet";

describe("EmbeddedWallet mnemonic", () => {
  const wallet = new EmbeddedWallet({
    networkId: 0,
    key: {
      type: "mnemonic",
      words: "solution,".repeat(24).split(",").slice(0, 24),
    },
  });

  it("generate mnemonic", () => {
    const mnemonic = EmbeddedWallet.generateMnemonic();
    expect(mnemonic.length).toEqual(24);
  });

  it("correct base address", () => {
    const account = wallet.getAccount(0, 0);
    expect(account.baseAddressBech32).toEqual(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
  });

  it("correct enterprise address", () => {
    const account = wallet.getAccount(0, 0);
    expect(account.enterpriseAddressBech32).toEqual(
      "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
    );
  });

  it("correct reward address", () => {
    const account = wallet.getAccount(0, 0);
    expect(account.rewardAddressBech32).toEqual(
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n",
    );
  });

  it("sign message", () => {
    const message = `meshjs's core-cst is pure typescript while core-csl is wasm rust.`;
    const signature = wallet.signData(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      stringToHex(message),
      0,
      0,
    );

    const result = checkSignature(stringToHex(message), signature);

    expect(getPublicKeyFromCoseKey(signature.key).toString("hex")).toEqual(
      "c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f95",
    );
    expect(result).toEqual(true);
  });
});

describe("EmbeddedWallet privateKey", () => {
  const walletMnemonic = new EmbeddedWallet({
    networkId: 0,
    key: {
      type: "mnemonic",
      words: [
        "ramp",
        "over",
        "popular",
        "angry",
        "flock",
        "idle",
        "silent",
        "stove",
        "very",
        "hover",
        "hip",
        "juice",
        "dentist",
        "mask",
        "radar",
        "example",
        "layer",
        "tongue",
        "shift",
        "cement",
        "margin",
        "since",
        "floor",
        "clinic",
      ],
    },
  });

  const walletRoot = new EmbeddedWallet({
    networkId: 0,
    key: {
      type: "root",
      bech32:
        "xprv1tzdu7xzqjc0j8jzlsjwdvchczkxu4qjyhkxewtcuu7zt3amd44x6emkcrzks8gthdwyfavq98ayp06434yda6xudfd5zltd4tjxhdu37qumdlvcx8f05pp5n45j6nwqztx2ra0jm636xqluwxw47vlrlzqp7a0a9",
    },
  });

  it("correct addresses", () => {
    const accountMnemonic = walletMnemonic.getAccount(0, 0);
    expect(accountMnemonic.enterpriseAddressBech32).toEqual(
      "addr_test1vz0vlyux43d7c4su8uzkkqvm6vug28t3zvnycxjnuvnxa0c5gr4p9",
    );
    const accountRoot = walletRoot.getAccount(0, 0);
    expect(accountRoot.enterpriseAddressBech32).toEqual(
      "addr_test1vz0vlyux43d7c4su8uzkkqvm6vug28t3zvnycxjnuvnxa0c5gr4p9",
    );
  });
});

describe("EmbeddedWallet signingKeys", () => {
  const wallet = new EmbeddedWallet({
    networkId: 0,
    key: {
      type: "cli",
      payment:
        "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241",
      stake: "b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe9241",
    },
  });

  it("correct addresses", () => {
    const account = wallet.getAccount(0, 0);
    expect(account.baseAddressBech32).toEqual(
      "addr_test1qqdy60gf798xrl20wwvapvsxj3kr8yz8ac6zfmgwg6c5g9p3x07mt562mneg8jxgj03p2uvmhyfyvktjn259mws8e6wq3cdn8p",
    );
    expect(account.enterpriseAddressBech32).toEqual(
      "addr_test1vqdy60gf798xrl20wwvapvsxj3kr8yz8ac6zfmgwg6c5g9qh602xh",
    );
    expect(account.rewardAddressBech32).toEqual(
      "stake_test1uqcn8ld46d9deu5reryf8cs4wxdmjyjxt9ef42zahgrua8qctnd74",
    );
  });
});
