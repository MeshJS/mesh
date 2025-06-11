import { checkSignature } from "@meshsdk/core-cst";

import { CoseSign1 } from "../src";

const config = {
  wallet_address:
    "addr_test1qqmrzjhtanauj20wg37uk58adyrqfm82a9qr52vdnv0e54r42v0mu8ngky0f5yxmh3wl3z0da2fryk59kavth0u8xhvsufgmc8",
  nonce:
    "5369676e20746f2076657269667920746865206164647265737320666f723a207374616b655f74657374317570363478386137726535747a3835367a72646d6368306333386b373479336a74327a6d776b396d6837726e746b6773367a786a70315a424e474e79506d3975565677514a53385837724663476551424843657433",
  nonceInUtf8:
    "Sign to verify the address for: stake_test1up64x8a7re5tz856zrdmch0c38k74y3jt2zmwk9mh7rntkgs6zxjp1ZBNGNyPm9uVVwQJS8X7rFcGeQBHCet3",
  rewardAddress:
    "stake_test1up64x8a7re5tz856zrdmch0c38k74y3jt2zmwk9mh7rntkgs6zxjp",
  invalidAddress:
    "addr_test1qrqtawercjsj29xyq4kssxeru6s33y68kwmh8tj00q4vkhaeucuvwvhegqxf6ka0ewy0pallk044nnrtsj8zhevw603sjxytg2",
  signature: {
    signature:
      "84582aa201276761646472657373581de075531fbe1e68b11e9a10dbbc5df889edea92325a85b758bbbf8735d9a166686173686564f458805369676e20746f2076657269667920746865206164647265737320666f723a207374616b655f74657374317570363478386137726535747a3835367a72646d6368306333386b373479336a74327a6d776b396d6837726e746b6773367a786a70315a424e474e79506d3975565677514a533858377246634765514248436574335840321349435491a3b5992a9b172aebc2b78de5af639045fdb57703f5e39d22b757c597a00b333ef4130c1259858e4230e7bf9ae51e2fa24cdb63dfcebde810860b",
    key: "a40101032720062158201220e6aa326f24f12d644a1011dad9d138965c84566d2b7e20b79db7cf2aa73f",
  },
};

describe("MessageSigning", () => {
  it("checkSignature", async () => {
    const result = await checkSignature(config.nonce, config.signature);
    expect(result).toBe(true);
  });
  it("checkSignature with non hex string", async () => {
    const result = await checkSignature(config.nonceInUtf8, config.signature);
    expect(result).toBe(true);
  });
  it("checkSignature validates signature's address against provided rewardAddress", async () => {
    const result = await checkSignature(
      config.nonce,
      config.signature,
      config.rewardAddress,
    );
    expect(result).toBe(true);
  });

  it("checkSignature validates signature's address against provided wallet_address", async () => {
    const result = await checkSignature(
      config.nonce,
      config.signature,
      config.wallet_address,
    );
    expect(result).toBe(true);
  });

  it("checkSignature validates signature's address against provided invalidAddress", async () => {
    const result = await checkSignature(
      config.nonce,
      config.signature,
      config.invalidAddress,
    );
    expect(result).toBe(false);
  });

  it("coseSign1 builds the correct message", () => {
    const coseSign1 = CoseSign1.fromCbor(config.signature.signature);
    expect(
      coseSign1
        .buildMessage(Buffer.from(config.signature.signature, "hex"))
        .toString("hex"),
    ).toBe(
      "84582aa201276761646472657373581de075531fbe1e68b11e9a10dbbc5df889edea92325a85b758bbbf8735d9a166686173686564f458805369676e20746f2076657269667920746865206164647265737320666f723a207374616b655f74657374317570363478386137726535747a3835367a72646d6368306333386b373479336a74327a6d776b396d6837726e746b6773367a786a70315a424e474e79506d3975565677514a5338583772466347655142484365743358fa84582aa201276761646472657373581de075531fbe1e68b11e9a10dbbc5df889edea92325a85b758bbbf8735d9a166686173686564f458805369676e20746f2076657269667920746865206164647265737320666f723a207374616b655f74657374317570363478386137726535747a3835367a72646d6368306333386b373479336a74327a6d776b396d6837726e746b6773367a786a70315a424e474e79506d3975565677514a533858377246634765514248436574335840321349435491a3b5992a9b172aebc2b78de5af639045fdb57703f5e39d22b757c597a00b333ef4130c1259858e4230e7bf9ae51e2fa24cdb63dfcebde810860b",
    );

    expect(coseSign1.createSigStructure().toString("hex")).toBe(
      "846a5369676e617475726531582aa201276761646472657373581de075531fbe1e68b11e9a10dbbc5df889edea92325a85b758bbbf8735d94058805369676e20746f2076657269667920746865206164647265737320666f723a207374616b655f74657374317570363478386137726535747a3835367a72646d6368306333386b373479336a74327a6d776b396d6837726e746b6773367a786a70315a424e474e79506d3975565677514a53385837724663476551424843657433",
    );
  });
});
