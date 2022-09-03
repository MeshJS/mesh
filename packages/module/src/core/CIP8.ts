import {
  AlgorithmId, BigNum, COSESign1Builder,
  CBORValue, COSEKey, HeaderMap, Headers,
  Int, KeyType, Label, ProtectedHeaderMap,
} from '@emurgo/cardano-message-signing-nodejs';
import { fromBytes, toBytes } from '@mesh/common/utils';
import type { Address, PrivateKey } from './CSL';

export const signMessage = (
  message: Message, signer: Signer,
): { coseKey: string; coseSign1: string } => {
  const coseKey = createCOSEKey(signer);
  const coseSign1 = createCOSESign1(message, signer);

  return {
    coseKey: fromBytes(coseKey.to_bytes()),
    coseSign1: fromBytes(coseSign1.to_bytes()),
  };
};

const createCOSEKey = (signer: Signer) => {
  const coseKey = COSEKey.new(
    Label.from_key_type(KeyType.OKP),
  );

  coseKey.set_algorithm_id(
    Label.from_algorithm_id(AlgorithmId.EdDSA),
  );

  coseKey.set_header(
    Label.new_int(Int.new_negative(BigNum.from_str('1'))),
    CBORValue.new_int(Int.new_i32(6)),
  );

  coseKey.set_header(
    Label.new_int(Int.new_negative(BigNum.from_str('2'))),
    CBORValue.new_bytes(signer.key.to_public().as_bytes()),
  );

  return coseKey;
};

const createCOSESign1 = (message: Message, signer: Signer) => {
  const protectedHeaders = HeaderMap.new();
  const unprotectedHeaders = HeaderMap.new();

  protectedHeaders.set_algorithm_id(
    Label.from_algorithm_id(AlgorithmId.EdDSA),
  );

  protectedHeaders.set_header(
    Label.new_text('address'),
    CBORValue.new_bytes(signer.address.to_bytes()),
  );

  const headers = Headers.new(
    ProtectedHeaderMap.new(protectedHeaders),
    unprotectedHeaders,
  );

  const coseSign1Builder = COSESign1Builder.new(
    headers, toBytes(message.payload), false,
  );

  if (message.externalAAD !== undefined) {
    coseSign1Builder.set_external_aad(
      toBytes(message.externalAAD),
    );
  }

  const dataToSign = coseSign1Builder.make_data_to_sign();
  const signedSigStructure = signer.key.sign(dataToSign.to_bytes());

  return coseSign1Builder.build(signedSigStructure.to_bytes());
};

export type Message = {
  payload: string;
  externalAAD?: string;
};

export type Signer = {
  address: Address;
  key: PrivateKey;
};
