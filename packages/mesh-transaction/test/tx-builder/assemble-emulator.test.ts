import { mConStr0, resolveScriptHash } from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  assembleTxPrototype,
  collateral,
  collateralReturn,
  mint,
  output,
  OutputDatum,
  OutputScript,
  spend,
  Utxo,
} from "../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  mintParamCbor,
} from "../test-util";
import { asMesh } from "./utxo-util";

const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const exUnits = { mem: 1_000_000, steps: 400_000_000 };
const plutusRef: OutputScript = {
  type: "plutus",
  version: "V3",
  code: alwaysSucceedCbor,
  hash: alwaysSucceedHash,
};
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};

/*
 * Transactions assembled by hand, with a generous fixed fee, and submitted to the emulator: the
 * ledger rules check every redeemer index, the script data hash and the collateral return.
 */
describe("assembleTxPrototype on the emulator", () => {
  it("assembles a transaction the ledger accepts: script spends, mints, collateral return", async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    const address = (await wallet.getChangeAddress())!;
    const at = (
      txHash: string,
      outputIndex: number,
      addr: string,
      lovelace: bigint,
      extra: Partial<Utxo> = {},
    ): Utxo => ({
      txHash,
      outputIndex,
      address: addr,
      value: { lovelace },
      ...extra,
    });
    const funds = at("0".repeat(64), 0, address, 100_000_000n);
    const collateralUtxo = at("1".repeat(64), 0, address, 5_000_000n);
    // Script outputs whose out refs sort differently from the order they are given in
    const locked = [
      at("2".repeat(64), 2, scriptAddress, 10_000_000n, { datum: unitInline }),
      at("2".repeat(64), 0, scriptAddress, 10_000_000n, { datum: unitInline }),
      at("2".repeat(64), 1, scriptAddress, 10_000_000n, { datum: unitInline }),
    ];
    const reference = at("3".repeat(64), 0, address, 20_000_000n, {
      script: plutusRef,
    });
    const provider = await ScalusEmulator.create(
      [funds, collateralUtxo, ...locked, reference].map(asMesh),
    );

    const fee = 2_000_000n;
    const policies = [7, 3].map((n) => ({
      script: { code: mintParamCbor(n), version: "V3" as const },
      n,
    }));
    const parts = [
      ...locked.map((utxo, i) =>
        spend.plutus({
          utxo,
          script: { reference },
          redeemer: { data: mConStr0([i]), exUnits },
        }),
      ),
      spend.pubKey({ utxo: funds }),
      ...policies.map(({ script, n }) =>
        mint.plutus({
          script,
          redeemer: { data: n, exUnits },
          assets: { "01": 5n },
        }),
      ),
      output({
        address,
        value: {
          lovelace: 130_000_000n - fee,
          ...Object.fromEntries(
            policies.map(({ script }) => [
              `${resolveScriptHash(script.code, "V3")}01`,
              5n,
            ]),
          ),
        },
      }),
      collateral({ utxo: collateralUtxo }),
      collateralReturn({ address, totalCollateral: 3_000_000n }),
    ];

    const { prototype, redeemers } = assembleTxPrototype(parts, {
      fee,
      costModels: await provider.fetchCostModels(),
    });
    const txHex = transactionPrototypeToHex(prototype);

    // The evaluator finds a script behind every redeemer pointer
    const evaluated = await provider.evaluateTx(txHex);
    expect(evaluated.map((r) => `${r.tag}:${r.index}`).sort()).toEqual(
      redeemers.map((r) => `${r.tag}:${r.index}`).sort(),
    );

    const txHash = await provider.submitTx(await wallet.signTx(txHex));
    expect(txHash).toHaveLength(64);
    const returned = await provider.fetchUTxOs(txHash);
    expect(returned).toHaveLength(1);
  });
});
