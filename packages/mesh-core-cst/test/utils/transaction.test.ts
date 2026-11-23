import {
  Cardano,
  getTransactionValidityInterval,
  Serialization,
} from "@meshsdk/core-cst";

/** An empty transaction with the given validity interval, as CBOR hex */
const txWith = (validity: {
  invalidBefore?: number;
  invalidHereafter?: number;
}): string => {
  const body = new Serialization.TransactionBody(
    Serialization.CborSet.fromCore([], Serialization.TransactionInput.fromCore),
    [],
    0n,
  );
  if (validity.invalidBefore !== undefined)
    body.setValidityStartInterval(Cardano.Slot(validity.invalidBefore));
  if (validity.invalidHereafter !== undefined)
    body.setTtl(Cardano.Slot(validity.invalidHereafter));
  return new Serialization.Transaction(
    body,
    new Serialization.TransactionWitnessSet(),
  ).toCbor();
};

describe("getTransactionValidityInterval", () => {
  it("reads both bounds", () => {
    expect(
      getTransactionValidityInterval(
        txWith({ invalidBefore: 10, invalidHereafter: 20 }),
      ),
    ).toEqual({ invalidBefore: 10, invalidHereafter: 20 });
  });

  it("leaves out a bound the transaction does not set", () => {
    expect(
      getTransactionValidityInterval(txWith({ invalidHereafter: 20 })),
    ).toEqual({ invalidHereafter: 20 });
    expect(getTransactionValidityInterval(txWith({}))).toEqual({});
  });

  it("tells a zero start from none", () => {
    expect(
      getTransactionValidityInterval(txWith({ invalidBefore: 0 })),
    ).toEqual({ invalidBefore: 0 });
  });
});
