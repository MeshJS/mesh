import { RootReducer } from "@/redux/rootReducer";
import { UTxO } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { Post } from "@/types";

type Body = {
  feeUtxo: UTxO;
  ownerTokenUtxo: UTxO; //get asset and check
  collateralUtxo: UTxO;
  walletAddress: string;
  registryNumber: number;
  newOwnerAssetHex: string; //userInput
  contentNumber: number; //user input
};
let body: Body = {
  feeUtxo: {
    input: {
      outputIndex: 0,
      txHash: "",
    },
    output: {
      address: "",
      amount: [],
      dataHash: undefined,
      plutusData: undefined,
      scriptRef: undefined,
      scriptHash: undefined,
    },
  },
  ownerTokenUtxo: {
    input: {
      outputIndex: 0,
      txHash: "",
    },
    output: {
      address: "",
      amount: [],
      dataHash: undefined,
      plutusData: undefined,
      scriptRef: undefined,
      scriptHash: undefined,
    },
  },
  collateralUtxo: {
    input: {
      outputIndex: 0,
      txHash: "",
    },
    output: {
      address: "",
      amount: [],
      dataHash: undefined,
      plutusData: undefined,
      scriptRef: undefined,
      scriptHash: undefined,
    },
  },
  walletAddress: "",
  registryNumber: 0,
  newOwnerAssetHex: "",
  contentNumber: 0,
};

function TransferContentButton() {
  const [newOwnerAssetHex, setNewOwnerAssetHex] = useState<string>("");
  const [contentNumber, setContentNumber] = useState<number>(-1);
  const feeUtxo = useSelector((state: RootReducer) => state.feeUtxo);
  const collateralUtxo = useSelector(
    (state: RootReducer) => state.collateralUtxo
  );
  const walletAddress = useSelector(
    (state: RootReducer) => state.walletAddress
  );
  const contentData = useSelector((state: RootReducer) => state.getContentData);

  const { wallet } = useWallet();

  const transferButtonHandler = async () => {
    //get the content by Number first
    //get from redux or api
    let data: Post;
    if (contentData[0] && contentNumber) {
      data = contentData[0][contentNumber];
    } else {
      const res = await axios.get("../api/get-content/0-" + contentNumber);
      data = res.data;
    }

    const utxoList = await wallet.getUtxos();

    //Verified ownership, assign the ownerTokenUtxo
    if (
      utxoList.some((uxto: UTxO) => {
        return uxto.output.amount.some((amount) => {
          return amount.unit === data.ownerAssetHex;
        });
      }) &&
      contentNumber
    ) {
      body.ownerTokenUtxo = utxoList.find((utxo: UTxO) => {
        return utxo.output.amount.some((amount) => {
          return amount.unit === data.ownerAssetHex;
        });
      });
    } else {
      alert("You are not the owner");
    }

    body.feeUtxo = feeUtxo[0];
    body.collateralUtxo = collateralUtxo[0];
    body.walletAddress = walletAddress[0];
    body.newOwnerAssetHex = newOwnerAssetHex;
    body.contentNumber = contentNumber;
    body.registryNumber = 0;
    console.log(body);

    const res = await axios.put("/api/transfer-content", body);
    console.log(res);
    const rawTx = res.data.rawTx;
    const signedTx = await wallet.signTx(rawTx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log("txHash", txHash);
    alert("transfer success");
  };
  return (
    <div className="text-black container">
      TransferContent
      <input
        className=" outline-none h-10 text-2xl  font-bold border-none w-full text-black"
        placeholder="New Owner Asset Hex:"
        value={newOwnerAssetHex}
        onChange={(event) => {
          setNewOwnerAssetHex(event.target.value);
        }}
      />
      <input
        className=" outline-none h-10 text-2xl  font-bold border-none w-full text-black"
        placeholder="Content Number:"
        value={contentNumber === -1 ? "" : contentNumber}
        onChange={(event) => {
          if (/^\d*$/.test(event.target.value)) {
            // Update state only if it's a valid number
            setContentNumber(Number(event.target.value));
          }
        }}
      />
      <button
        className=" bg-green-500 p-1 rounded-lg"
        onClick={transferButtonHandler}
      >
        Transfer
      </button>
    </div>
  );
}

export default TransferContentButton;
