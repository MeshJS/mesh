import ImagePreview from "@/components/atom/ImagePreview/ImagePreview";
import NewContentHeader from "@/components/organism/NewContentHeader/NewContentHeader";
import { Upload } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useWallet } from "@meshsdk/react";
import axios from "axios";
import { useRouter } from "next/router";
import { RootReducer } from "@/redux/rootReducer";
import { useSelector } from "react-redux";
import { UTxO } from "@meshsdk/core";
import { Post } from "@/types";

type Body = {
  feeUtxo: UTxO;
  ownerTokenUtxo: UTxO;
  collateralUtxo: UTxO;
  ownerAssetHex: string;
  walletAddress: string;
  registryNumber: number;
  newContent: any;
  contentNumber: number;
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

  contentNumber: 0,
  ownerAssetHex: "",
  newContent: undefined,
};

function Page(): React.JSX.Element {
  const router = useRouter();
  const contentNumber = router.query.contentNumber as string;
  const imgRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState<string>("");
  const [fetchingData, setFetchingData] = useState<boolean>(false);
  const [description, setDescription] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string | null>("");
  const [image, setImage] = useState<File | null>(null);
  const { connected, wallet } = useWallet();
  const contentData = useSelector((state: RootReducer) => state.getContentData);
  const feeUtxo = useSelector((state: RootReducer) => state.feeUtxo);
  const collateralUtxo = useSelector((state: RootReducer) => state.collateralUtxo);
  const walletAddress = useSelector((state: RootReducer) => state.walletAddress);
  const addImageHandler = () => {
    imgRef.current?.click();
  };
  const imageHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImage(file);
      const imgURL = URL.createObjectURL(file);
      setImageUrl(imgURL);
    }
  };

  /**Remove Image */
  const removeImage = () => {
    setImage(null);
    setImageUrl(null);
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write something ...",
      }),
      //   CodeBlockLowlight.configure({
      //     lowlight,
      //   }),
    ],
    content: "",
  });

  const editHandler = async () => {
    if (!connected) {
      alert("Please connect to wallet");
      return;
    }
    let data: Post;
    if (contentData[0]) {
      data = contentData[0][parseInt(contentNumber)];
    } else {
      const res = await axios.get("../api/get-content/0-" + contentNumber);
      data = res.data;
    }
    //Verified ownership, assign the ownerTokenUtxo
    const utxoList = await wallet.getUtxos();

    if (
      utxoList.some((uxto: UTxO) => {
        return uxto.output.amount.some((amount) => {
          return amount.unit === data.ownerAssetHex;
        });
      })
    ) {
      body.ownerTokenUtxo = utxoList.find((utxo: UTxO) => {
        return utxo.output.amount.some((amount) => {
          return amount.unit === data.ownerAssetHex;
        });
      });
      body.feeUtxo = feeUtxo[0];
      body.collateralUtxo = collateralUtxo[0];
      body.walletAddress = walletAddress[0];
      body.registryNumber = 0;
      body.contentNumber = parseInt(contentNumber);

      //get the content from Editor
      const htmlContent = editor?.getHTML();

      /**Content Dict */
      let content = {
        title: title,
        description: description,
        content: htmlContent,
        image: image,
      };

      body.newContent = content;
      body.ownerAssetHex = data.ownerAssetHex;
      const res = await axios.put("/api/update-content", body);
      console.log(res);
      const rawTx = res.data.rawTx;

      const signedTx = await wallet.signTx(rawTx, true);
      const txHash = await wallet.submitTx(signedTx);
      console.log("txHash", txHash);
      alert("update success");
    } else {
      alert("You are not the owner");
    }
  };

  const getContentHandler = async () => {
    let data;
    //if already get all content, directly get data from redux
    //if not, calling the api
    if (contentData[0]) {
      data = contentData[0][parseInt(contentNumber)];
    } else {
      const res = await axios.get("../api/get-content/0-" + contentNumber);
      data = res.data;
    }

    setTitle(data.content.title);
    setDescription(data.content.description);
    setImage(data.content.image);
    editor?.commands.setContent(data.content.content);
  };

  useEffect(() => {
    //make sure the postNumber is not empty and the editor is already ready.
    if (!fetchingData && contentNumber && editor) {
      getContentHandler();
      setFetchingData(true);
    }
  }, [fetchingData, contentNumber, editor]);

  return (
    <div>
      <NewContentHeader title={title} loading={loading} callback={editHandler} />
      <div className="container">
        {/**Adding Image */}
        {imageUrl && <ImagePreview url={imageUrl} removeCallBack={removeImage} />}
        <div className="mt-4">
          <input
            type="file"
            className="hidden"
            ref={imgRef}
            accept="image/png , image/jpeg , image/svg , image/gif , image/jpg , image/webp"
            onChange={imageHandler}
          />
          <Upload className="cursor-pointer bg-black" onClick={addImageHandler} />
        </div>
        {/**Title Input */}
        <div className="mt-4">
          <input
            className=" outline-none h-10 text-2xl  font-bold border-none w-full text-black"
            placeholder="Title.."
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>
        {/**Description */}
        <div className="mt-4">
          <input
            className=" outline-none h-10 text-xl  font-bold border-none w-full text-black"
            placeholder="Write your short description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        {/** Rich Text Editor */}
        {/* <div className="mt-4 text-black">
          <Tiptap editor={editor} />
        </div> */}
      </div>
    </div>
  );
}

export default Page;
