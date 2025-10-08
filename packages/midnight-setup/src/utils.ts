import { Logger } from "pino";

// Simple utility functions for proof server connection
export const randomNonceBytes = (length: number, logger?: Logger): Uint8Array => {
    const newBytes = new Uint8Array(length);
    crypto.getRandomValues(newBytes);
    logger?.info("Random nonce bytes generated");
    return newBytes;
}

export function hexStringToUint8Array(hexStr: string): Uint8Array {
  // Simple hex to Uint8Array conversion
  const hex = hexStr.replace(/^0x/, '');
  const bytes = new Uint8Array(hex.length / 2);
  
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  
  return bytes;
}

export default { randomNonceBytes, hexStringToUint8Array };