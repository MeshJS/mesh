import { hashDrepAnchor } from "@meshsdk/common";

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
