import { deserializePoolId, resolveScriptHash } from "../src";

describe("Util tests", () => {
  it("should correctly deserialize a pool id", () => {
    expect(
      deserializePoolId(
        "pool1lzg07gaddygem6f5ch60yv0l0g2529af87hqgw6gkqdmsfs39z9",
      ),
    ).toBe("f890ff23ad69119de934c5f4f231ff7a154517a93fae043b48b01bb8");
  });

  it("should resolve a Plutus V3 script hash matching its Aiken blueprint", () => {
    // Giftcard redeem validator from mesh-contract's Aiken workspace.
    // The ledger hashes the serialised script bytes; hashing the
    // CBOR-unwrapped bytes instead gives a different hash (see #763).
    expect(
      resolveScriptHash(
        "59011501010032323232323232232232253330063232323232533300b3370e900118061baa001132323232325333013301600213253330113370e6eb4c04c009200113371e00201e2940dd718088008b180a00099299980799b8748008c040dd50008a5eb7bdb1804dd5980a18089baa001323300100137566028602a602a602a602a60226ea8020894ccc04c004530103d87a80001323232325333014337220200042a66602866e3c0400084cdd2a4000660306e980052f5c02980103d87a80001330060060033756602a0066eb8c04c008c05c008c054004c048c04c008c044004c034dd50008b1807980800118070009807001180600098041baa00114984d958dd70009bae0015734aae7555cf2ab9f5740ae855d101",
        "V3",
      ),
    ).toBe("b2386630f1b210c58d0e46f132e931b362c3f373685118018e4d956f");
  });
});
