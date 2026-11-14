import { mConStr0, MeshTxBuilderBody, UTxO } from "@meshsdk/common";
import { CSLSerializer } from "@meshsdk/core-csl";
import { MeshWallet } from "@meshsdk/wallet";

import { MeshTxBuilder, Transaction, utxoToTxIn } from "../../src";
import { resetWarnings } from "../../src/mesh-tx-builder/warnings";
import { alwaysSucceedCbor, baseAddress } from "../test-util";
import {
  accept,
  enoughUnits,
  lovelace,
  parse,
  Setup,
  setup,
  unitsOf,
  utxoAt,
  walletOf,
  words,
} from "./legacy-adapter-util";

/** The out ref of a UTxO as `DUPLICATE_PART` names it */
const outRefOf = (utxo: UTxO) =>
  `${utxo.input.txHash}#${utxo.input.outputIndex}`;

/** The error a call throws or rejects with */
const refusal = async (call: () => unknown) => {
  try {
    await call();
  } catch (error) {
    return error as { code?: string; details?: unknown; message?: string };
  }
  throw new Error("expected an error");
};

/** The four complete methods, each on the builder the queue makes */
const completeMethods = [
  "complete",
  "completeUnbalanced",
  "completeSync",
  "completeUnbalancedSync",
] as const;

const run = async (
  builder: MeshTxBuilder,
  method: (typeof completeMethods)[number],
): Promise<string> =>
  method === "complete" ? builder.complete() : builder[method]();

type TxInArgs = Parameters<MeshTxBuilder["txIn"]>;

/**
 * Spends a locked output with the always-succeeding script; `entry` is true to name its amount
 * and address, false to name its out ref alone, or the arguments of `txIn`
 */
