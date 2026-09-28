import { Cbor, CborArray, CborBytes, CborMap, CborSimple, CborText } from "@harmoniclabs/cbor";
import { MeshWallet } from "@meshsdk/wallet";

import { verifySellerTermsSignature } from "../../src/masumi/cose";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const TERMS_DIGEST = "a".repeat(64);

/** Builds a syntactically-valid COSE_Sign1 CBOR array with an unprotected `hashed` header. */
const buildFakeCoseSign1 = (hashed: boolean | undefined): string => {
  const unprotectedEntries =
    hashed === undefined ? [] : [{ k: new CborText("hashed"), v: new CborSimple(hashed) }];
  const message = new CborArray([
    new CborBytes(Buffer.alloc(0)), // protected (empty for this test)
    new CborMap(unprotectedEntries),
    new CborBytes(Buffer.from(TERMS_DIGEST, "hex")), // payload
    new CborBytes(Buffer.alloc(64)), // signature (garbage - rejected before crypto verification)
  ]);
  return Cbor.encode(message).toBuffer().toString("hex");
};

describe("verifySellerTermsSignature - COSE hashed-header binding", () => {
  it("rejects a signature whose COSE unprotected header declares hashed=true", async () => {
    const fakeSignature = buildFakeCoseSign1(true);
    const result = await verifySellerTermsSignature(
      "deadbeef", // key is irrelevant - rejected before it's ever read
      fakeSignature,
      "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w",
      TERMS_DIGEST,
    );
    expect(result).toBe(false);
  });

  it("proceeds to real signature verification when hashed=false or absent", async () => {
    const wallet: MeshWallet = await buildTestWallet(new FakeFetcher(), new FakeSubmitter());
    const sellerAddress = await wallet.getChangeAddress();
    const { key, signature } = await wallet.signData(TERMS_DIGEST);

    // A genuine wallet.signData() signature (hashed=false, matching this package's own
    // signTermsDigest helper) must still pass through to real crypto verification and
    // succeed - proving the new hashed-header check doesn't reject legitimate signatures.
    const result = await verifySellerTermsSignature(key, signature, sellerAddress, TERMS_DIGEST);
    expect(result).toBe(true);
  });

  it("rejects when bound to the wrong address even with hashed=false", async () => {
    const wallet: MeshWallet = await buildTestWallet(new FakeFetcher(), new FakeSubmitter());
    const { key, signature } = await wallet.signData(TERMS_DIGEST);

    const wrongAddress =
      "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w";
    const result = await verifySellerTermsSignature(key, signature, wrongAddress, TERMS_DIGEST);
    expect(result).toBe(false);
  });
});
