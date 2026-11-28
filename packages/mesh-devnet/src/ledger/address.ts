/**
 * Cardano address byte utilities.
 *
 * Conway-era Shelley address header:
 *   bits [7:4] = type nibble
 *   bits [3:0] = network id (0 = testnet, 1 = mainnet)
 *
 * Type nibble map:
 *   0  base key+key        payment=pkh, stake=pkh
 *   1  base script+key     payment=scripthash, stake=pkh
 *   2  base key+script     payment=pkh, stake=scripthash
 *   3  base script+script  payment=scripthash, stake=scripthash
 *   4  pointer key         payment=pkh
 *   5  pointer script      payment=scripthash
 *   6  enterprise key      payment=pkh
 *   7  enterprise script   payment=scripthash
 *   8  Byron               different layout, no network nibble
 *
 * Key-payment types: {0, 2, 4, 6}
 * Script-payment types: {1, 3, 5, 7}
 *
 * References:
 *   cardano-ledger shelley/impl: Cardano.Ledger.Address
 *   pallas pallas-addresses/src/lib.rs
 */

/** 28-byte payment key hash, or null for script-payment/Byron addresses. */
export function paymentKeyHashOfAddress(addressHex: string): string | null {
  try {
    const bytes      = Buffer.from(addressHex, 'hex');
    if (bytes.length === 0) return null;
    const typeNibble = (bytes[0]! >> 4) & 0xf;
    if (typeNibble === 0 || typeNibble === 2 || typeNibble === 4 || typeNibble === 6) {
      return bytes.slice(1, 29).toString('hex');
    }
    return null;
  } catch { return null; }
}

/** 28-byte script hash from the payment part, or null for key-payment/Byron. */
export function scriptHashOfAddress(addressHex: string): string | null {
  try {
    const bytes      = Buffer.from(addressHex, 'hex');
    if (bytes.length === 0) return null;
    const typeNibble = (bytes[0]! >> 4) & 0xf;
    if (typeNibble === 1 || typeNibble === 3 || typeNibble === 5 || typeNibble === 7) {
      return bytes.slice(1, 29).toString('hex');
    }
    return null;
  } catch { return null; }
}

/** High nibble of header byte, or null on parse error. */
export function addressTypeNibble(addressHex: string): number | null {
  try {
    const bytes = Buffer.from(addressHex, 'hex');
    if (bytes.length === 0) return null;
    return (bytes[0]! >> 4) & 0xf;
  }
  catch { return null; }
}

/**
 * Low nibble of header byte = network id.
 * Returns null for Byron addresses which don't encode network in the low nibble.
 */
export function networkIdOfAddress(addressHex: string): number | null {
  try {
    const b          = Buffer.from(addressHex, 'hex');
    if (b.length === 0) return null;
    const typeNibble = (b[0]! >> 4) & 0xf;
    if (typeNibble === 8) return null;
    return b[0]! & 0xf;
  } catch { return null; }
}
