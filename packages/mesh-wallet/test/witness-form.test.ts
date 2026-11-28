import {
  CborReader,
  HexBlob,
  Serialization,
  Transaction,
  TransactionWitnessSet,
  TxCBOR,
} from "@meshsdk/core-cst";
import {
  AppWallet,
  BrowserWallet,
  MeshWallet,
  WalletStaticMethods,
} from "@meshsdk/wallet";

const SOLUTION = "solution,".repeat(24).split(",").slice(0, 24);
/** The vkey witness of another key, for a transaction that holds one already */
const OTHER = `825820${"ab".repeat(32)}5840${"cd".repeat(64)}`;

/** A body spending one input and paying one output, its inputs with the set tag or without */
const body = (tagged: boolean) =>
  `a300${tagged ? "d90102" : ""}81825820${"11".repeat(32)}00` +
  `018182581d60${"22".repeat(28)}1a000f4240021a0002a3b0`;
const tx = (tagged: boolean, witnessSet = "a0") =>
  `84${body(tagged)}${witnessSet}f5f6`;
/** A witness set holding the other key's witness, with the set tag or without */
const holding = (tagged: boolean) => `a100${tagged ? "d90102" : ""}81${OTHER}`;

const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
/** The items of a transaction, each as written */
const items = (txHex: string) => {
  const reader = new CborReader(HexBlob(txHex));
  const length = reader.readStartArray()!;
  return Array.from({ length }, () => hexOf(reader.readEncodedValue()));
};
/** The vkey entry of a witness set, as written */
const vkeyEntry = (witnessSet: string) => {
  const reader = new CborReader(HexBlob(witnessSet));
  const length = reader.readStartMap()!;
  for (let i = 0; i < length; i++) {
    const key = reader.readUInt();
    const value = hexOf(reader.readEncodedValue());
    if (key === 0n) return value;
  }
  return undefined;
};
/** Whether a vkey entry is written with the set tag, and how many witnesses it holds */
const form = (entry: string | undefined) => ({
  tagged: entry!.startsWith("d90102"),
  witnesses: Number(
    new CborReader(HexBlob(entry!.replace(/^d90102/, ""))).readStartArray(),
  ),
});
const txId = (txHex: string) => Transaction.fromCbor(TxCBOR(txHex)).getId();

/** Checks a signed transaction: its body and hash are those of `unsigned`, its vkey entry `want` */
const expectSigned = (
  signed: string,
  unsigned: string,
  want: { tagged: boolean; witnesses: number },
) => {
  expect(items(signed)[0]).toBe(items(unsigned)[0]);
  expect(items(signed).slice(2)).toEqual(items(unsigned).slice(2));
  expect(txId(signed)).toBe(txId(unsigned));
  expect(form(vkeyEntry(items(signed)[1]!))).toEqual(want);
};

/**
 * A CIP-30 extension over a Mesh wallet, answering its witnesses with the set tag or without,
 * whatever the transaction's form, as an extension of another library may
 */
const extension = (wallet: MeshWallet, answerTagged: boolean) => ({
  name: "fake",
  icon: "",
  apiVersion: "1.0.0",
  enable: async () => ({
    signTx: async (txHex: string) => {
      const set = TransactionWitnessSet.fromCbor(
        HexBlob(await wallet.signTx(txHex, true, false)),
      );
      const witness = set.vkeys()!.values()[0]!.toCbor();
      return `a100${answerTagged ? "d90102" : ""}81${witness}`;
    },
  }),
});

describe("the wallets write their witnesses in the form of the transaction", () => {
  const mesh = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words: SOLUTION },
  });
  const app = new AppWallet({
    networkId: 0,
    key: { type: "mnemonic", words: SOLUTION },
  });
  const global = globalThis as { window?: unknown };
  const browser = async (answerTagged: boolean) => {
    global.window = {
      cardano: { fake: extension(mesh, answerTagged) },
    };
    return BrowserWallet.enable("fake");
  };

  beforeAll(async () => {
    await mesh.init();
    await app.init();
  });
  afterAll(() => {
    delete global.window;
  });

  it("writes a new vkey set in the form of the body's inputs, the body and hash unchanged", async () => {
    for (const tagged of [true, false]) {
      const unsigned = tx(tagged);
      const want = { tagged, witnesses: 1 };
      expectSigned(await mesh.signTx(unsigned), unsigned, want);
      expectSigned(await app.signTx(unsigned), unsigned, want);
      for (const answerTagged of [true, false])
        expectSigned(
          await (await browser(answerTagged)).signTx(unsigned),
          unsigned,
          want,
        );
      const [witness] = TransactionWitnessSet.fromCbor(
        HexBlob(await mesh.signTxWitnesses(unsigned)),
      )
        .vkeys()!
        .values();
      expectSigned(
        WalletStaticMethods.addWitnessSets(unsigned, [witness!]),
        unsigned,
        want,
      );
      // A witness set returned alone
      for (const alone of [
        await mesh.signTx(unsigned, false, false),
        await mesh.signTxWitnesses(unsigned),
        await app.signTx(unsigned, false, false),
      ])
        expect(form(vkeyEntry(alone))).toEqual(want);
    }
  });

  it("keeps the form of the vkey set a transaction holds, whatever the body's", async () => {
    for (const tagged of [true, false])
      for (const held of [true, false]) {
        const unsigned = tx(tagged, holding(held));
        const want = { tagged: held, witnesses: 2 };
        expectSigned(await mesh.signTx(unsigned, true), unsigned, want);
        expectSigned(await app.signTx(unsigned, true), unsigned, want);
        expectSigned(
          await (await browser(!held)).signTx(unsigned, true),
          unsigned,
          want,
        );
        // The witness held stays first, as written
        expect(
          vkeyEntry(items(await mesh.signTx(unsigned, true))[1]!)!,
        ).toContain(`${held ? "d90102" : ""}82${OTHER}`);
        for (const alone of [
          await mesh.signTx(unsigned, true, false),
          await mesh.signTxWitnesses(unsigned),
          await app.signTx(unsigned, true, false),
        ])
          expect(form(vkeyEntry(alone))).toEqual({
            tagged: held,
            witnesses: 1,
          });
      }
  });

  it("signs two transactions of either form at once, each in its own form", async () => {
    const [tagged, plain, taggedAlone, plainAlone] = await Promise.all([
      mesh.signTx(tx(true)),
      mesh.signTx(tx(false)),
      mesh.signTxWitnesses(tx(true)),
      app.signTx(tx(false), false, false),
    ]);
    expect(form(vkeyEntry(items(tagged)[1]!)).tagged).toBe(true);
    expect(form(vkeyEntry(items(plain)[1]!)).tagged).toBe(false);
    expect(form(vkeyEntry(taggedAlone)).tagged).toBe(true);
    expect(form(vkeyEntry(plainAlone)).tagged).toBe(false);
  });

  it("keeps the validity flag of a transaction marked failing", async () => {
    const failing = `84${body(false)}a0f4f6`;
    const signed = await mesh.signTx(failing);
    expect(items(signed)[2]).toBe("f4");
    expect(Serialization.Transaction.fromCbor(TxCBOR(signed)).isValid()).toBe(
      false,
    );
  });
});
