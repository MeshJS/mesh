import { hashDrepAnchor } from "../../src";

describe("Hash Drep Anchor", () => {
  it("should hash a drep anchor correctly", () => {
    const hash = hashDrepAnchor({
      "@context": {
        CIP100:
          "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0100/README.md#",
        CIP119:
          "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0119/README.md#",
        hashAlgorithm: "CIP100:hashAlgorithm",
        body: {
          "@id": "CIP119:body",
          "@context": {
            references: {
              "@id": "CIP119:references",
              "@container": "@set",
              "@context": {
                GovernanceMetadata: "CIP100:GovernanceMetadataReference",
                Identity: "CIP119:IdentityReference",
                Link: "CIP119:LinkReference",
                Other: "CIP100:OtherReference",
                label: "CIP100:reference-label",
                uri: "CIP100:reference-uri",
                referenceHash: {
                  "@id": "CIP119:referenceHash",
                  "@context": {
                    hashDigest: "CIP119:hashDigest",
                    hashAlgorithm: "CIP100:hashAlgorithm",
                  },
                },
              },
            },
            paymentAddress: "CIP119:paymentAddress",
            givenName: "CIP119:givenName",
            image: "CIP119:image",
            objectives: "CIP119:objectives",
            motivations: "CIP119:motivations",
            qualifications: "CIP119:qualifications",
            doNotList: "CIP119:doNotList",
          },
        },
        authors: {
          "@id": "CIP100:authors",
          "@container": "@set",
          "@context": {
            name: "http://xmlns.com/foaf/0.1/name",
            witness: {
              "@id": "CIP100:witness",
              "@context": {
                witnessAlgorithm: "CIP100:witnessAlgorithm",
                publicKey: "CIP100:publicKey",
                signature: "CIP100:signature",
              },
            },
          },
        },
      },
      authors: [],
      hashAlgorithm: "blake2b-256",
      body: {
        doNotList: false,
        givenName: "sidan-lab",
        motivations:
          "SIDAN Lab team has been participating in Cardano development since the Shelley era. We have experience in several areas in which we are qualified, and we want to leverage our knowledge to support better utilization of treasury.",
        objectives:
          "To unleash impactful blockchain use cases in Cardano by utilizing Cardano treasury in a reasonable and sustainable manner. In particular, we will express opinions in our area of expertise, including but not limited to: adoption, education, open source tooling, TradFi & DeFi, regional community building",
        paymentAddress:
          "addr1qy70envckyh0q9khppytjncekq97gd9kfgy378e4dhczgfrlktfp6jaqzqepjhdv0z2cx6awa9w2szwz8t8ws9e4w0qqdpx0u2",
        qualifications:
          "SIDAN Lab is a Hong Kong-based blockchain think tank specializing in Cardano technology. We build DeFi protocols like DeltaDeFi, develop open-source tools such as Meshjs, collaborate with Gimbalabs to deliver educational content through initiatives like the Cardano Developer Series, and organize community events, including the Hong Kong Cardano Community and the Hong Kong Cardano Summit. Additionally, we operate the SIDAN stake pool to contribute to Cardano’s decentralization. Our team is composed of experts in Cardano development, full-stack web development, cybersecurity, branding, design, and more.",
        references: [
          {
            "@type": "Link",
            label: "X",
            uri: "https://x.com/sidan_lab",
          },
          {
            "@type": "Link",
            label: "LinkedIn",
            uri: "https://www.linkedin.com/company/sidanlablimited/",
          },
          {
            "@type": "Link",
            label: "Github",
            uri: "https://github.com/sidan-lab",
          },
          {
            "@type": "Identity",
            label: "Hinson X",
            uri: "https://x.com/hinsonsidan",
          },
          {
            "@type": "Identity",
            label: "Kinson X",
            uri: "https://x.com/KinsonSIDAN",
          },
          {
            "@type": "Identity",
            label: "Neal X",
            uri: "https://x.com/NealSIDAN",
          },
          {
            "@type": "Identity",
            label: "Jackal X",
            uri: "https://x.com/sidanjackal",
          },
          {
            "@type": "Identity",
            label: "Anson X",
            uri: "https://x.com/AnsonSIDAN",
          },
        ],
      },
    });
    expect(hash).toBe(
      "0e84662b672077968494f620f91e49e3daaf6c983707ae6bd227709dbd453b56",
    );
  });
});
