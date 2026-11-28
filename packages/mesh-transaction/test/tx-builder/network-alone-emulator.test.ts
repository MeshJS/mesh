import { randomBytes } from "node:crypto";

import {
  DEFAULT_PROTOCOL_PARAMETERS,
  Protocol,
  pubKeyAddress,
  serializeAddressObj,
} from "@meshsdk/core";
import { Crypto } from "@meshsdk/core-cst";

import {
  keySigner,
  output,
  TxBuilder,
  TxBuildError,
  TxError,
  Utxo,
} from "../../src/tx-builder";
import { baseAddress } from "../test-util";
import { pay, setup } from "./plan/plan-emulator-util";

/*
 * A builder given its network alone, as a cold machine makes one: it reads and signs, and every
 * call that needs protocol parameters is refused at the call, naming them.
 */

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const recipient = baseAddress(2);

const caught = async (run: () => unknown): Promise<any> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};

/** Checks MISSING_PARAMETER for the parameters, naming where they come from */
const expectNoParams = (error: unknown) => {
  expect(error).toBeInstanceOf(TxBuildError);
  expect(TxError.is(error, "MISSING_PARAMETER")).toBe(true);
  const { details, message } = error as TxBuildError<"MISSING_PARAMETER">;
  expect(details).toEqual({ parameter: "params" });
  expect(message).toContain("needs protocol parameters");
  expect(message).toContain("neither a provider to read them from nor params");
};

/** A key of the test, its preprod address and a UTxO there */
const keyOf = () => {
  const secret = randomBytes(32).toString("hex");
  const keyHash = Crypto.Ed25519PrivateKey.fromNormalBytes(
    Buffer.from(secret, "hex"),
  )
    .toPublic()
    .hash()
    .hex() as string;
  const address = serializeAddressObj(pubKeyAddress(keyHash), 0);
  const utxo: Utxo = {
    txHash: randomBytes(32).toString("hex"),
    outputIndex: 0,
    address,
    value: { lovelace: 50_000_000n },
  };
  return { secret, keyHash, address, utxo };
};

/** A payer whose every method is recorded and answers nothing */
const recordingPayer = () => {
  const asked: string[] = [];
  const payer = new Proxy(
    {},
    {
      get: (_, name) =>
        typeof name === "string" && name !== "then"
          ? () => {
              asked.push(name);
              return Promise.reject(new Error("not answered"));
            }
          : undefined,
    },
  );
  return { payer: payer as never, asked };
};

beforeAll(async () => {
  await Crypto.ready();
});

