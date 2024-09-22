import { infura } from "./providers";
import multihashes from "multihashes";

export const uploadMarkdown = async <T extends object>(content: T) => {
  const blob = new Blob([JSON.stringify(content)], {
    type: "application/json",
  });
  let formData = new FormData();
  formData.append("blob", blob, "test.json");
  const res: any = await infura.uploadContent(formData);
  const ipfsHash: string = res.Hash;
  const ipfsContentBytes = multihashes.fromB58String(ipfsHash);
  const ipfsContentHex = Buffer.from(ipfsContentBytes).toString("hex").slice(4);
  console.log("IPFS Hash", ipfsContentHex, ipfsContentHex.length);
  return ipfsContentHex;
};
