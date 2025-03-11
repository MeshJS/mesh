import { HexBlob } from "@cardano-sdk/util";

import {
  DeserializedAddress,
  pubKeyAddress,
  PubKeyAddress,
  scriptAddress,
  ScriptAddress,
} from "@meshsdk/common";

import {
  Address,
  BaseAddress,
  CertIndex,
  ConstrPlutusData,
  CredentialType,
  EnterpriseAddress,
  Hash28ByteBase16,
  PlutusData,
  PlutusList,
  PointerAddress,
  RewardAddress,
  Script,
  TxIndex,
} from "../types";
import { fromJsonToPlutusData, fromPlutusDataToJson } from "./data";

export const serialzeAddress = (
  deserializedAddress: Partial<DeserializedAddress>,
  networkId = 0,
) => {
  const {
    pubKeyHash,
    scriptHash,
    stakeCredentialHash,
    stakeScriptCredentialHash,
  } = deserializedAddress;

  const isPaymentScript = !pubKeyHash;
  const isStakeScript = !stakeCredentialHash;

  const paymentHash = isPaymentScript ? scriptHash : pubKeyHash;

  const stakeHash = isStakeScript
    ? stakeScriptCredentialHash
    : stakeCredentialHash;

  if (!paymentHash)
    throw new Error(
      "Error: serializeAddress: Address must contain a payment part",
    );

  const addressObj = isPaymentScript
    ? scriptAddress(paymentHash, stakeHash, isStakeScript)
    : pubKeyAddress(paymentHash, stakeHash, isStakeScript);
  return serializeAddressObj(addressObj, networkId);
};

const addrBech32ToPlutusData = (bech32: string): PlutusData => {
  const cardanoAddress = Address.fromBech32(bech32);
  const cardanoAddressProps = cardanoAddress.getProps();
  const paymentPartList = new PlutusList();
  if (!cardanoAddressProps.paymentPart) {
    throw new Error(
      "Error: addrBech32ToPlutusDataHex: Address must contain a payment part",
    );
  }
  paymentPartList.add(
    PlutusData.newBytes(
      Buffer.from(cardanoAddressProps.paymentPart.hash, "hex"),
    ),
  );
  const paymentPart = PlutusData.newConstrPlutusData(
    new ConstrPlutusData(
      BigInt(cardanoAddressProps.paymentPart.type),
      paymentPartList,
    ),
  );
  const delegationPartList = new PlutusList();
  let delegationPart;
  if (cardanoAddressProps.delegationPart) {
    delegationPartList.add(
      PlutusData.newBytes(
        Buffer.from(cardanoAddressProps.delegationPart.hash, "hex"),
      ),
    );

    // Inline(StakeCredential)
    const inlineDelegationPart = PlutusData.newConstrPlutusData(
      new ConstrPlutusData(BigInt(0), delegationPartList),
    );

    // Some(Inline(StakeCredential))
    const someList = new PlutusList();
    someList.add(inlineDelegationPart);
    delegationPart = PlutusData.newConstrPlutusData(
      new ConstrPlutusData(BigInt(0), someList),
    );
  } else if (cardanoAddressProps.pointer) {
    // Pointer
    const pointerList = new PlutusList();
    pointerList.add(
      PlutusData.newInteger(BigInt(cardanoAddressProps.pointer.slot)),
    );
    pointerList.add(
      PlutusData.newInteger(BigInt(cardanoAddressProps.pointer.txIndex)),
    );
    pointerList.add(
      PlutusData.newInteger(BigInt(cardanoAddressProps.pointer.certIndex)),
    );
    const pointer = PlutusData.newConstrPlutusData(
      new ConstrPlutusData(BigInt(1), pointerList),
    );

    // Some(Pointer)
    const someList = new PlutusList();
    someList.add(pointer);
    delegationPart = PlutusData.newConstrPlutusData(
      new ConstrPlutusData(BigInt(0), someList),
    );
  } else {
    delegationPart = PlutusData.newConstrPlutusData(
      new ConstrPlutusData(BigInt(1), new PlutusList()),
    );
  }

  const addressList = new PlutusList();
  addressList.add(paymentPart);
  addressList.add(delegationPart);

  return PlutusData.newConstrPlutusData(
    new ConstrPlutusData(BigInt(0), addressList),
  );
};

export const addrBech32ToPlutusDataHex = (bech32: string): string => {
  return addrBech32ToPlutusData(bech32).toCbor();
};

export const addrBech32ToPlutusDataObj = <T>(bech32: string): T => {
  return fromPlutusDataToJson(addrBech32ToPlutusData(bech32)) as T;
};

