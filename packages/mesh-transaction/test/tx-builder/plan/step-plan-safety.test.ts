import { inspect } from "node:util";
import { bech32 } from "bech32";

import { mnemonicToEntropy } from "@meshsdk/common";
import { CborReader, Crypto, HexBlob } from "@meshsdk/core-cst";

import type { BuildEvent } from "../../../src/tx-builder";
import {
  guard,
  keySigner,
  memoryPlanStore,
  signedKeyHashes,
} from "../../../src/tx-builder";
import { resumeStepPlan } from "../../../src/tx-builder/plan/step-plan";
import { hashSigner, testKey } from "../hash-signer-util";
import {
  builderOf,
  caught,
  hashOf,
  submitterOf,
  words,
} from "./plan-emulator-util";
import {
  ADA,
  alice,
  bob,
  carol,
  payTo,
  planOf,
  stepSetup,
} from "./step-plan-util";

// The safety rules of signing and sending that concern a plan of steps, applied to the object
// that runs one: nothing of a key in an error, a JSON, a stored record or a trace event; a
// signer is asked for the hash of the body of the step it signs and of no other; `run` sends
// the signed transaction of a step and nothing else. No key is given to expect(): a test
// searches a text for the key and asserts on the names of what it found.

const HARDENED = 0x80000000;

/** RFC 8032, section 7.1, test 1 */
const rfc = {
  key: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
  keyHash: "35dedd2982a03cf39e7dce03c839994ffdec2ec6b04f1cf2d40e61a3",
};

const toBech32 = (prefix: string, hex: string) =>
  bech32.encode(prefix, bech32.toWords(Buffer.from(hex, "hex")), 1023);

type Secret = { text: string; kind: "text" | "base64" | "bytes" };

/**
 * Every form the two keys of the tests are searched in: the 32-byte key of RFC 8032 and the
 * payment key of the tests' mnemonic, each in hex, in halves, in base64 and as a list of bytes,
 * and in the texts a key is given in
 */
const secretsOf = async (): Promise<Record<string, Secret>> => {
  await Crypto.ready();
  const payment = Crypto.Bip32PrivateKey.fromBip39Entropy(
    Buffer.from(mnemonicToEntropy(words.join(" ")), "hex"),
    "",
  ).derive([HARDENED + 1852, HARDENED + 1815, HARDENED, 0, 0]);
  const extended = payment.toRawKey().hex() as string;
  const chained = payment.hex() as string;
  const keys: Record<string, { hex: string; texts: string[] }> = {
    "the 32-byte key": {
      hex: rfc.key,
      texts: [`5820${rfc.key}`, toBech32("ed25519_sk", rfc.key)],
    },
    "the extended key": {
      hex: extended,
      texts: [
        toBech32("ed25519e_sk", extended),
        toBech32("addr_xsk", chained),
        chained.slice(128),
      ],
    },
  };
  const secrets: Record<string, Secret> = {};
  for (const [name, { hex, texts }] of Object.entries(keys)) {
    const bytes = Buffer.from(hex, "hex");
    const half = bytes.length / 2;
    for (const [part, value] of [
      ["", bytes],
      [", first half,", bytes.subarray(0, half)],
      [", second half,", bytes.subarray(half)],
    ] as const) {
      secrets[`${name}${part} in hex`] = {
        text: value.toString("hex"),
        kind: "text",
      };
      secrets[`${name}${part} in base64`] = {
        text: value.toString("base64"),
        kind: "base64",
      };
      secrets[`${name}${part} as bytes`] = {
        text: [...value].join(","),
        kind: "bytes",
      };
    }
    texts.forEach((text, i) => {
      secrets[`${name} as text ${i}`] = { text, kind: "text" };
    });
  }
  return secrets;
};

/** Every text a value shows: printed with its hidden members, as JSON, and of an error its chain */
const textsOf = (value: unknown, depth = 0): string[] => {
  const texts: string[] = [];
  try {
    texts.push(
      inspect(value, { depth: Infinity, showHidden: true, getters: true }),
    );
  } catch (error) {
    texts.push(`inspect threw: ${String(error)}`);
  }
  try {
    texts.push(
      String(
        JSON.stringify(value, (_, v) =>
          typeof v === "bigint" ? String(v) : v,
        ),
      ),
    );
  } catch (error) {
    texts.push(`JSON.stringify threw: ${String(error)}`);
  }
  if (value instanceof Error && depth < 20)
    texts.push(
      value.message,
      String(value.stack),
      ...textsOf(value.cause, depth + 1),
    );
  return texts;
};

/** The names of the secrets found in what a value shows */
const shown = (value: unknown, secrets: Record<string, Secret>): string[] => {
  const all = textsOf(value).join("\n");
  const lower = all.toLowerCase();
  const squeezed = lower.replace(/[^0-9a-z_]/g, "");
  const numbers = `,${all.replace(/[^0-9]+/g, ",")},`;
  return Object.entries(secrets)
    .filter(([, { text, kind }]) => {
      if (kind === "bytes") return numbers.includes(`,${text},`);
      if (kind === "base64") return all.includes(text.replace(/=+$/, ""));
      const wanted = text.toLowerCase();
      return (
        lower.includes(wanted) ||
        squeezed.includes(wanted.replace(/[^0-9a-z_]/g, ""))
      );
    })
    .map(([name]) => name);
};

