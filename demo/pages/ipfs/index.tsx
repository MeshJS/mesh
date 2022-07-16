import { useEffect, useState } from "react";
import type { NextPage } from "next";
import Mesh from "@martifylabs/mesh";
import { Button, Codeblock, Metatags } from "../../components";

const IPFS: NextPage = () => {
  const [infuraLoaded, setInfuraLoaded] = useState<boolean>(false);
  const [response, setResponse] = useState<any>(undefined);
  const [selectedApi, setSelectedApi] = useState<string | null>(null);

  useEffect(() => {
    async function loadInfura() {
      await Mesh.infura.init({
        projectId: process.env.NEXT_PUBLIC_INFURA_PROJECT_ID,
        projectSecret: process.env.NEXT_PUBLIC_INFURA_PROJECT_SECRET,
      });
      setInfuraLoaded(true);
    }
    loadInfura();
  }, []);

  return (
    <div className="mt-32 prose prose-slate mx-auto lg:prose-lg">
      <Metatags title="Infura IPFS APIs" />
      <h1>Infura IPFS APIs</h1>
      <p className="lead"></p>
      {infuraLoaded && <AddFileIpfs />}
    </div>
  );
};

export default IPFS;

function AddFileIpfs() {
  const [response, setResponse] = useState<any>(undefined);
  const [selectedFile, setSelectedFile] = useState(null);

  async function upload(formData) {
    const res = await Mesh.infura.addFileIpfs({ formData });
    setResponse(res);
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData();
    if (selectedFile) {
      formData.append("file", selectedFile);
      upload(formData);
    }
  };

  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  return (
    <>
      <h2>Upload to IPFS</h2>
      <form onSubmit={handleSubmit}>
        <input type="file" onChange={handleFileSelect} />
        <input type="submit" value="Upload File" />
      </form>
      {response && (
        <>
          <h4>Response</h4>
          <Codeblock data={response} />

          <h4>Image</h4>
          <img src={`https://infura-ipfs.io/ipfs/${response.Hash}`} />
          <a
            href={`https://infura-ipfs.io/ipfs/${response.Hash}`}
            target="_blank"
          >
            https://infura-ipfs.io/ipfs/{response.Hash}
          </a>
        </>
      )}
    </>
  );
}
