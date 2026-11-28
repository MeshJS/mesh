import {
  ProviderError,
  ScriptEvaluationError,
  ScriptFailure,
  TxConfirmTimeoutError,
} from "@meshsdk/common";

const failure: ScriptFailure = {
  tag: "SPEND",
  index: 1,
  message: "the validator failed",
  logs: ["trace"],
  budget: { mem: 1, steps: 2 },
};

const makers = {
  TxConfirmTimeoutError: () => new TxConfirmTimeoutError("ab".repeat(32), 10),
  ProviderError: () => new ProviderError("down", { kind: "unavailable" }),
  ScriptEvaluationError: () => new ScriptEvaluationError("failed", [failure]),
};

const classes = {
  TxConfirmTimeoutError,
  ProviderError,
  ScriptEvaluationError,
};

type Name = keyof typeof classes;
const names = Object.keys(classes) as Name[];

class LateTimeout extends TxConfirmTimeoutError {}
class EmulatorProviderError extends ProviderError {}
class LocalEvaluationError extends ScriptEvaluationError {}

const subclassMakers: Record<Name, () => Error> = {
  TxConfirmTimeoutError: () => new LateTimeout("cd", 5),
  ProviderError: () =>
    new EmulatorProviderError("missing", { kind: "notFound" }),
  ScriptEvaluationError: () => new LocalEvaluationError("failed", []),
};

describe("Error classes", () => {
  describe("TxConfirmTimeoutError", () => {
    it("is an Error with its name, fields and message", () => {
      const error = new TxConfirmTimeoutError("abc", 1500);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("TxConfirmTimeoutError");
      expect(error.txHash).toBe("abc");
      expect(error.timeoutMs).toBe(1500);
      expect(error.message).toBe(
        "Transaction abc was not confirmed within 1500 ms",
      );
    });
    it("keeps a given cause, and has none without one", () => {
      const cause = new Error("401");
      expect(new TxConfirmTimeoutError("abc", 1, { cause }).cause).toBe(cause);
      expect("cause" in new TxConfirmTimeoutError("abc", 1)).toBe(false);
      expect("cause" in new TxConfirmTimeoutError("abc", 1, {})).toBe(false);
      expect(
        "cause" in new TxConfirmTimeoutError("abc", 1, { cause: undefined }),
      ).toBe(false);
    });
  });

  describe("ProviderError", () => {
    it("is an Error with its name, fields and message", () => {
      const body = { reasons: ["BadInputsUTxO"] };
      const cause = new Error("socket");
      const error = new ProviderError('{"status":400}', {
        kind: "rejected",
        status: 400,
        body,
        cause,
      });
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ProviderError");
      expect(error.message).toBe('{"status":400}');
      expect(error.kind).toBe("rejected");
      expect(error.status).toBe(400);
      expect(error.body).toBe(body);
      expect(error.cause).toBe(cause);
      expect(error.retryable).toBe(false);
    });
    it("accepts the kind unsupported", () => {
      const error = new ProviderError("no such method", {
        kind: "unsupported",
      });
      expect(error.kind).toBe("unsupported");
      expect(error.retryable).toBe(false);
    });
    it("has no status, body or cause unless given", () => {
      const error = new ProviderError("missing", { kind: "notFound" });
      expect("status" in error).toBe(false);
      expect("body" in error).toBe(false);
      expect("cause" in error).toBe(false);

      const nothing = new ProviderError("no response", {
        kind: "unavailable",
        status: undefined,
        body: undefined,
        cause: undefined,
      });
      expect("status" in nothing).toBe(false);
      expect("body" in nothing).toBe(false);
      expect("cause" in nothing).toBe(false);
    });
    it("is retryable by default only when rate limited or unavailable", () => {
      const kinds: ProviderError["kind"][] = [
        "notFound",
        "rateLimited",
        "unavailable",
        "unauthorized",
        "rejected",
        "invalidRequest",
        "unsupported",
      ];
      for (const kind of kinds) {
        expect(new ProviderError("x", { kind }).retryable).toBe(
          kind === "rateLimited" || kind === "unavailable",
        );
        expect(
          new ProviderError("x", { kind, retryable: true }).retryable,
        ).toBe(true);
        expect(
          new ProviderError("x", { kind, retryable: false }).retryable,
        ).toBe(false);
      }
    });
  });

  describe("ScriptEvaluationError", () => {
    it("is an Error with its name, failures and message", () => {
      const failures = [failure, { ...failure, tag: "MINT" as const }];
      const error = new ScriptEvaluationError("2 scripts failed", failures);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ScriptEvaluationError");
      expect(error.message).toBe("2 scripts failed");
      expect(error.failures).toBe(failures);
    });
    it("keeps a given cause, and has none without one", () => {
      const cause = new Error("machine error");
      expect(new ScriptEvaluationError("x", [], { cause }).cause).toBe(cause);
      expect("cause" in new ScriptEvaluationError("x", [])).toBe(false);
      expect(
        "cause" in new ScriptEvaluationError("x", [], { cause: undefined }),
      ).toBe(false);
    });
  });

  describe("is()", () => {
    it.each(names)(
      "%s.is holds for its own instances and subclasses",
      (name) => {
        expect(classes[name].is(makers[name]())).toBe(true);
        expect(classes[name].is(subclassMakers[name]())).toBe(true);
      },
    );

    it.each(names)("%s.is does not hold for other values", (name) => {
      const own = makers[name]();
      const others = names.filter((other) => other !== name);
      for (const other of others) {
        expect(classes[name].is(makers[other]())).toBe(false);
        expect(classes[name].is(subclassMakers[other]())).toBe(false);
      }
      const lookalike = { ...own, name: own.name, message: own.message };
      for (const value of [
        new Error(own.message),
        lookalike,
        null,
        undefined,
        name,
      ])
        expect(classes[name].is(value)).toBe(false);
    });

    it.each(names)("%s does not show its brand", (name) => {
      const error = makers[name]();
      expect(Object.getOwnPropertySymbols(error)).toEqual([]);
      expect(Object.keys(error).some((key) => key.includes("meshsdk"))).toBe(
        false,
      );
      const json = JSON.stringify(error);
      expect(json).not.toMatch(/meshsdk/);
      expect(Object.keys(JSON.parse(json))).toEqual(Object.keys(error));
    });

    it.each(names)("%s.is holds across two copies of the package", (name) => {
      let copyA: typeof import("@meshsdk/common") | undefined;
      let copyB: typeof import("@meshsdk/common") | undefined;
      jest.isolateModules(() => {
        copyA = require("@meshsdk/common");
      });
      jest.isolateModules(() => {
        copyB = require("@meshsdk/common");
      });
      const A = copyA![name];
      const B = copyB![name];
      expect(A).not.toBe(B);
      const fromB =
        name === "TxConfirmTimeoutError"
          ? new copyB!.TxConfirmTimeoutError("ab", 1)
          : name === "ProviderError"
            ? new copyB!.ProviderError("x", { kind: "notFound" })
            : new copyB!.ScriptEvaluationError("x", []);
      expect(fromB instanceof A).toBe(false);
      expect(A.is(fromB)).toBe(true);
      expect(classes[name].is(fromB)).toBe(true);
    });

    it("checks keys fixed as text", () => {
      for (const name of names) {
        const branded = { [Symbol.for(`@meshsdk/common/${name}`)]: true };
        expect(classes[name].is(branded)).toBe(true);
        for (const other of names.filter((o) => o !== name))
          expect(classes[other].is(branded)).toBe(false);
      }
    });
  });
});
