// import {
//   AlgorithmId, BigNum, COSESign1Builder,
//   CBORValue, COSEKey, HeaderMap, Headers, Int,
//   KeyType, Label, ProtectedHeaderMap,
// } from '@emurgo/cardano-message-signing-nodejs';
// import { fromBytes, toBytes } from '@mesh/common/utils';
// import type { PrivateKey } from './CSL';

// export const signMessage = (
//   messageHex: string, signerKey: PrivateKey,
// ): string => {
//   const protectedHeaders = HeaderMap.new();

//   protectedHeaders.set_algorithm_id(
//     Label.from_algorithm_id(AlgorithmId.EdDSA)
//   );
//   // protectedHeaders.set_key_id(publicKey.as_bytes()); // Removed to adhere to CIP-30
//   protectedHeaders.set_header(
//     Label.new_text('address'),
//     CBORValue.new_bytes(Buffer.from(address, 'hex'))
//   );
//   const protectedSerialized =
//     ProtectedHeaderMap.new(protectedHeaders);
//   const unprotectedHeaders = HeaderMap.new();
//   const headers = Headers.new(
//     protectedSerialized,
//     unprotectedHeaders
//   );

//   const coseSign1Builder = COSESign1Builder.new(
//     headers, toBytes(messageHex), false
//   );

//   const toSign = coseSign1Builder.make_data_to_sign().to_bytes();

//   const signedSigStruc = signerKey.sign(toSign).to_bytes();
//   const coseSign1 = coseSign1Builder.build(signedSigStruc);

//   const key = COSEKey.new(
//     Label.from_key_type(KeyType.OKP)
//   );
//   key.set_algorithm_id(
//     Label.from_algorithm_id(AlgorithmId.EdDSA)
//   );
//   key.set_header(
//     Label.new_int(
//       Int.new_negative(BigNum.from_str('1'))
//     ),
//     CBORValue.new_int(
//       Int.new_i32(6) //CurveType.Ed25519
//     )
//   ); // crv (-1) set to Ed25519 (6)
//   key.set_header(
//     Label.new_int(
//       Int.new_negative(BigNum.from_str('2'))
//     ),
//     CBORValue.new_bytes(signerKey.to_public().as_bytes())
//   ); // x (-2) set to public key

//   return fromBytes(coseSign1.to_bytes());
// };

// const buildCOSESign1 = (
//   headers: Headers, messageHex: string, isExternal = false,
// ) => {
//   const coseSign1Builder = COSESign1Builder.new(
//     headers, toBytes(messageHex), isExternal
//   );

//   const toSign = coseSign1Builder.make_data_to_sign().to_bytes();

//   const signedSigStruc = signerKey.sign(toSign).to_bytes();
//   const coseSign1 = coseSign1Builder.build(signedSigStruc);
// };
export {};