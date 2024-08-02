import { pubKeyAddress, scriptAddress } from "@meshsdk/common";
import {
  deserializeBech32Address,
  scriptHashToBech32,
  serializeAddressObj,
} from "@meshsdk/core-csl";

describe("Address", () => {
  test("deserializeBech32Address", () => {
    const address =
      "addr_test1qqmrzjhtanauj20wg37uk58adyrqfm82a9qr52vdnv0e54r42v0mu8ngky0f5yxmh3wl3z0da2fryk59kavth0u8xhvsufgmc8";
    const serializedAddress = deserializeBech32Address(address);
    expect(serializedAddress.pubKeyHash).toBe(
      "36314aebecfbc929ee447dcb50fd690604eceae9403a298d9b1f9a54",
    );
    expect(serializedAddress.scriptHash).toBe("");
    expect(serializedAddress.stakeCredentialHash).toBe(
      "75531fbe1e68b11e9a10dbbc5df889edea92325a85b758bbbf8735d9",
    );
  });
  test("scriptHashToBech32", () => {
    const scriptHash =
      "0049d04cc313681a8390d5ed0484b6803c76d80cd97e71df8e4e5f3a";
    const stakeHash =
      "bfaa385c8eab7bbdc6c98b50413435b3d02b73de3c644e1384b801d4";
    const serializedAddress = scriptHashToBech32(scriptHash, stakeHash);
    expect(serializedAddress).toBe(
      "addr_test1zqqyn5zvcvfksx5rjr276pyyk6qrcakcpnvhuuwl3e897w4l4gu9er4t0w7udjvt2pqngddn6q4h8h3uv38p8p9cq82q7xtsrh",
    );
  });
  test("scriptHashToBech32 script stake key", () => {
    const address = scriptHashToBech32(
      "c12e891c8e995cfa5d1547ace30413cad298827a19fbb8ea49b46469",
      "867c8b572e5ac8f0c14aa7417cb9caec9d1ff50e994f772eab2d69f4",
      0,
      true,
    );
    expect(address).toBe(
      "addr_test1xrqjazgu36v4e7jaz4r6eccyz09d9xyz0gvlhw82fx6xg6vx0j94wtj6ercvzj48g97tnjhvn50l2r5efamja2edd86ql04h5v",
    );
  });
  test("serializeAddressObj", () => {
    const address = scriptAddress(
      "0049d04cc313681a8390d5ed0484b6803c76d80cd97e71df8e4e5f3a",
      "bfaa385c8eab7bbdc6c98b50413435b3d02b73de3c644e1384b801d4",
    );
    const serializedAddress = serializeAddressObj(address);
    expect(serializedAddress).toBe(
      "addr_test1zqqyn5zvcvfksx5rjr276pyyk6qrcakcpnvhuuwl3e897w4l4gu9er4t0w7udjvt2pqngddn6q4h8h3uv38p8p9cq82q7xtsrh",
    );
  });
  test("serializeAddressObj 2", () => {
    const address = pubKeyAddress(
      "36314aebecfbc929ee447dcb50fd690604eceae9403a298d9b1f9a54",
      "75531fbe1e68b11e9a10dbbc5df889edea92325a85b758bbbf8735d9",
    );
    const serializedAddress = serializeAddressObj(address);
    expect(serializedAddress).toBe(
      "addr_test1qqmrzjhtanauj20wg37uk58adyrqfm82a9qr52vdnv0e54r42v0mu8ngky0f5yxmh3wl3z0da2fryk59kavth0u8xhvsufgmc8",
    );
  });
  test("serializeAddressObj 2", () => {
    const address = scriptAddress(
      "c12e891c8e995cfa5d1547ace30413cad298827a19fbb8ea49b46469",
      "867c8b572e5ac8f0c14aa7417cb9caec9d1ff50e994f772eab2d69f4",
      true,
    );
    const serializedAddress = serializeAddressObj(address);
    expect(serializedAddress).toBe(
      "addr_test1xrqjazgu36v4e7jaz4r6eccyz09d9xyz0gvlhw82fx6xg6vx0j94wtj6ercvzj48g97tnjhvn50l2r5efamja2edd86ql04h5v",
    );
  });
});
