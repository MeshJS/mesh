import { checkSignature } from "@meshsdk/core-cst";

const config = {
  wallet_address:
    "addr_test1qqmrzjhtanauj20wg37uk58adyrqfm82a9qr52vdnv0e54r42v0mu8ngky0f5yxmh3wl3z0da2fryk59kavth0u8xhvsufgmc8",
  nonce:
    "5369676e20746f2076657269667920746865206164647265737320666f723a207374616b655f74657374317570363478386137726535747a3835367a72646d6368306333386b373479336a74327a6d776b396d6837726e746b6773367a786a70315a424e474e79506d3975565677514a53385837724663476551424843657433",
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
  it("checkSignature", () => {
    const result = checkSignature(config.nonce, config.signature);
    expect(result).toBe(true);
  });

  it("checkSignature validates signature's address against provided rewardAddress", () => {
    const result = checkSignature(
      config.nonce,
      config.signature,
      config.rewardAddress,
    );
    expect(result).toBe(true);
  });

  it("checkSignature validates signature's address against provided wallet_address", () => {
    const result = checkSignature(
      config.nonce,
      config.signature,
      config.wallet_address,
    );
    expect(result).toBe(true);
  });

  it("checkSignature validates signature's address against provided invalidAddress", () => {
    const result = checkSignature(
      config.nonce,
      config.signature,
      config.invalidAddress,
    );
    expect(result).toBe(false);
  });
});