const plutusDataToAddrBech32 = (
  plutusData: PlutusData,
  networkId = 0,
): string => {
  const constrPlutusData = plutusData.asConstrPlutusData();
  if (!constrPlutusData || constrPlutusData.getAlternative() !== BigInt(0)) {
    throw new Error(
      "Error: serializeAddressObj: Address must contain a constructor 0",
    );
  }

  const plutusDataList = constrPlutusData.getData();
  if (plutusDataList.getLength() !== 2) {
    throw new Error("Error: serializeAddressObj: Address must contain 2 parts");
  }

  const paymentData = plutusDataList.get(0);
  const paymentConstrData = paymentData.asConstrPlutusData();
  if (!paymentConstrData) {
    throw new Error(
      "Error: serializeAddressObj: Payment part must be a constructor",
    );
  }

  const paymentConstrDataList = paymentConstrData.getData();
  if (paymentConstrDataList.getLength() !== 1) {
    throw new Error(
      "Error: serializeAddressObj: Payment part must contain 1 element",
    );
  }

  const paymentBytes = paymentConstrDataList.get(0).asBoundedBytes();
  if (!paymentBytes) {
    throw new Error(
      "Error: serializeAddressObj: Payment inner part must be bytes",
    );
  }

  if (
    paymentConstrData.getAlternative() !== BigInt(0) &&
    paymentConstrData.getAlternative() !== BigInt(1)
  ) {
    throw new Error(
      "Error: serializeAddressObj: Payment part must be alternative 0 or 1",
    );
  }
  const cardanoPaymentCredential = {
    hash: Hash28ByteBase16(Buffer.from(paymentBytes).toString("hex")),
    type: Number(paymentConstrData.getAlternative()),
  };

  const delegationData = plutusDataList.get(1);
  // Option<Referenced<Credential>>
  const delegationConstrData = delegationData.asConstrPlutusData();
  if (!delegationConstrData) {
    throw new Error(
      "Error: serializeAddressObj: Delegation part must be a constructor",
    );
  }

  if (delegationConstrData.getAlternative() === BigInt(1)) {
    return EnterpriseAddress.fromCredentials(
      networkId,
      cardanoPaymentCredential,
    )
      .toAddress()
      .toBech32()
      .toString();
  } else if (delegationConstrData.getAlternative() === BigInt(0)) {
    const delegationDataList = delegationConstrData.getData();
    if (delegationDataList.getLength() !== 1) {
      throw new Error(
        "Error: serializeAddressObj: Delegation part must contain 1 element",
      );
    }

    const delegationDataInner = delegationDataList.get(0);
    // Referenced<Credential>
    const delegationDataInnerConstrData =
      delegationDataInner.asConstrPlutusData();
    if (!delegationDataInnerConstrData) {
      throw new Error(
        "Error: serializeAddressObj: Delegation inner part must be a constructor",
      );
    }

    if (delegationDataInnerConstrData.getAlternative() === BigInt(0)) {
      const delegationDataInnerList = delegationDataInnerConstrData.getData();
      if (delegationDataInnerList.getLength() !== 1) {
        throw new Error(
          "Error: serializeAddressObj: Delegation inner part must contain 1 element",
        );
      }
      // Credential
      const delegationCredential = delegationDataInnerList
        .get(0)
        .asConstrPlutusData();
      if (!delegationCredential) {
        throw new Error(
          "Error: serializeAddressObj: Delegation inner part must be a constructor",
        );
      }

      const delegationBytesList = delegationCredential.getData();
      if (delegationBytesList.getLength() !== 1) {
        throw new Error(
          "Error: serializeAddressObj: Delegation bytes part must contain 1 element",
        );
      }

      const delegationBytes = delegationBytesList.get(0).asBoundedBytes();
      if (!delegationBytes) {
        throw new Error(
          "Error: serializeAddressObj: Delegation bytes part must be of type bytes",
        );
      }

      const cardanoStakeCredential = {
        hash: Hash28ByteBase16(Buffer.from(delegationBytes).toString("hex")),
        type: Number(delegationCredential.getAlternative()),
      };

      return BaseAddress.fromCredentials(
        networkId,
        cardanoPaymentCredential,
        cardanoStakeCredential,
      )
        .toAddress()
        .toBech32()
        .toString();
    } else if (delegationDataInnerConstrData.getAlternative() === BigInt(1)) {
      const delegationDataInnerList = delegationDataInnerConstrData.getData();
      if (delegationDataInnerList.getLength() !== 3) {
        throw new Error(
          "Error: serializeAddressObj: Delegation inner part must contain 3 elements",
        );
      }

      const slot = delegationDataInnerList.get(0).asInteger();
      if (!slot) {
        throw new Error(
          "Error: serializeAddressObj: Delegation inner part slot must be integer",
        );
      }

      const txIndex = delegationDataInnerList.get(1).asInteger();
      if (!txIndex) {
        throw new Error(
          "Error: serializeAddressObj: Delegation inner part txIndex must be integer",
        );
      }

      const certIndex = delegationDataInnerList.get(2).asInteger();
      if (!certIndex) {
        throw new Error(
          "Error: serializeAddressObj: Delegation inner part certIndex must be integer",
        );
      }

      const cardanoPointer = {
        slot: slot,
        txIndex: TxIndex(Number(txIndex)),
        certIndex: CertIndex(Number(certIndex)),
      };

      return PointerAddress.fromCredentials(
        networkId,
        cardanoPaymentCredential,
        cardanoPointer,
      )
        .toAddress()
        .toBech32()
        .toString();
    } else {
      throw new Error(
        "Error: serializeAddressObj: Delegation inner part must be alternative 0 or 1",
      );
    }
  } else {
    throw new Error(
      "Error: serializeAddressObj: Delegation part must be alternative 0 or 1",
    );
  }
};

