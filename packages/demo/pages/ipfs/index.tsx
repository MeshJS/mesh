import { useEffect, useState } from "react";
import type { NextPage } from "next";
import Mesh from "@martifylabs/mesh";
import { Button, Codeblock, Metatags } from "../../components";

const IPFS: NextPage = () => {
  const [infuraLoaded, setInfuraLoaded] = useState<boolean>(false);

  useEffect(() => {
    async function loadInfura() {
      await Mesh.infura.init({
        projectId: process.env.NEXT_PUBLIC_INFURA_PROJECT_ID!,
        projectSecret: process.env.NEXT_PUBLIC_INFURA_PROJECT_SECRET!,
      });
      setInfuraLoaded(true);
    }
    loadInfura();
  }, []);

  return (
    <div className="mt-32 prose prose-slate mx-auto lg:prose-lg">
      <Metatags title="Infura IPFS APIs" />
      <h1>IPFS APIs</h1>
      <p className="lead">Add files to IPFS.</p>
      {infuraLoaded && <AddFileIpfs />}
    </div>
  );
};

export default IPFS;

function AddFileIpfs() {
  const [response, setResponse] = useState<null | any>(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [state, setState] = useState(0);

  async function upload(formData) {
    const res = await Mesh.infura.addFileIpfs({ formData });
    setResponse(res);
  }

  async function addFileIpfs() {
    setState(1);
    const formData = new FormData();
    if (selectedFile) {
      formData.append("file", selectedFile);
      upload(formData);
      const res = await Mesh.infura.addFileIpfs({ formData });
      setResponse(res);
      setState(2);
    }
  }

  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  return (
    <>
      <h2>Upload to IPFS</h2>

      <div>
        <input type="file" onChange={handleFileSelect} />
        <Button
          onClick={() => addFileIpfs()}
          style={state == 1 ? "warning" : state == 2 ? "success" : "primary"}
          disabled={state == 1}
        >
          addFileIpfs
        </Button>
      </div>

      {response !== null && (
        <>
          <h4>Response</h4>
          <Codeblock data={response} />

          <h4>Image</h4>
          <a
            href={`https://infura-ipfs.io/ipfs/${response.Hash}`}
            target="_blank" rel="noreferrer"
          >
            <img src={`https://infura-ipfs.io/ipfs/${response.Hash}`} />
          </a>
        </>
      )}
    </>
  );
}