describe("TxBuilder with a network alone", () => {
  it("is made, and holds neither a provider nor params", () => {
    const cold = new TxBuilder({ network: "preprod" });
    expect(cold.network.name).toBe("preprod");
    expect(cold.provider).toBeUndefined();
    expect(cold.params).toBeUndefined();
    expect(cold.costModels).toBeUndefined();
  });

  it("reads a transaction with fromCbor and the UTxOs of its inputs, signs it with keySigner, and writes and restores it", async () => {
    const key = keyOf();
    const built = await new TxBuilder({ network: "preprod", params }).build(
      output({ address: recipient, value: { lovelace: 5_000_000n } }),
      { payer: { changeAddress: key.address, utxos: [key.utxo] } },
    );
    const cold = new TxBuilder({ network: "preprod" });
    const made = await cold.fromCbor(built.tx, { knownUtxos: [key.utxo] });
    expect(made.txHash).toBe(built.txHash);
    expect(made.missing).toEqual([{ keyHash: key.keyHash, roles: ["input"] }]);
    await made.sign({ signers: keySigner(key.secret) });
    expect(made.missing).toEqual([]);
    expect(made.signedTx).toBeDefined();

    // The JSON of the build, restored on the cold builder, is signed there
    const restored = await cold.restore(JSON.parse(JSON.stringify(built)));
    expect(restored.txHash).toBe(built.txHash);
    expect(restored.missing).toEqual([
      { keyHash: key.keyHash, roles: ["input"] },
    ]);
    await restored.sign({ signers: keySigner(key.secret) });
    expect(restored.signedTx).toBe(made.signedTx);
    // And its own JSON goes back through restore with the signature
    const again = await cold.restore(JSON.parse(JSON.stringify(restored)));
    expect(again.signedTx).toBe(made.signedTx);
  });

  it("reads a transaction blind, signs it with keySigner, and submits partialTx through a submitter", async () => {
    const key = keyOf();
    const built = await new TxBuilder({ network: "preprod", params }).build(
      output({ address: recipient, value: { lovelace: 5_000_000n } }),
      { payer: { changeAddress: key.address, utxos: [key.utxo] } },
    );
    const sent: string[] = [];
    const cold = new TxBuilder({
      network: "preprod",
      submitter: {
        submitTx: async (tx: string) => {
          sent.push(tx);
          return built.txHash;
        },
      },
    });
    const blind = await cold.fromCbor(built.tx, { blind: true });
    expect(blind.txHash).toBe(built.txHash);
    expect(blind.outputs).toEqual(
      built.outputs.map(({ label: _, change: __, ...output }) => output),
    );
    await blind.sign({ signers: keySigner(key.secret) });
    expect(blind.signedKeyHashes).toEqual([key.keyHash]);
    await blind.submit();
    const read = await cold.fromCbor(built.tx, { knownUtxos: [key.utxo] });
    await read.sign({ signers: keySigner(key.secret) });
    expect(sent).toEqual([read.signedTx]);
  });

  it("submits a signed transaction through a submitter, and looks for none without a provider", async () => {
    const key = keyOf();
    const built = await new TxBuilder({ network: "preprod", params }).build(
      output({ address: recipient, value: { lovelace: 5_000_000n } }),
      { payer: { changeAddress: key.address, utxos: [key.utxo] } },
    );
    const sent: string[] = [];
    const cold = new TxBuilder({
      network: "preprod",
      submitter: {
        submitTx: async (tx: string) => {
          sent.push(tx);
          return built.txHash;
        },
      },
    });
    const made = await cold.fromCbor(built.tx, { knownUtxos: [key.utxo] });
    await made.sign({ signers: keySigner(key.secret) });
    await made.submit();
    expect(sent).toEqual([made.signedTx]);
    expect(
      TxError.is(await caught(() => made.awaitInclusion()), "MISSING_FETCHER"),
    ).toBe(true);
  });

  it("refuses build, chain() and plan at the call with MISSING_PARAMETER (params), the payer not read", async () => {
    const cold = new TxBuilder({ network: "preprod" });
    const { payer, asked } = recordingPayer();
    expectNoParams(await caught(() => cold.build(pay(), { payer })));
    expectNoParams(await caught(() => cold.chain()));
    expectNoParams(await caught(() => cold.plan(pay(), { payer })));
    expectNoParams(
      await caught(() => cold.plan({ a: pay(), b: [pay()] }, { payer })),
    );
    // A builder made by add keeps the network alone: it holds the parts and builds nothing
    const held = cold.add(pay());
    expectNoParams(await caught(() => held.build([], { payer })));
    expect(asked).toEqual([]);
  });

  it("resumes a plan, whose add and replan are refused at the call with MISSING_PARAMETER (params)", async () => {
    const { builder, wallet } = await setup("scalus");
    const plan = await builder.plan(pay(), { payer: wallet });
    const cold = new TxBuilder({ network: "preprod" });
    const resumed = await cold.resume(plan.toJSON());
    expect(resumed.steps.map((step) => step.txHash)).toEqual(
      plan.steps.map((step) => step.txHash),
    );
    const { payer, asked } = recordingPayer();
    expectNoParams(
      await caught(() => resumed.add({ more: { parts: [pay()], payer } })),
    );
    expectNoParams(
      await caught(() =>
        resumed.replan({ id: "again", steps: [pay()], payer }),
      ),
    );
    expectNoParams(await caught(() => resumed.replan({ id: "again" })));
    expect(asked).toEqual([]);
  });

  it("builds as before with params alone, and with a provider alone", async () => {
    const key = keyOf();
    const withParams = await new TxBuilder({
      network: "preprod",
      params,
    }).build(pay(), {
      payer: { changeAddress: key.address, utxos: [key.utxo] },
    });
    expect(withParams.inputs).toEqual([key.utxo]);
    const { builder, wallet } = await setup("scalus");
    const withProvider = await builder.build(pay(), { payer: wallet });
    expect(withProvider.outputs.some((o) => o.address === recipient)).toBe(
      true,
    );
  });
});
