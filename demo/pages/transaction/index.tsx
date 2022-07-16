import { useState } from "react";
import { Metatags } from "../../components";
import ConnectWallet from "../wallet/connectWallet";
import SendAda from "./sendAda";

const Transaction = () => {
  const [walletConnected, setWalletConnected] = useState<null | string>(null);
  return (
    <div className="mt-32 prose prose-slate mx-auto lg:prose-lg">
      <Metatags title="Transaction APIs" />
      <h1>Transaction APIs</h1>
      <p className="lead">
        Let&apos;s create transactions.
      </p>
      <ConnectWallet
        walletConnected={walletConnected}
        setWalletConnected={setWalletConnected}
      />
      {walletConnected && (
        <>
          <SendAda />
        </>
      )}
    </div>
  );
};

export default Transaction;

// function DemoAssets() {
//   const [response, setResponse] = useState<any>(undefined);

//   async function getLovelace() {
//     let lovelace = await Mesh.wallet.getLovelace();
//     setResponse(lovelace);
//   }

//   async function getUsedAddresses() {
//     let addr = await Mesh.wallet.getUsedAddresses();
//     setResponse(addr);
//   }

//   async function getAssets() {
//     let assets = await Mesh.wallet.getAssets({});
//     setResponse(assets);
//   }

//   async function getAssetsPolicyId() {
//     let assets = await Mesh.wallet.getAssets({
//       policyId: "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e2",
//     });
//     setResponse(assets);
//   }

//   async function getUtxos() {
//     let utxo = await Mesh.wallet.getUtxos();
//     setResponse(utxo);
//   }

//   async function makeSimpleTransaction() {
//     // let tx = await Mesh.makeSimpleTransaction({
//     //   lovelace: 2500000,
//     //   recipientAddress:
//     //     "addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt",
//     // });
//     // setResponse(tx);

//     let inputs = [
//       {
//         address: await Mesh.wallet.getWalletAddress(),
//         assets: {
//           lovelace: 1500000,
//         },
//       },
//     ];
//     let outputs = [
//       {
//         address:
//           "addr_test1qqwk2r75gu5e56zawmdp2pk8x74l5waandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgsxv2vff",
//         assets: {
//           lovelace: 1500000,
//         },
//       },
//     ];
//     let tx = await Mesh.makeTransaction({
//       inputs,
//       outputs,
//     });
//     console.log({ tx });
//   }

//   return (
//     <div>
//       <h2>Get assets</h2>

//       <button onClick={() => getLovelace()} type="button">
//         getLovelace
//       </button>

//       <button onClick={() => getUsedAddresses()} type="button">
//         getUsedAddresses
//       </button>

//       <button onClick={() => getAssets()} type="button">
//         getAssets
//       </button>
//       <button onClick={() => getAssetsPolicyId()} type="button">
//         getAssetsPolicyId
//       </button>

//       <button onClick={() => getUtxos()} type="button">
//         getUtxos
//       </button>

//       <button onClick={() => makeSimpleTransaction()} type="button">
//         makeSimpleTransaction (send ADA)
//       </button>

//       <h4>Response</h4>
//       <pre>{JSON.stringify(response, null, 2)}</pre>
//     </div>
//   );
// }

// const FileUploader = ({ onFileSelect }) => {
//   const fileInput = useRef(null);

//   const handleFileInput = (e) => {
//     // handle validations
//     onFileSelect(e.target.files[0]);
//   };

//   return (
//     <div className="file-uploader">
//       <input type="file" onChange={handleFileInput} />
//       <button onClick={(e) => fileInput.current} className="btn btn-primary" />
//     </div>
//   );
// };

// function DemoIpfs() {
//   const [selectedFile, setSelectedFile] = useState(null);

//   async function upload(formData) {
//     await Mesh.addFileIpfs({ formData });
//   }

//   const handleSubmit = (event) => {
//     event.preventDefault();
//     const formData = new FormData();
//     if (selectedFile) {
//       formData.append("file", selectedFile);
//       upload(formData);
//     }
//   };

//   const handleFileSelect = (event) => {
//     setSelectedFile(event.target.files[0]);
//   };

//   return (
//     <>
//       <h2>Upload to IPFS</h2>
//       <form onSubmit={handleSubmit}>
//         <input type="file" onChange={handleFileSelect} />
//         <input type="submit" value="Upload File" />
//       </form>
//     </>
//   );
// }

// function DemoCreateWallet() {
//   const [mnemonic, setMnemonic] = useState<null | {}>(null);

//   async function getNewMnemonic() {
//     const newMnemonic = await Mesh.newMnemonic();
//     console.log("newMnemonic", newMnemonic);
//     setMnemonic(newMnemonic);
//   }

//   async function createWalletMnemonic() {
//     const wallet = await Mesh.createWalletMnemonic({
//       seedPhrase: mnemonic.mnemonic,
//       password: "123456",
//     });
//     console.log("wallet", wallet);
//   }

//   async function loadWallet() {
//     // this wallet address is: addr_test1qqgs4kqkq2sdgw9kv78wprfekwr5sl68vvkhk9qjqsqa500hvyl2fs0mg9qv85mrtdlzl4678fuwhs966xjvmaalaw0q0dl24z
//     let encryptedRootKey =
//       "835ff0b11dbacc9ed2de7b3c24a383a12518c38deade9e395ba0ef29a4b4f3c4f9459864875ef5861dc9d298142bbd4441e196badea0a43fe9b8635e7635a882a80e7cb7eb6d66e5e283398c1c432f0cff30392c13a8f99627b9e4b3e7fe6cf557c79c747edcb56e14a1b69347f42061f08eb2645c69bcf0d30a99470ba1cb2ff735b796ba5d13fc97221feef38aa07b648465425fbed3adbebfc5da";
//     let password = "123456";

//     const wallet = await Mesh.loadWallet({ encryptedRootKey, password });
//     console.log("wallet", wallet);

//     // make txn
//     let paymentAddress =
//       "addr_test1qqgs4kqkq2sdgw9kv78wprfekwr5sl68vvkhk9qjqsqa500hvyl2fs0mg9qv85mrtdlzl4678fuwhs966xjvmaalaw0q0dl24z";
//     let recipientAddress =
//       "addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt";
//     let lovelace = 1500000;
//     // const tx = await Mesh.makeTransaction({
//     //   paymentAddress,
//     //   recipientAddress,
//     //   lovelace,
//     // });
//     // console.log("tx", tx);
//   }

//   return (
//     <>
//       <h2>Create Wallet</h2>
//       <button onClick={() => getNewMnemonic()} type="button">
//         Create wallet step 1
//       </button>
//       <button onClick={() => createWalletMnemonic()} type="button">
//         Create wallet step 2
//       </button>

//       {mnemonic && <pre>{JSON.stringify(mnemonic, null, 2)}</pre>}

//       <h2>Load Wallet</h2>
//       <button onClick={() => loadWallet()} type="button">
//         Load wallet
//       </button>
//     </>
//   );
// }
