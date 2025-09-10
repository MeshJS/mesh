import { BlockfrostProvider } from "@meshsdk/provider";

describe("Blockfrost constructor", () => {
  it("fails to initiate a new instance with a wrong first argument", () => {
    expect(() => new BlockfrostProvider({})).toThrow();
    expect(() => new BlockfrostProvider("")).toThrow();
    expect(() => new BlockfrostProvider("http://google.com")).toThrow();
    expect(
      () =>
        new BlockfrostProvider("`https://cardano-testnet.blockfrost.io/api/v1"),
    ).toThrow();
  });
});
