import {
  deserializeBech32Address,
  HexBlob,
  TransactionWitnessSet,
} from "@meshsdk/core-cst";
import { AccountType, MeshWallet } from "@meshsdk/wallet";

const SOLUTION = "solution,".repeat(24).split(",").slice(0, 24);
const SUMMER = "summer,".repeat(24).split(",").slice(0, 24);

const CHANGE_ADDRESS =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const PAYMENT_HASH = "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";
const STAKE_HASH = "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6";
const DREP_HASH = "ed11d1ad4d95806b4443576724a4c5b57b93dc15eca5a3f46d235a9e";

const CLI_PAYMENT_KEY =
  "58201aae63d93899640e91b51c5e8bd542262df3ecf3246c3854f39c40f4eb83557d";

const TX =
  "84a4008182582004509185eb98edd8e2420c1ceea914d6a7a3142041039b2f12b4d4f03162d56f04018282581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a000f42408258390004845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe71a15d35396021a0002917d075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030ca0f5d90103a0";

const mnemonicWallet = (
  words: string[],
  accountType?: AccountType,
): MeshWallet =>
  new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    ...(accountType ? { accountType } : {}),
  });

const cliWallet = (accountType?: AccountType): MeshWallet =>
  new MeshWallet({
    networkId: 0,
    key: { type: "cli", payment: CLI_PAYMENT_KEY },
    ...(accountType ? { accountType } : {}),
  });

/** The vkey witnesses of a witness set, each as CBOR, in their order */
const vkeysOf = (witnessSet: string): string[] => {
  const vkeys = TransactionWitnessSet.fromCbor(HexBlob(witnessSet)).vkeys();
  return vkeys ? vkeys.toCore().map((w) => `${w[0]}:${w[1]}`) : [];
};

/** The one witness `signTx` of a wallet of this seed and account type gives */
const oracle = async (
  words: string[],
  accountType: AccountType,
): Promise<string> => {
  const witnesses = vkeysOf(
    await mnemonicWallet(words, accountType).signTx(TX, true, false),
  );
  expect(witnesses).toHaveLength(1);
  return witnesses[0]!;
};