const spendLocked = (
  builder: MeshTxBuilder,
  locked: UTxO,
  entry: boolean | TxInArgs,
  { redeemer = 0, exUnits = enoughUnits } = {},
) =>
  builder
    .spendingPlutusScriptV3()
    .txIn(
      ...((entry === true
        ? utxoToTxIn(locked)
        : entry === false
          ? [locked.input.txHash, locked.input.outputIndex]
          : entry) as TxInArgs),
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(mConStr0([redeemer]), "Mesh", exUnits)
    .txInScript(alwaysSucceedCbor);

/** The inputs of the body with the out ref of a UTxO */
const entriesOf = (body: MeshTxBuilderBody, utxo: UTxO) =>
  body.inputs.filter(
    (input) =>
      input.txIn.txHash === utxo.input.txHash &&
      input.txIn.txIndex === utxo.input.outputIndex,
  );

/** The body of a builder with every queued item in it */
const bodyOf = (builder: MeshTxBuilder) => {
  (builder as unknown as { queueAllLastItem(): void }).queueAllLastItem();
  return builder.meshTxBuilderBody;
};

const collateralInputsOf = (txHex: string) =>
  parse(txHex).body().collateral()?.values() ?? [];

describe.each(["scalus", "cquisitor"] as const)(
  "MeshTxBuilder's repeats of an input and of collateral, on TxEmulator (%s)",
  (validator) => {
    beforeEach(() => resetWarnings());

    describe("an input", () => {
      it("named in full and bare, in either order, is one input in every complete method", async () => {
        for (const fullFirst of [true, false]) {
          const make = (builder: MeshTxBuilder, { address, funds }: Setup) => {
            const full = utxoToTxIn(funds);
            const bare = [funds.input.txHash, funds.input.outputIndex] as const;
            return (
              fullFirst
                ? builder.txIn(...full).txIn(...bare)
                : builder.txIn(...bare).txIn(...full)
            )
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address);
          };

          // Read through the fetcher, and built from the declared data without one
          for (const fetched of [true, false]) {
            const context = await setup(validator);
            const txHex = await make(
              new MeshTxBuilder(fetched ? { fetcher: context.emulator } : {}),
              context,
            ).complete();
            expect(parse(txHex).body().inputs().size()).toBe(1);
            await accept(context, txHex);
          }
          const context = await setup(validator);
          for (const method of completeMethods.slice(1)) {
            const txHex = await run(make(new MeshTxBuilder(), context), method);
            const inputs = parse(txHex).body().inputs().values();
            expect(inputs.map((i) => i.transactionId().toString())).toEqual([
              context.funds.input.txHash,
            ]);
          }

          // Queries see the queued items only
          const queried = make(new MeshTxBuilder(), context);
          expect(bodyOf(queried).inputs).toHaveLength(2);
          expect(queried.calculateFee()).toBeGreaterThan(0n);
        }
      });

      it("named in full and by its out ref alone, with the hash in another case or fields left empty, is one input", async () => {
        const { emulator, address, funds } = await setup(validator);
        const [hash, index, amount, at] = utxoToTxIn(funds);
        const queues: ((b: MeshTxBuilder) => MeshTxBuilder)[] = [
          (b) =>
            b.txIn(hash.toUpperCase(), index, amount, at, 0).txIn(hash, index),
          (b) =>
            b.txIn(hash, index).txIn(hash.toUpperCase(), index, amount, at, 0),
          (b) => b.txIn(hash, index, amount, at, 0).txIn(hash, index, [], ""),
          (b) => b.txIn(hash, index, [], "").txIn(hash, index, amount, at, 0),
        ];
        for (const queue of queues) {
          const make = (builder: MeshTxBuilder) =>
            queue(builder)
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address);
          const txHexes = [
            await make(new MeshTxBuilder({ fetcher: emulator })).complete(),
            await make(new MeshTxBuilder()).complete(),
            make(new MeshTxBuilder()).completeSync(),
          ];
          for (const txHex of txHexes)
            expect(
              parse(txHex)
                .body()
                .inputs()
                .values()
                .map((i) => i.transactionId().toString().toLowerCase()),
            ).toEqual([hash.toLowerCase()]);
        }
      });

      it("named by utxoToTxIn and by hand without a script size is one input", async () => {
        const context = await setup(validator);
        const { emulator, address, funds } = context;
        const make = (builder: MeshTxBuilder) =>
          builder
            .txIn(...utxoToTxIn(funds))
            .txIn(
              funds.input.txHash,
              funds.input.outputIndex,
              funds.output.amount,
              funds.output.address,
            )
            .txOut(address, lovelace(5_000_000))
            .changeAddress(address);
        const txHex = await make(
          new MeshTxBuilder({ fetcher: emulator }),
        ).complete();
        expect(parse(txHex).body().inputs().size()).toBe(1);
        await accept(context, txHex);
        expect(
          parse(make(new MeshTxBuilder()).completeSync())
            .body()
            .inputs()
            .size(),
        ).toBe(1);
      });

      it("of a Plutus script named in full and bare is one input with one redeemer, and the body keeps the evaluated units", async () => {
        for (const fullFirst of [true, false]) {
          const context = await setup(validator);
          const { emulator, address, funds, locked } = context;
          const builder = new MeshTxBuilder({
            fetcher: emulator,
            evaluator: emulator,
          });
          spendLocked(builder, locked, fullFirst);
          spendLocked(builder, locked, !fullFirst);
          const txHex = await builder
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
          const body = parse(txHex).body();
          expect(
            body
              .inputs()
              .values()
              .filter(
                (i) => i.transactionId().toString() === locked.input.txHash,
              ),
          ).toHaveLength(1);
          const units = unitsOf(txHex);
          expect(units).toHaveLength(1);
          expect(units[0]).not.toEqual(enoughUnits);
          await accept(context, txHex);

          // The body holds one entry for the out ref, with the declared data and the units
          const entries = entriesOf(builder.meshTxBuilderBody, locked);
          expect(entries).toHaveLength(1);
          const [entry] = entries;
          expect(entry!.txIn).toMatchObject({
            amount: locked.output.amount,
            address: locked.output.address,
          });
          expect(
            entry!.type === "Script" && entry!.scriptTxIn.redeemer?.exUnits,
          ).toEqual(units[0]);
          const again = new MeshTxBuilder().completeSync(
            builder.meshTxBuilderBody,
          );
          expect(unitsOf(again)).toEqual(units);
        }

        // Without an evaluator, both orders give one redeemer in every complete method
        const { emulator, address, funds, locked } = await setup(validator);
        for (const fullFirst of [true, false])
          for (const method of completeMethods) {
            const builder = new MeshTxBuilder({
              fetcher: emulator,
              evaluator: null,
            });
            spendLocked(builder, locked, fullFirst);
            spendLocked(builder, locked, !fullFirst);
            const txHex = await run(
              builder.changeAddress(address).selectUtxosFrom([funds]),
              method,
            );
            expect(unitsOf(txHex)).toEqual([enoughUnits]);
          }
      });

      it("named by an entry with the amount and one with the address, in either order, is the input the single call gives", async () => {
        for (const amountFirst of [true, false]) {
          const context = await setup(validator);
          const { emulator, address, funds } = context;
          const [hash, index, amount, at] = utxoToTxIn(funds);
          const finish = (builder: MeshTxBuilder) =>
            builder.txOut(address, lovelace(5_000_000)).changeAddress(address);
          const make = (builder: MeshTxBuilder, size?: number) =>
            finish(
              amountFirst
                ? builder
                    .txIn(hash, index, amount)
                    .txIn(hash, index, undefined, at, size)
                : builder
                    .txIn(hash, index, undefined, at, size)
                    .txIn(hash, index, amount),
            );

          const txHex = await make(
            new MeshTxBuilder({ fetcher: emulator, evaluator: emulator }),
          ).complete();
          expect(parse(txHex).body().inputs().size()).toBe(1);
          await accept(context, txHex);

          for (const method of completeMethods.slice(1))
            expect(await run(make(new MeshTxBuilder()), method)).toBe(
              await run(
                finish(new MeshTxBuilder().txIn(hash, index, amount, at)),
                method,
              ),
            );
          const queried = make(new MeshTxBuilder());
          expect(bodyOf(queried).inputs).toHaveLength(2);
          expect(queried.calculateFee()).toBeGreaterThan(0n);

          // The translation fills a copy: the body keeps both entries as they were queued
          const repeated = make(new MeshTxBuilder());
          const queued = structuredClone(bodyOf(repeated).inputs);
          for (const method of completeMethods.slice(1))
            await run(repeated, method);
          repeated.calculateFee();
          repeated.getSerializedSize();
          expect(repeated.meshTxBuilderBody.inputs).toEqual(queued);
          expect(queued.map((input) => input.txIn)).toEqual(
            amountFirst
              ? [
                  { txHash: hash, txIndex: index, amount },
                  { txHash: hash, txIndex: index, address: at },
                ]
              : [
                  { txHash: hash, txIndex: index, address: at },
                  { txHash: hash, txIndex: index, amount },
                ],
          );

          // Without a fetcher the union still lacks the script size, as the single call does
          expect(
            await refusal(() => make(new MeshTxBuilder()).complete()),
          ).toMatchObject({ code: "MISSING_FETCHER" });
          const sized = await setup(validator);
          const built = await make(new MeshTxBuilder(), 0).complete();
          expect(parse(built).body().inputs().size()).toBe(1);
          await accept(sized, built);
        }
      });

      it("named by three entries naming one field each, in any order, is the input the single call gives", async () => {
        const { address, funds } = await setup(validator);
        const [hash, index, amount, at] = utxoToTxIn(funds);
        const finish = (builder: MeshTxBuilder) =>
          builder.txOut(address, lovelace(5_000_000)).changeAddress(address);
        const single = finish(
          new MeshTxBuilder().txIn(hash, index, amount, at, 0),
        ).completeSync();
        const entries: TxInArgs[] = [
          [hash, index, amount],
          [hash, index, undefined, at],
          [hash, index, undefined, undefined, 0],
        ];
        const orders = [
          [0, 1, 2],
          [0, 2, 1],
          [1, 0, 2],
          [1, 2, 0],
          [2, 0, 1],
          [2, 1, 0],
        ];
        for (const order of orders) {
          const builder = new MeshTxBuilder();
          for (const i of order) builder.txIn(...entries[i]!);
          expect(finish(builder).completeSync()).toBe(single);
        }
      });

      it("named by entries that together still lack the address is UNRESOLVED without a request, and read with a fetcher", async () => {
        for (const amountFirst of [true, false]) {
          const context = await setup(validator);
          const { emulator, address, funds } = context;
          const [hash, index, amount] = utxoToTxIn(funds);
          const make = (builder: MeshTxBuilder) =>
            (amountFirst
              ? builder
                  .txIn(hash, index, amount)
                  .txIn(hash, index, undefined, undefined, 0)
              : builder
                  .txIn(hash, index, undefined, undefined, 0)
                  .txIn(hash, index, amount)
            )
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address);
          for (const method of completeMethods.slice(1))
            expect(
              await refusal(() => run(make(new MeshTxBuilder()), method)),
            ).toMatchObject({ code: "UNRESOLVED" });
          for (const query of [
            "calculateFee",
            "calculateRedeemersFee",
            "getSerializedSize",
            "serializeMockTx",
          ] as const) {
            const queried = make(new MeshTxBuilder());
            expect(bodyOf(queried).inputs).toHaveLength(2);
            expect(await refusal(() => queried[query]())).toMatchObject({
              code: "UNRESOLVED",
            });
          }
          const txHex = await make(
            new MeshTxBuilder({ fetcher: emulator }),
          ).complete();
          expect(parse(txHex).body().inputs().size()).toBe(1);
          await accept(context, txHex);
        }
      });

      it("of a Plutus script named by an entry with the amount and one with the address is one input with one redeemer, and the body keeps the evaluated units", async () => {
        for (const amountFirst of [true, false]) {
          const context = await setup(validator);
          const { emulator, address, funds, locked } = context;
          const [hash, index, amount, at] = utxoToTxIn(locked);
          const entries: TxInArgs[] = [
            [hash, index, amount],
            [hash, index, undefined, at],
          ];
          if (!amountFirst) entries.reverse();
          const builder = new MeshTxBuilder({
            fetcher: emulator,
            evaluator: emulator,
          });
          for (const entry of entries) spendLocked(builder, locked, entry);
          const txHex = await builder
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
          expect(
            parse(txHex)
              .body()
              .inputs()
              .values()
              .filter((i) => i.transactionId().toString() === hash),
          ).toHaveLength(1);
          const units = unitsOf(txHex);
          expect(units).toHaveLength(1);
          expect(units[0]).not.toEqual(enoughUnits);
          await accept(context, txHex);

          // The body holds one entry for the out ref, with both fields and the units
          const entriesAfter = entriesOf(builder.meshTxBuilderBody, locked);
          expect(entriesAfter).toHaveLength(1);
          const [entry] = entriesAfter;
          expect(entry!.txIn).toMatchObject({ amount, address: at });
          expect(
            entry!.type === "Script" && entry!.scriptTxIn.redeemer?.exUnits,
          ).toEqual(units[0]);
          const again = new MeshTxBuilder().completeSync(
            builder.meshTxBuilderBody,
          );
          expect(unitsOf(again)).toEqual(units);
        }
      });

      it("of a script named plainly with the amount next to a script entry with the address is still refused", async () => {
        const { emulator, address, funds, locked } = await setup(validator);
        const [hash, index, amount, at] = utxoToTxIn(locked);
        for (const plainFirst of [true, false])
          for (const method of completeMethods) {
            const builder = new MeshTxBuilder({ fetcher: emulator });
            if (plainFirst) builder.txIn(hash, index, amount);
            spendLocked(builder, locked, [hash, index, undefined, at]);
            if (!plainFirst) builder.txIn(hash, index, amount);
            const error = await refusal(() =>
              run(
                builder.changeAddress(address).selectUtxosFrom([funds]),
                method,
              ),
            );
            // complete() reads the plain copy's output: a key spend of a script-locked output
            expect(error).toMatchObject(
              method === "complete"
                ? { code: "WITNESS_MISMATCH" }
                : {
                    code: "DUPLICATE_PART",
                    details: { item: outRefOf(locked) },
                  },
            );
          }
      });

      it("given twice with data that differs is still DUPLICATE_PART in every complete method", async () => {
        const { address, funds, locked } = await setup(validator);
        const [hash, index, amount, at] = utxoToTxIn(funds);
        const plain = (other: (b: MeshTxBuilder) => MeshTxBuilder) => () =>
          other(new MeshTxBuilder().txIn(hash, index, amount, at, 0));
        const script =
          (other: { redeemer?: number; exUnits?: typeof enoughUnits }) =>
          () => {
            const builder = new MeshTxBuilder();
            spendLocked(builder, locked, true);
            return spendLocked(builder, locked, true, other);
          };
        const cases: [string, () => MeshTxBuilder, UTxO][] = [
          [
            "amount",
            plain((b) => b.txIn(hash, index, lovelace(1), at, 0)),
            funds,
          ],
          [
            "address",
            plain((b) => b.txIn(hash, index, amount, baseAddress(1), 0)),
            funds,
          ],
          [
            "script size",
            plain((b) => b.txIn(hash, index, amount, at, 10)),
            funds,
          ],
          // Complementary in the address, different in the amount
          [
            "amount, and another amount with the address",
            () =>
              new MeshTxBuilder()
                .txIn(hash, index, amount)
                .txIn(hash, index, lovelace(1), at),
            funds,
          ],
          // The amount first named by the second entry is compared with the third
          [
            "address only, then one amount, then another",
            () =>
              new MeshTxBuilder()
                .txIn(hash, index, undefined, at)
                .txIn(hash, index, amount)
                .txIn(hash, index, lovelace(1)),
            funds,
          ],
          ["redeemer", script({ redeemer: 1 }), locked],
          [
            "execution units",
            script({ exUnits: { mem: 1, steps: 1 } }),
            locked,
          ],
        ];
        for (const [, make, utxo] of cases)
          for (const method of completeMethods) {
            const builder = make()
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address);
            const queued = structuredClone(bodyOf(builder).inputs);
            const error = await refusal(() => run(builder, method));
            expect(error).toMatchObject({
              code: "DUPLICATE_PART",
              details: { item: outRefOf(utxo) },
            });
            expect(error.message).toMatch(/input .* given twice/);
            // A refused group leaves the body's entries as they were queued
            expect(builder.meshTxBuilderBody.inputs).toEqual(queued);
          }
      });

      it("given in full twice with data that differs, and bare, is DUPLICATE_PART and not UNRESOLVED", async () => {
        const { address, funds } = await setup(validator);
        const [hash, index, amount, at] = utxoToTxIn(funds);
        const make = () =>
          new MeshTxBuilder()
            .txIn(hash, index, amount, at, 0)
            .txIn(hash, index, lovelace(1), at, 0)
            .txIn(hash, index)
            .txOut(address, lovelace(5_000_000))
            .changeAddress(address);
        for (const method of completeMethods)
          expect(await refusal(() => run(make(), method))).toMatchObject({
            code: "DUPLICATE_PART",
            details: { item: outRefOf(funds) },
          });
        for (const query of [
          "calculateFee",
          "calculateRedeemersFee",
          "getSerializedSize",
          "serializeMockTx",
        ] as const) {
          const queried = make();
          expect(bodyOf(queried).inputs).toHaveLength(3);
          expect(await refusal(() => queried[query]())).toMatchObject({
            code: "DUPLICATE_PART",
            details: { item: outRefOf(funds) },
          });
        }
      });

      it("of a script named plainly next to its script entry is still refused", async () => {
        const { emulator, address, funds, locked } = await setup(validator);
        const make = (builder: MeshTxBuilder, plainFull: boolean) => {
          builder.txIn(
            ...((plainFull
              ? utxoToTxIn(locked)
              : [locked.input.txHash, locked.input.outputIndex]) as [
              string,
              number,
            ]),
          );
          return spendLocked(builder, locked, true)
            .changeAddress(address)
            .selectUtxosFrom([funds]);
        };
        // The plain copy is refused on its own where its output is known: a key spend of a
        // script-locked output
        expect(
          await refusal(() =>
            make(new MeshTxBuilder({ fetcher: emulator }), false).complete(),
          ),
        ).toMatchObject({ code: "WITNESS_MISMATCH" });
        expect(
          await refusal(() => make(new MeshTxBuilder(), true).completeSync()),
        ).toMatchObject({ code: "WITNESS_MISMATCH" });
        // A bare plain copy is not covered by the script entry
        for (const method of completeMethods)
          expect(
            await refusal(() => run(make(new MeshTxBuilder(), false), method)),
          ).toMatchObject({
            code: "DUPLICATE_PART",
            details: { item: outRefOf(locked) },
          });
      });

      it("leaves a withdrawal repeated with another amount DUPLICATE_PART", async () => {
        const { address } = await setup(validator);
        const [rewardAddress] = await (await walletOf()).getRewardAddresses();
        const make = () =>
          new MeshTxBuilder({ evaluator: null })
            .txIn("c".repeat(64), 0, lovelace(10_000_000), address, 0)
            .withdrawal(rewardAddress!, "0")
            .withdrawal(rewardAddress!, "1")
            .changeAddress(address);
        for (const method of completeMethods)
          expect(await refusal(() => run(make(), method))).toMatchObject({
            code: "DUPLICATE_PART",
            details: { item: rewardAddress },
          });
      });
    });

    describe("a collateral input", () => {
      it("named twice is one collateral input, its return the input less the total: accepted", async () => {
        for (const serializer of [undefined, new CSLSerializer()]) {
          const context = await setup(validator);
          const { emulator, address, funds, locked } = context;
          const c = emulator.fund(address, { lovelace: 10_000_000n });
          const [hash, index, amount, at] = utxoToTxIn(c);
          const builder = new MeshTxBuilder({
            fetcher: emulator,
            ...(serializer && { serializer }),
          });
          spendLocked(builder, locked, false);
          const txHex = await builder
            .txInCollateral(hash, index, amount, at)
            .txInCollateral(hash, index, amount, at)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
          expect(
            collateralInputsOf(txHex).map((i) => i.transactionId().toString()),
          ).toEqual([c.input.txHash]);
          const body = parse(txHex).body();
          expect(body.collateralReturn()!.amount().coin()).toBe(
            10_000_000n - body.totalCollateral()!,
          );
          await accept(context, txHex);
        }
      });

      it("named bare and declared, in either order, is one collateral input", async () => {
        for (const bareFirst of [true, false]) {
          const context = await setup(validator);
          const { emulator, address, funds, locked } = context;
          const c = emulator.fund(address, { lovelace: 10_000_000n });
          const [hash, index, amount, at] = utxoToTxIn(c);
          const queue = (b: MeshTxBuilder) =>
            bareFirst
              ? b
                  .txInCollateral(hash, index)
                  .txInCollateral(hash, index, amount, at)
              : b
                  .txInCollateral(hash, index, amount, at)
                  .txInCollateral(hash, index);
          const make = (builder: MeshTxBuilder) =>
            queue(spendLocked(builder, locked, true))
              .changeAddress(address)
              .selectUtxosFrom([funds]);
          const txHex = await make(
            new MeshTxBuilder({ fetcher: emulator }),
          ).complete();
          expect(collateralInputsOf(txHex)).toHaveLength(1);
          await accept(context, txHex);
          // The bare copy alone would have no amount or address here
          expect(
            collateralInputsOf(make(new MeshTxBuilder()).completeSync()),
          ).toHaveLength(1);
        }
      });

      it("named in full and by its out ref alone, with the hash in another case or fields left empty, is one collateral input", async () => {
        const { emulator, address, funds, locked } = await setup(validator);
        const c = emulator.fund(address, { lovelace: 10_000_000n });
        const [hash, index, amount, at] = utxoToTxIn(c);
        const upper = hash.toUpperCase();
        const queues: ((b: MeshTxBuilder) => MeshTxBuilder)[] = [
          (b) =>
            b
              .txInCollateral(upper, index, amount, at)
              .txInCollateral(hash, index),
          (b) =>
            b
              .txInCollateral(hash, index)
              .txInCollateral(upper, index, amount, at),
          (b) =>
            b
              .txInCollateral(hash, index, amount, at)
              .txInCollateral(hash, index, [], ""),
          (b) =>
            b
              .txInCollateral(hash, index, [], "")
              .txInCollateral(hash, index, amount, at),
        ];
        for (const queue of queues) {
          const make = (builder: MeshTxBuilder) =>
            queue(spendLocked(builder, locked, true))
              .changeAddress(address)
              .selectUtxosFrom([funds]);
          const txHexes = [
            await make(new MeshTxBuilder({ fetcher: emulator })).complete(),
            make(new MeshTxBuilder()).completeSync(),
          ];
          for (const txHex of txHexes)
            expect(
              collateralInputsOf(txHex).map((i) =>
                i.transactionId().toString().toLowerCase(),
              ),
            ).toEqual([hash.toLowerCase()]);
        }
      });

      it("named by an entry with the amount and one with the address, in either order, is one collateral input", async () => {
        for (const serializer of [undefined, new CSLSerializer()])
          for (const amountFirst of [true, false]) {
            const context = await setup(validator);
            const { emulator, address, funds, locked } = context;
            const c = emulator.fund(address, { lovelace: 10_000_000n });
            const [hash, index, amount, at] = utxoToTxIn(c);
            const queue = (b: MeshTxBuilder) =>
              amountFirst
                ? b
                    .txInCollateral(hash, index, amount)
                    .txInCollateral(hash, index, undefined, at)
                : b
                    .txInCollateral(hash, index, undefined, at)
                    .txInCollateral(hash, index, amount);
            const make = (builder: MeshTxBuilder) =>
              queue(spendLocked(builder, locked, true))
                .changeAddress(address)
                .selectUtxosFrom([funds]);

            const completed = make(
              new MeshTxBuilder({
                fetcher: emulator,
                ...(serializer && { serializer }),
              }),
            );
            const queued = structuredClone(bodyOf(completed).collaterals);
            expect(queued).toHaveLength(2);
            const txHex = await completed.complete();
            expect(
              collateralInputsOf(txHex).map((i) =>
                i.transactionId().toString(),
              ),
            ).toEqual([hash]);
            const body = parse(txHex).body();
            expect(body.collateralReturn()!.amount().coin()).toBe(
              10_000_000n - body.totalCollateral()!,
            );
            await accept(context, txHex);
            // The translation fills a copy: the body keeps both entries as they were queued
            expect(completed.meshTxBuilderBody.collaterals).toEqual(queued);

            const synced = make(new MeshTxBuilder()).setTotalCollateral(
              "5000000",
            );
            for (const method of completeMethods.slice(1)) {
              const built = await run(synced, method);
              expect(collateralInputsOf(built)).toHaveLength(1);
              expect(
                parse(built).body().collateralReturn()!.amount().coin(),
              ).toBe(5_000_000n);
            }
            synced.calculateFee();
            expect(synced.meshTxBuilderBody.collaterals).toEqual(queued);
          }
      });

      it("named twice that cannot cover the required collateral is still INSUFFICIENT_COLLATERAL", async () => {
        const { emulator, address, funds, locked } = await setup(validator);
        // Twice its value would cover the requirement; once it does not
        const c = emulator.fund(address, { lovelace: 200_000n });
        const [hash, index, amount, at] = utxoToTxIn(c);
        const builder = spendLocked(
          new MeshTxBuilder({ fetcher: emulator }),
          locked,
          true,
        )
          .txInCollateral(hash, index, amount, at)
          .txInCollateral(hash, index, amount, at)
          .changeAddress(address)
          .selectUtxosFrom([funds]);
        expect(await refusal(() => builder.complete())).toMatchObject({
          code: "INSUFFICIENT_COLLATERAL",
        });
      });

      it("named once that cannot cover the required collateral is INSUFFICIENT_COLLATERAL, with UTxOs to select that could top it up", async () => {
        const { emulator, address, funds, locked } = await setup(validator);
        const c = emulator.fund(address, { lovelace: 200_000n });
        const [hash, index, amount, at] = utxoToTxIn(c);
        const builder = spendLocked(
          new MeshTxBuilder({ fetcher: emulator }),
          locked,
          true,
        )
          .txInCollateral(hash, index, amount, at)
          .changeAddress(address)
          .selectUtxosFrom([funds]);
        const error = await refusal(() => builder.complete());
        expect(error).toMatchObject({
          code: "INSUFFICIENT_COLLATERAL",
          details: { available: 200_000n },
        });
        expect(error.message).toContain("the collateral inputs cannot cover");
        expect(error.message).not.toContain("added to them");
      });

      it("named twice with a total collateral returns the input less the total in the synchronous methods", async () => {
        const { address, locked } = await setup(validator);
        const c = utxoAt("e".repeat(64), address, 10_000_000n);
        const [hash, index, amount, at] = utxoToTxIn(c);
        for (const method of completeMethods.slice(1)) {
          const builder = spendLocked(new MeshTxBuilder(), locked, true)
            .txInCollateral(hash, index, amount, at)
            .txInCollateral(hash, index, amount, at)
            .setTotalCollateral("5000000")
            .changeAddress(address);
          const txHex = await run(builder, method);
          expect(collateralInputsOf(txHex)).toHaveLength(1);
          const body = parse(txHex).body();
          expect(body.totalCollateral()).toBe(5_000_000n);
          expect(body.collateralReturn()!.amount().coin()).toBe(5_000_000n);
        }
      });

      it("given twice with another amount or address, also next to an entry it complements, is DUPLICATE_PART in every complete method", async () => {
        const { address, locked } = await setup(validator);
        const c = utxoAt("e".repeat(64), address, 10_000_000n);
        const [hash, index, amount, at] = utxoToTxIn(c);
        // The last pair: complementary in the address, different in the amount
        const pairs: [
          Parameters<MeshTxBuilder["txInCollateral"]>,
          typeof amount | undefined,
          string | undefined,
        ][] = [
          [[hash, index, amount, at], lovelace(9_000_000), at],
          [[hash, index, amount, at], amount, baseAddress(1)],
          [[hash, index, amount], lovelace(9_000_000), at],
        ];
        for (const [first, otherAmount, otherAddress] of pairs)
          for (const method of completeMethods) {
            const builder = spendLocked(new MeshTxBuilder(), locked, true)
              .txInCollateral(...first)
              .txInCollateral(hash, index, otherAmount, otherAddress)
              .setTotalCollateral("5000000")
              .changeAddress(address);
            const error = await refusal(() => run(builder, method));
            expect(error).toMatchObject({
              code: "DUPLICATE_PART",
              details: { item: outRefOf(c) },
            });
            expect(error.message).toMatch(/collateral input .* given twice/);
          }
      });

      it("given to Transaction.setCollateral and by the initiator's own collateral is one: accepted", async () => {
        const context = await setup(validator);
        const { emulator, locked } = context;
        const wallet = new MeshWallet({
          networkId: 0,
          key: { type: "mnemonic", words },
          fetcher: emulator,
        });
        await wallet.init();
        const [c] = await wallet.getCollateral();
        const make = () =>
          new Transaction({ initiator: wallet, fetcher: emulator })
            .redeemValue({
              value: locked,
              script: { code: alwaysSucceedCbor, version: "V3" },
            })
            .setCollateral([c!]);
        const built = await make().build();
        expect(
          collateralInputsOf(built).map((i) => i.transactionId().toString()),
        ).toEqual([c!.input.txHash]);
        await accept(context, built);
        expect(collateralInputsOf(await make().build(false))).toHaveLength(1);
      });
    });
  },
);
