import { hashDrepAnchor, hashPlutusScript } from "@meshsdk/common";

describe("hashDrepAnchor", () => {
  it("with drep object", () => {
    const drepAnchor = `{
  "@context": {
    "CIP100": "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0100/README.md#",
    "CIP119": "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0119/README.md#",
    "hashAlgorithm": "CIP100:hashAlgorithm",
    "body": {
      "@id": "CIP119:body",
      "@context": {
        "references": {
          "@id": "CIP119:references",
          "@container": "@set",
          "@context": {
            "GovernanceMetadata": "CIP100:GovernanceMetadataReference",
            "Identity": "CIP119:IdentityReference",
            "Link": "CIP119:LinkReference",
            "Other": "CIP100:OtherReference",
            "label": "CIP100:reference-label",
            "uri": "CIP100:reference-uri",
            "referenceHash": {
              "@id": "CIP119:referenceHash",
              "@context": {
                "hashDigest": "CIP119:hashDigest",
                "hashAlgorithm": "CIP100:hashAlgorithm"
              }
            }
          }
        },
        "paymentAddress": "CIP119:paymentAddress",
        "givenName": "CIP119:givenName",
        "image": "CIP119:image",
        "objectives": "CIP119:objectives",
        "motivations": "CIP119:motivations",
        "qualifications": "CIP119:qualifications",
        "doNotList": "CIP119:doNotList"
      }
    },
    "authors": {
      "@id": "CIP100:authors",
      "@container": "@set",
      "@context": {
        "name": "http://xmlns.com/foaf/0.1/name",
        "witness": {
          "@id": "CIP100:witness",
          "@context": {
            "witnessAlgorithm": "CIP100:witnessAlgorithm",
            "publicKey": "CIP100:publicKey",
            "signature": "CIP100:signature"
          }
        }
      }
    }
  },
  "authors": [],
  "hashAlgorithm": "blake2b-256",
  "body": {
    "doNotList": false,
    "givenName": "sidan-lab",
    "motivations": "My motivation",
    "objectives": "My objective",
    "paymentAddress": "addr_test1qz8j439j54afpl4hw978xcw8qsa0dsmyd6wm9v8xzeyz7ucrj5rt3et7z59mvmmpxnejvn2scwmseezdq5h5fpw08z8s8d93my",
    "qualifications": "My qualification",
    "references": [
      {
        "@type": "Link",
        "label": "Twitter",
        "uri": "https://x.com/hinsonsidan"
      },
      {
        "@type": "Identity",
        "label": "Github",
        "uri": "https://github.com/hinsonsidan"
      }
    ]
  }
}`;
    const anchorObj = JSON.parse(drepAnchor);
    const anchorHash = hashDrepAnchor(anchorObj);
    expect(anchorHash).toBe(
      "b421ba4290b257a235b3c4bfb442075c7dc35589261116ae7c73b79d30e5d8f5",
    );
  });
});

describe("hashPlutusScript", () => {
  // Ground truth: Aiken blueprint hashes from mesh-contract's giftcard
  // workspace (plutusVersion v3). The ledger hashes the serialised script
  // bytes exactly as they appear in the CBOR byte string.
  it("hashes a V3 minting policy to its Aiken blueprint hash", () => {
    expect(
      hashPlutusScript(
        "5901ae01010032323232323232232225333005323232323253323300b3001300c3754004264646464a66601e600a0022a66602460226ea801c540085854ccc03cc00c00454ccc048c044dd50038a8010b0b18079baa006132323232533301430170021323253330133009301437540162a666026601260286ea8c8cc004004018894ccc0600045300103d87a80001323253330173375e603860326ea80080504cdd2a40006603600497ae0133004004001301c002301a00115333013300700113371e00402229405854ccc04ccdc3800a4002266e3c0080445281bad3014002375c60240022c602a00264a666020600860226ea800452f5bded8c026eacc054c048dd500099198008009bab3015301630163016301600322533301400114c103d87a80001323232325333015337220140042a66602a66e3c0280084cdd2a4000660326e980052f5c02980103d87a80001330060060033756602c0066eb8c050008c060008c058004dd6180980098079baa007370e90011bae3010300d37540046e1d200016300e300f002300d001300d002300b0013007375400229309b2b1bae0015734aae7555cf2ab9f5740ae855d11",
        "V3",
      ),
    ).toEqual("401c967008d42885400991f9225715e1c3a8e43757b1fd36a1328195");
  });

  it("hashes a V3 spending validator to its Aiken blueprint hash", () => {
    expect(
      hashPlutusScript(
        "59011501010032323232323232232232253330063232323232533300b3370e900118061baa001132323232325333013301600213253330113370e6eb4c04c009200113371e00201e2940dd718088008b180a00099299980799b8748008c040dd50008a5eb7bdb1804dd5980a18089baa001323300100137566028602a602a602a602a60226ea8020894ccc04c004530103d87a80001323232325333014337220200042a66602866e3c0400084cdd2a4000660306e980052f5c02980103d87a80001330060060033756602a0066eb8c04c008c05c008c054004c048c04c008c044004c034dd50008b1807980800118070009807001180600098041baa00114984d958dd70009bae0015734aae7555cf2ab9f5740ae855d101",
        "V3",
      ),
    ).toEqual("b2386630f1b210c58d0e46f132e931b362c3f373685118018e4d956f");
  });

  it("produces a different hash per language version tag", () => {
    expect(
      hashPlutusScript(
        "59011501010032323232323232232232253330063232323232533300b3370e900118061baa001132323232325333013301600213253330113370e6eb4c04c009200113371e00201e2940dd718088008b180a00099299980799b8748008c040dd50008a5eb7bdb1804dd5980a18089baa001323300100137566028602a602a602a602a60226ea8020894ccc04c004530103d87a80001323232325333014337220200042a66602866e3c0400084cdd2a4000660306e980052f5c02980103d87a80001330060060033756602a0066eb8c04c008c05c008c054004c048c04c008c044004c034dd50008b1807980800118070009807001180600098041baa00114984d958dd70009bae0015734aae7555cf2ab9f5740ae855d101",
        "V2",
      ),
    ).not.toEqual("b2386630f1b210c58d0e46f132e931b362c3f373685118018e4d956f");
  });
});