/** blake2b-256 of the bytes of a transaction's body, as written in it */
const bodyHashOf = (tx: string) => {
  const reader = new CborReader(HexBlob(tx));
  reader.readStartArray();
  return Crypto.blake2b
    .hash(HexBlob(Buffer.from(reader.readEncodedValue()).toString("hex")), 32)
    .toString();
};

describe("a plan of steps: the safety of signing and sending", () => {
  it("shows nothing of a key in an error, its JSON, its stored record, its printing or a trace event", async () => {
    const secrets = await secretsOf();
    // The search finds a key planted where it looks
    expect(
      shown(new Error("x", { cause: { planted: rfc.key } }), secrets),
    ).toContain("the 32-byte key in hex");
    const events: BuildEvent[] = [];
    const store = memoryPlanStore();
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { store },
    });
    const plan = await planOf(
      builder,
      {
        a: [payTo(alice, 5n * ADA), guard.pubKey({ keyHash: rfc.keyHash })],
        b: payTo(bob, 3n * ADA),
      },
      {
        payer: wallet,
        id: "safe-1",
        trace: (event) => {
          events.push(event);
        },
      },
    );
    const seen: Record<string, unknown> = {};
    seen["MISSING_SIGNATURES"] = await caught(plan.run());
    await plan.sign({ signers: [wallet, keySigner(rfc.key)] });
    seen["a signed plan"] = plan;
    seen["its steps"] = plan.steps;
    seen["SUBMIT_FAILED"] = await caught(
      plan.run({
        submitter: submitterOf(async () => {
          throw new Error("socket hang up");
        }),
      }),
    );
    seen["CONFIRM_TIMEOUT"] = await caught(
      plan.run({
        submitter: submitterOf(hashOf),
        timeoutMs: 50,
      }),
    );
    // A submitter that answers with another hash: a warning in the trace
    seen["a run"] = await plan.run({
      submitter: submitterOf(async (tx) => {
        await emulator.submitTx(tx);
        return "ab".repeat(32);
      }),
    });
    seen["its JSON"] = plan.toJSON();
    seen["its stored record"] = await store.load("safe-1");
    seen["the trace"] = events;
    seen["a resumed plan"] = await resumeStepPlan(
      builderOf(provider, { store }),
      "safe-1",
      { payer: wallet },
    );
    expect(plan.status).toBe("final");
    expect(events.some((event) => event.type === "warning")).toBe(true);
    for (const [name, value] of Object.entries(seen))
      expect([name, shown(value, secrets)]).toEqual([name, []]);
  });

  it("asks a signer for the hash of the body of the step it signs, and of no other", async () => {
    await Crypto.ready();
    const co = testKey();
    const { builder, wallet } = await stepSetup("scalus");
    const plan = await planOf(
      builder,
      {
        a: [payTo(alice, 5n * ADA), guard.pubKey({ keyHash: co.keyHash })],
        b: payTo(bob, 3n * ADA),
        c: [payTo(carol, 2n * ADA), guard.pubKey({ keyHash: co.keyHash })],
      },
      { payer: wallet },
    );
    const signer = hashSigner("object", ({ txHash, keys }) =>
      keys!.some((k) => k.keyHash === co.keyHash) ? [co.answer(txHash)] : [],
    );
    await plan.sign({ signers: [wallet, signer.signer] });
    expect(signer.requests.map((r) => r.txHash)).toEqual([
      plan.step("a").txHash,
      plan.step("c").txHash,
    ]);
    for (const request of signer.requests) {
      expect(bodyHashOf(request.tx)).toBe(request.txHash);
      expect(request.keys!.map((k) => k.keyHash)).toEqual([co.keyHash]);
    }
    expect(plan.steps.every((step) => step.status === "signed")).toBe(true);
    // Nothing is left to ask for: run asks nobody again
    await plan.run({ signers: [wallet, signer.signer] });
    expect(signer.requests).toHaveLength(2);
    expect(plan.status).toBe("final");
  });

  it("sends the signed transaction of a step and nothing else, also from a plan resumed from its JSON", async () => {
    await Crypto.ready();
    const { emulator, builder, wallet } = await stepSetup("scalus");
    const plan = await planOf(
      builder,
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet },
    );
    await plan.sign();
    let drop = true;
    const submitter = submitterOf(async (tx) => {
      if (drop) {
        drop = false;
        throw new Error("socket hang up");
      }
      return emulator.submitTx(tx);
    });
    expect((await caught(plan.run({ submitter }))).code).toBe("SUBMIT_FAILED");
    const resumed = await resumeStepPlan(
      builderOf(builder.provider!, { evaluator: emulator }),
      plan.toJSON(),
    );
    await resumed.run({ submitter });
    expect(resumed.status).toBe("final");
    const payerKey = (await signedKeyHashes(resumed.step("a").signedTx!))[0];
    expect(submitter.calls).toHaveLength(3);
    for (const tx of submitter.calls) {
      const step = resumed.steps.find(
        (each) => each.txHash === bodyHashOf(tx),
      )!;
      expect(step).toBeDefined();
      expect(tx).toBe(step.signedTx);
      expect(await signedKeyHashes(tx)).toEqual([payerKey]);
    }
    expect(submitter.calls[1]).toBe(submitter.calls[0]);
  });
});
