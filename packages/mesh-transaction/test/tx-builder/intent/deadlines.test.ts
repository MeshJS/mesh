import { customNetwork, DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/core";

import {
  IntentDeadlines,
  TxBuilder,
  TxBuilderOptions,
  TxBuildError,
  TxError,
  WaitOptions,
} from "../../../src/tx-builder";
import {
  DEFAULT_DEADLINES,
  effectiveDeadlines,
  effectiveWait,
  horizonSlot,
} from "../../../src/tx-builder/intent/deadlines";

const params = { ...DEFAULT_PROTOCOL_PARAMETERS };

const builderWith = (intentDefaults: unknown) =>
  new TxBuilder({
    network: "preprod",
    params,
    intentDefaults: intentDefaults as TxBuilderOptions["intentDefaults"],
  });

/** The error a call throws, which must be INVALID_OPTION */
const invalidOption = (run: () => unknown) => {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(TxError.is(thrown, "INVALID_OPTION")).toBe(true);
  return thrown as TxBuildError<"INVALID_OPTION">;
};

describe("TxBuilder: intentDefaults", () => {
  it.each([
    { defaults: { pollMs: 0 }, option: "pollMs", value: 0 },
    { defaults: { pollMs: -5 }, option: "pollMs", value: -5 },
    {
      defaults: { pollMs: 1_000, resendMs: 999 },
      option: "resendMs",
      value: 999,
    },
    // Against the default pollMs of 5 000
    { defaults: { resendMs: 10 }, option: "resendMs", value: 10 },
    {
      defaults: { resendMs: Infinity },
      option: "resendMs",
      value: Infinity,
    },
    { defaults: { confirmations: 1.5 }, option: "confirmations", value: 1.5 },
    { defaults: { confirmations: -1 }, option: "confirmations", value: -1 },
    {
      defaults: { confirmations: 2 ** 53 },
      option: "confirmations",
      value: 2 ** 53,
    },
    {
      defaults: { expiryMarginMs: -1 },
      option: "expiryMarginMs",
      value: -1,
    },
    { defaults: { ttlMs: NaN }, option: "ttlMs", value: NaN },
    { defaults: { ttlMs: 0 }, option: "ttlMs", value: 0 },
    { defaults: { ttlMs: "600000" }, option: "ttlMs", value: "600000" },
    { defaults: 5, option: "intentDefaults", value: 5 },
    { defaults: null, option: "intentDefaults", value: null },
  ])(
    "refuses $option = $value in the constructor",
    ({ defaults, option, value }) => {
      const error = invalidOption(() => builderWith(defaults));
      expect(error).toBeInstanceOf(TxBuildError);
      expect(error.details.option).toBe(option);
      expect(error.details.value).toEqual(value);
      expect(typeof error.details.allowed).toBe("string");
      expect(error.message).toContain(option);
    },
  );

  it("names the builder's pollMs in what resendMs allows", () => {
    expect(
      invalidOption(() => builderWith({ resendMs: 10 })).details.allowed,
    ).toContain("5000");
    expect(
      invalidOption(() => builderWith({ pollMs: 20, resendMs: 10 })).details
        .allowed,
    ).toContain("20");
  });

  it("accepts the values of the edges, and the emulator's test values", () => {
    for (const defaults of [
      { expiryMarginMs: 0, confirmations: 0, pollMs: 10, resendMs: 10 },
      { ttlMs: 1, pollMs: 0.5, resendMs: 0.5 },
      { resendMs: 5_000 },
      { pollMs: 300_000 },
      {},
    ])
      expect(builderWith(defaults).intentDefaults).toEqual(defaults);
    expect(builderWith(undefined).intentDefaults).toBeUndefined();
  });

  it("keeps a frozen copy of the members it knows", () => {
    const given = { ttlMs: 60_000, pollMs: 100, other: 1 };
    const builder = builderWith(given);
    given.ttlMs = 1;
    expect(builder.intentDefaults).toEqual({ ttlMs: 60_000, pollMs: 100 });
    expect(Object.isFrozen(builder.intentDefaults)).toBe(true);
  });

  it("is carried by add to the new builder", () => {
    const builder = builderWith({ confirmations: 3 });
    expect(builder.add().intentDefaults).toEqual({ confirmations: 3 });
  });
});

describe("intent deadlines", () => {
  it("are the intent's own, else the builder's, else 600 000, 600 000 and 30", () => {
    expect(effectiveDeadlines({}, undefined)).toEqual({
      ttlMs: 600_000,
      expiryMarginMs: 600_000,
      confirmations: 30,
    });
    expect(DEFAULT_DEADLINES).toEqual(effectiveDeadlines({}, {}));
    const defaults = { ttlMs: 1_000, expiryMarginMs: 0, confirmations: 0 };
    expect(effectiveDeadlines({}, defaults)).toEqual(defaults);
    expect(
      effectiveDeadlines({ confirmations: 5 }, { ...defaults, pollMs: 1 }),
    ).toEqual({ ttlMs: 1_000, expiryMarginMs: 0, confirmations: 5 });
    const own = { ttlMs: 5, expiryMarginMs: 6, confirmations: 7 };
    expect(effectiveDeadlines(own, defaults)).toEqual(own);
  });

  it.each<[IntentDeadlines, string]>([
    [{ ttlMs: 0 }, "ttlMs"],
    [{ ttlMs: -Infinity }, "ttlMs"],
    [{ expiryMarginMs: NaN }, "expiryMarginMs"],
    [{ confirmations: 0.5 }, "confirmations"],
  ])("refuses an intent's %o", (own, option) => {
    expect(
      invalidOption(() => effectiveDeadlines(own, undefined)).details.option,
    ).toBe(option);
  });
});

describe("intent waiting", () => {
  const deadlines = effectiveDeadlines({}, undefined);

  it("defaults to sent, 120 s, a poll of 5 s and a resend every 2 min", () => {
    expect(effectiveWait({}, deadlines, undefined)).toEqual({
      waitFor: "sent",
      timeoutMs: 120_000,
      pollMs: 5_000,
      resendMs: 120_000,
    });
  });

  it("waits confirmations × 30 s + 120 s for final, with the intent's confirmations", () => {
    expect(
      effectiveWait({ waitFor: "final" }, deadlines, undefined).timeoutMs,
    ).toBe(1_020_000);
    expect(
      effectiveWait(
        { waitFor: "final" },
        effectiveDeadlines({ confirmations: 180 }, undefined),
        { confirmations: 2 },
      ).timeoutMs,
    ).toBe(5_520_000);
    expect(
      effectiveWait({ waitFor: "final", timeoutMs: 7 }, deadlines, undefined)
        .timeoutMs,
    ).toBe(7);
  });

  it("takes pollMs from the call, else the builder; resendMs from the builder", () => {
    const defaults = { pollMs: 10, resendMs: 20 };
    expect(effectiveWait({}, deadlines, defaults)).toMatchObject(defaults);
    expect(
      effectiveWait({ pollMs: 50, waitFor: "included" }, deadlines, defaults),
    ).toEqual({
      waitFor: "included",
      timeoutMs: 120_000,
      pollMs: 50,
      resendMs: 20,
    });
  });

  it.each<[WaitOptions, string]>([
    [{ waitFor: "landed" as WaitOptions["waitFor"] }, "waitFor"],
    [{ timeoutMs: 0 }, "timeoutMs"],
    [{ timeoutMs: NaN }, "timeoutMs"],
    [{ pollMs: -1 }, "pollMs"],
    [{ pollMs: Infinity }, "pollMs"],
  ])("refuses the call's %o", (options, option) => {
    expect(
      invalidOption(() => effectiveWait(options, deadlines, undefined)).details
        .option,
    ).toBe(option);
  });
});

describe("the forecast horizon of Plutus deadlines", () => {
  const builder = (network: "mainnet" | "preprod" | "preview") =>
    new TxBuilder({ network, params });

  it("is 129 600 slots on mainnet and preprod, 25 920 on preview, from max(tip, from)", () => {
    expect(horizonSlot(builder("mainnet").network, 1_000)).toBe(130_600);
    expect(horizonSlot(builder("preprod").network, 1_000, 500)).toBe(130_600);
    expect(horizonSlot(builder("preprod").network, 1_000, 2_000)).toBe(131_600);
    expect(horizonSlot(builder("preview").network, 1_000)).toBe(26_920);
  });

  it("is not known for a custom network", () => {
    const network = customNetwork({
      systemStart: 0,
      slotLengthMs: 1_000,
      epochLength: 500,
    });
    expect(horizonSlot(network, 1_000)).toBeUndefined();
    expect(
      horizonSlot({ ...network, name: "constructor" }, 1_000),
    ).toBeUndefined();
  });
});
