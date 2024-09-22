import { InfuraDownloader, infura, maestro, parseContentRegistry, parseOwnershipRegistry } from "@/backend";
import { MeshTxInitiator } from "@/transactions/common";
import { ContentRegistryDatum, OwnershipRegistryDatum } from "@/transactions/type";
import { MeshTxBuilder } from "@meshsdk/core";
import { parseInlineDatum } from "@sidan-lab/sidan-csl";
import type { NextApiRequest, NextApiResponse } from "next";

type Content = {
  registryNumber: number;
  contentHashHex: string;
  ownerAssetHex: string;
  content: any;
};

type Data =
  | Content[]
  | {
      error: string;
    };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  // API 2: GET /api/get-content
  // Get all content
  try {
    if (req.method === "GET") {
      // Query both registries
      const mesh = new MeshTxBuilder({ fetcher: maestro, submitter: maestro });
      const initiator = new MeshTxInitiator(mesh, maestro, {
        collateralUTxO: { input: { txHash: "", outputIndex: 0 }, output: { address: "", amount: [] } },
        walletAddress: "",
      });

      // Get the ownerAssetHex and contentHashHex
      const [contentRegistry, ownershipRegistry] = await initiator.getScriptUtxos(0, ["content", "ownership"]);
      const contentArray = parseContentRegistry(contentRegistry.output.plutusData as string);
      const ownershipArray = parseOwnershipRegistry(ownershipRegistry.output.plutusData as string);
      console.log(contentArray, ownershipArray);

      // Resolve content from IPFS

      const ipfsPromises: Promise<void>[] = [];
      const responseContent: Content[] = [];

      contentArray.forEach((contentItem: string, index) => {
        const completeContent: Content = {
          registryNumber: 0,
          contentHashHex: contentItem,
          ownerAssetHex: ownershipArray[index],
          content: "",
        };
        ipfsPromises.push(
          new InfuraDownloader()
            .downloadContent(contentItem)
            .then((content) => {
              const jsonStart = content.data.indexOf("{");
              const jsonEnd = content.data.lastIndexOf("}");
              const json = content.data.substring(jsonStart, jsonEnd + 1);
              completeContent.content = JSON.parse(json);
            })
            .catch((error) => {
              console.log("No IPFS content resolved for contentItem: ", contentItem);
            })
        );
        responseContent.push(completeContent);
      });

      await Promise.all(ipfsPromises);
      console.log(responseContent[1].content);
      res.status(200).json(responseContent);
    } else {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
