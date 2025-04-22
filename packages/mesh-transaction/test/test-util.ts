import { bech32 } from "bech32";

import {
  applyCborEncoding,
  IFetcher,
  MeshValue,
  resolveScriptHash,
} from "@meshsdk/core";
import {
  applyParamsToScript,
  blake2b,
  Transaction,
  TransactionOutput,
  TxCBOR,
  HexBlob,
} from "@meshsdk/core-cst";

export const txHash = (tx: string) => {
  return blake2b(32).update(Buffer.from(tx, "utf-8")).digest("hex");
};

export const alwaysSucceedCbor = applyCborEncoding(
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
);

export const alwaysSucceedHash = resolveScriptHash(alwaysSucceedCbor, "V3");

export const alwaysFailCbor = applyCborEncoding(
  "5001010023259800b452689b2b20025735",
);

export const alwaysFailHash = resolveScriptHash(alwaysFailCbor, "V3");

export const spend42Cbor = applyCborEncoding(
  "587901010029800aba2aba1aab9eaab9dab9a4888896600264653001300600198031803800cc0180092225980099b8748008c01cdd500144c8cc896600266e1d2000300a375400313370e6eb4c030c02cdd5000a40a916402460140026014601600260106ea800a29450060c018004c00cdd5003452689b2b20021",
);

export const spend42Hash = resolveScriptHash(spend42Cbor, "V3");

export const baseAddress = (index: number) => {
  const numberString = index.toString().padStart(28, "0");
  const numberStringReversed = numberString.split("").reverse().join("");
  const bytes = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from(numberString, "utf-8"),
    Buffer.from(numberStringReversed, "utf-8"),
  ]);
  return encodeBech32Address(bytes);
};

export const drepBech32 = (index: number) => {
  const numberString = index.toString().padStart(28, "0");
  const bytes = Buffer.concat([
    Buffer.from([0x22]),
    Buffer.from(numberString, "utf-8"),
  ]);
  return encodeBech32DRep(bytes);
}

export const rewardAddress = (index: number) => {
  const numberString = index.toString().padStart(28, "0");
  const bytes = Buffer.concat([
    Buffer.from([0xE1]),
    Buffer.from(numberString, "utf-8"),
  ]);
  return encodeBech32RewardAddress(bytes);
}

export const keyHashHex = (index: number) => {
  const numberString = index.toString().padStart(28, "0");
  return HexBlob.fromBytes(Buffer.from(numberString, "utf-8"),).toString();
}

export const vrfKeyHashHex = (index: number) => {
  const numberString = index.toString().padStart(32, "0");
  return HexBlob.fromBytes(Buffer.from(numberString, "utf-8"),).toString();
}

export const poolIdBech32 = (index: number) => {
  const numberString = index.toString().padStart(28, "0");
  return encodeBech32PoolId(Buffer.from(numberString, "utf-8"));
}

const encodeBech32PoolId = (bytes: Uint8Array): string => {
  const words = bech32.toWords(bytes);
  return bech32.encode("pool", words, 200);
};

const encodeBech32Address = (bytes: Uint8Array): string => {
  const words = bech32.toWords(bytes);
  return bech32.encode("addr_test", words, 200);
};

const encodeBech32RewardAddress  = (bytes: Uint8Array): string => {
  const words = bech32.toWords(bytes);
  return bech32.encode("stake", words, 200);
};

const encodeBech32DRep = (bytes: Uint8Array) => {
  const words = bech32.toWords(bytes);
  return bech32.encode("drep", words, 200);
}

export const mockTokenUnit = (num: number) => {
  const policyId = num.toString(16).padStart(56, "0");
  const tokenName = num.toString(16).padStart(8, "0");

  return `${policyId}${tokenName}`;
};

export const calculateMinLovelaceForTransactionOutput = (
  output: TransactionOutput,
  coinsPerUtxoSize: bigint,
): bigint => {
  const txOutSize = BigInt(output.toCbor().length / 2);
  return 160n + BigInt(txOutSize) * coinsPerUtxoSize;
};

export const mintParamCbor = (nonce: number) => {
  return applyParamsToScript(
    "59035d010100229800aba4aba2aba1aba0aab9faab9eaab9dab9cab9a48888888896600264653001300900198049805000cc0240092225980099b8748000c020dd500144c96600266ebc01004629462a660106e64c8c8cc88ca6002003374e660220126602202c97ae0a4500400444464b30010038991919911980500119b8a48901280059800800c4cdc52441035b5d2900006899b8a489035b5f20009800800ccdc52441025d2900006914c00402a00530070014029229800805400a0028051009202e5980099b880014803a266e0120f2010018acc004cdc4000a41000513370066e01208014001480362c80890111bac3014002375a60240026466ec0dd418090009ba73013001375400713259800800c4cdc52441027b7d00003899b8a489037b5f20003232330010010032259800800c400e264b30010018994c00402a602e003337149101023a200098008054c06000600a805100a180d00144ca6002015301700199b8a489023a200098008054c060006600e66008008004805100a180d0012030301a001405c66e29220102207d0000340506eac00e264b3001001899b8a489025b5d00003899b8a489035b5f20009800800ccdc52441015d00003914c00401e0053004001401d229800803c00a002803900620283758007133006375a0060051323371491102682700329800800ccdc01b8d0024800666e292210127000044004444b3001337100049000440062646645300100699b800054800666e2ccdc00012cc004cdc40012402914818229037202c3371666e000056600266e2000520148a40c11481b9016002200c33706002901019b8600148080cdc70020012026375c00680b8dc5245022c2000223233001001003225980099b8700148002266e292210130000038acc004cdc4000a40011337149101012d0033002002337029000000c4cc014cdc2000a402866e2ccdc019b85001480512060003403480688888c8cc004004014896600200310058992cc004006266008602c00400d1330053016002330030030014050602c0028098c0040048896600266e2400920008800c6600200733708004900a4cdc599b803370a004900a240c0002801900a0a50401c6eb8c030c024dd50014528a00c180480098021baa00a8a4d153300249011856616c696461746f722072657475726e65642066616c7365001365640041",
    [nonce],
  );
};

export const calculateOutputLovelaces = (tx: string) => {
  const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
  let lovelaces = BigInt(0);
  cardanoTx
    .body()
    .outputs()
    .forEach((output) => {
      lovelaces += output.amount().coin();
    });
  return lovelaces;
};

export const calculateOutputMeshValue = (tx: string) => {
  const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
  let meshValue = new MeshValue();
  cardanoTx
    .body()
    .outputs()
    .forEach((output) => {
      meshValue.addAsset({
        unit: "lovelace",
        quantity: output.amount().coin().toString(),
      });
      let outputAssets = output.amount().multiasset();
      if (outputAssets !== undefined) {
        for (const asset of outputAssets) {
          meshValue.addAsset({
            unit: asset[0],
            quantity: asset[1].toString(),
          });
        }
      }
    });
  return meshValue;
};

export const calculateInputMeshValue = async (
  tx: string,
  fetcher: IFetcher,
) => {
  const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
  const inputValue = new MeshValue();
  for (const input of cardanoTx.body().inputs().values()) {
    const utxo = (await fetcher.fetchUTxOs(input.transactionId().toString()))[
      Number(input.index())
    ];
    if (utxo) {
      inputValue.addAssets(utxo.output.amount);
    }
  }
  return inputValue;
};