describe("MeshWallet signTxWitnesses", () => {
  let payment: string;
  let stake: string;
  let drep: string;
  let otherPaymentHash: string;

  beforeAll(async () => {
    payment = await oracle(SOLUTION, "payment");
    stake = await oracle(SOLUTION, "stake");
    drep = await oracle(SOLUTION, "drep");
    const other = mnemonicWallet(SUMMER);
    otherPaymentHash = deserializeBech32Address(
      await other.getChangeAddress(),
    ).pubKeyHash;
    expect(otherPaymentHash).toHaveLength(56);
    expect(otherPaymentHash).not.toBe(PAYMENT_HASH);
  });

  it.each(["payment", "stake", "drep"] as AccountType[])(
    "without a list signs as signTx does, accountType %s",
    async (accountType) => {
      const wallet = mnemonicWallet(SOLUTION, accountType);
      const expected = await wallet.signTx(TX, true, false);
      expect(await wallet.signTxWitnesses(TX)).toBe(expected);
    },
  );

  it("the payment and stake hashes give the payment and stake witnesses", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    const result = await wallet.signTxWitnesses(TX, [PAYMENT_HASH, STAKE_HASH]);
    expect(vkeysOf(result)).toEqual([payment, stake]);
  });

  it("all three hashes give three witnesses in the order payment, stake, DRep", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    const result = await wallet.signTxWitnesses(TX, [
      DREP_HASH,
      STAKE_HASH,
      PAYMENT_HASH,
    ]);
    expect(vkeysOf(result)).toEqual([payment, stake, drep]);
  });

  it("a key whose hash is not listed never signs, whatever the accountType", async () => {
    const stakeWallet = mnemonicWallet(SOLUTION, "stake");
    expect(
      vkeysOf(await stakeWallet.signTxWitnesses(TX, [PAYMENT_HASH])),
    ).toEqual([payment]);
    const paymentWallet = mnemonicWallet(SOLUTION);
    expect(
      vkeysOf(await paymentWallet.signTxWitnesses(TX, [STAKE_HASH])),
    ).toEqual([stake]);
  });

  it("the hash of another wallet's key is not signed", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    expect(await wallet.signTxWitnesses(TX, [otherPaymentHash])).toBe("a0");
    expect(
      vkeysOf(
        await wallet.signTxWitnesses(TX, [otherPaymentHash, PAYMENT_HASH]),
      ),
    ).toEqual([payment]);
  });

  it.each([undefined, "stake", "drep"] as (AccountType | undefined)[])(
    "an empty list signs nothing, accountType %s",
    async (accountType) => {
      const wallet = mnemonicWallet(SOLUTION, accountType);
      expect(await wallet.signTxWitnesses(TX, [])).toBe("a0");
    },
  );

  it("works on a wallet whose init was never called", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    expect(vkeysOf(await wallet.signTxWitnesses(TX, [PAYMENT_HASH]))).toEqual([
      payment,
    ]);
  });

  it("a hash listed twice gives one witness", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    expect(
      vkeysOf(await wallet.signTxWitnesses(TX, [PAYMENT_HASH, PAYMENT_HASH])),
    ).toEqual([payment]);
  });

  it("returns a witness set for a transaction that already holds witnesses", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    const signedTx = await wallet.signTx(TX);
    const result = await wallet.signTxWitnesses(signedTx, [PAYMENT_HASH]);
    expect(result).not.toBe(signedTx);
    expect(result.startsWith("a1")).toBe(true);
    expect(vkeysOf(result)).toEqual([payment]);
  });

  it("a cli wallet without a DRep key signs with its payment key only", async () => {
    const wallet = cliWallet();
    const cliPayment = vkeysOf(await wallet.signTx(TX, true, false));
    const cliPaymentHash = deserializeBech32Address(
      await wallet.getChangeAddress(),
    ).pubKeyHash;
    expect(
      vkeysOf(await wallet.signTxWitnesses(TX, [cliPaymentHash, DREP_HASH])),
    ).toEqual(cliPayment);

    const drepWallet = cliWallet("drep");
    const expected = await drepWallet
      .signTx(TX, true, false)
      .catch((e: Error) => e);
    const error = await drepWallet.signTxWitnesses(TX).catch((e: Error) => e);
    expect(expected).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe((expected as Error).message);
    expect((error as Error).message).toContain("DRep key not found");
  });

  it("a read-only wallet rejects as signTx does, with a list and without", async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "address", address: CHANGE_ADDRESS },
    });
    const message =
      "[MeshWallet] Read only wallet does not support signing data.";
    await expect(wallet.signTxWitnesses(TX)).rejects.toThrow(message);
    await expect(wallet.signTxWitnesses(TX, [PAYMENT_HASH])).rejects.toThrow(
      message,
    );
    await expect(wallet.signTxWitnesses(TX, [])).rejects.toThrow(message);
  });

  it("a hash written in upper case matches", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    expect(
      vkeysOf(await wallet.signTxWitnesses(TX, [PAYMENT_HASH.toUpperCase()])),
    ).toEqual([payment]);
  });

  it("an entry is only lower-cased: one with spaces, a prefix or cut short matches nothing", async () => {
    const wallet = mnemonicWallet(SOLUTION);
    expect(
      await wallet.signTxWitnesses(TX, [
        " " + PAYMENT_HASH,
        PAYMENT_HASH + " ",
        "0x" + PAYMENT_HASH,
        PAYMENT_HASH.slice(0, 54),
      ]),
    ).toBe("a0");
  });

  it("a cli wallet whose payment and stake keys are the same signs once", async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "cli", payment: CLI_PAYMENT_KEY, stake: CLI_PAYMENT_KEY },
    });
    const cliPayment = vkeysOf(await wallet.signTx(TX, true, false));
    expect(cliPayment).toHaveLength(1);
    const cliPaymentHash = deserializeBech32Address(
      await wallet.getChangeAddress(),
    ).pubKeyHash;
    const stakeHash = deserializeBech32Address(
      await wallet.getChangeAddress(),
    ).stakeCredentialHash;
    expect(stakeHash).toBe(cliPaymentHash);
    expect(vkeysOf(await wallet.signTxWitnesses(TX, [cliPaymentHash]))).toEqual(
      cliPayment,
    );
  });

  it.each([
    ["an empty list", [] as string[]],
    ["another wallet's hash", null],
    ["its payment hash", [PAYMENT_HASH]],
  ])(
    "text that is not a transaction rejects as signTx does, with %s",
    async (_name, list) => {
      const wallet = mnemonicWallet(SOLUTION);
      const expected = await wallet
        .signTx("zz", true, false)
        .catch((e: Error) => e);
      expect(expected).toBeInstanceOf(Error);
      const error = await wallet
        .signTxWitnesses("zz", list ?? [otherPaymentHash])
        .catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor).toBe(
        (expected as Error).constructor,
      );
      expect((error as Error).message).toBe((expected as Error).message);
    },
  );
});