export const serializeAddressObj = (
  plutusDataAddressObject: PubKeyAddress | ScriptAddress,
  networkId = 0,
): string => {
  const cardanoPlutusData = fromJsonToPlutusData(plutusDataAddressObject);
  return plutusDataToAddrBech32(cardanoPlutusData, networkId);
};

export const serializePlutusAddressToBech32 = (
  plutusHex: string,
  networkId = 0,
) => {
  const cardanoPlutusData = PlutusData.fromCbor(HexBlob(plutusHex));
  return plutusDataToAddrBech32(cardanoPlutusData, networkId).toString();
};

export const deserializeBech32Address = (
  bech32Addr: string,
): DeserializedAddress => {
  const deserializedAddress = Address.fromBech32(bech32Addr).getProps();
  return {
    pubKeyHash:
      deserializedAddress.paymentPart?.type === CredentialType.KeyHash
        ? deserializedAddress.paymentPart?.hash
        : "",
    scriptHash:
      deserializedAddress.paymentPart?.type === CredentialType.ScriptHash
        ? deserializedAddress.paymentPart?.hash
        : "",
    stakeCredentialHash:
      deserializedAddress.delegationPart?.type === CredentialType.KeyHash
        ? deserializedAddress.delegationPart?.hash
        : "",
    stakeScriptCredentialHash:
      deserializedAddress.delegationPart?.type === CredentialType.ScriptHash
        ? deserializedAddress.delegationPart?.hash
        : "",
  };
};

export const deserializeAddress = (address: string): Address => {
  const _address = Address.fromString(address);
  if (_address === null) throw new Error("Invalid address");
  return _address;
};

export const scriptHashToBech32 = (
  scriptHash: string,
  stakeCredentialHash?: string,
  networkId = 0,
  isScriptStakeCredentialHash = false,
) => {
  if (stakeCredentialHash) {
    return BaseAddress.fromCredentials(
      networkId,
      { hash: Hash28ByteBase16(scriptHash), type: CredentialType.ScriptHash },
      {
        hash: Hash28ByteBase16(stakeCredentialHash),
        type: isScriptStakeCredentialHash
          ? CredentialType.ScriptHash
          : CredentialType.KeyHash,
      },
    )
      .toAddress()
      .toBech32()
      .toString();
  } else {
    return EnterpriseAddress.fromCredentials(networkId, {
      hash: Hash28ByteBase16(scriptHash),
      type: CredentialType.ScriptHash,
    })
      .toAddress()
      .toBech32()
      .toString();
  }
};

export const v2ScriptToBech32 = (
  scriptCbor: string,
  stakeCredential?: string,
  networkId = 0,
  isScriptStakeCredential = false,
) =>
  scriptHashToBech32(
    Script.fromCbor(HexBlob(scriptCbor)).hash().toString(),
    stakeCredential,
    networkId,
    isScriptStakeCredential,
  );

export const scriptHashToRewardAddress = (hash: string, networkId = 0) => {
  return RewardAddress.fromCredentials(networkId, {
    hash: Hash28ByteBase16(hash),
    type: CredentialType.ScriptHash,
  })
    .toAddress()
    .toBech32()
    .toString();
};

export const keyHashToRewardAddress = (hash: string, networkId = 0) => {
  return RewardAddress.fromCredentials(networkId, {
    hash: Hash28ByteBase16(hash),
    type: CredentialType.KeyHash,
  })
    .toAddress()
    .toBech32()
    .toString();
};
