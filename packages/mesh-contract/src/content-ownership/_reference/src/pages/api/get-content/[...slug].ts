import {
  maestro,
  parseContentRegistry,
  parseOwnershipRegistry,
  InfuraDownloader,
  decodeOnchainRecord,
} from "@/backend";
import { MeshTxInitiator } from "@/transactions/common";
import { MeshTxBuilder } from "@meshsdk/core";
import type { NextApiRequest, NextApiResponse } from "next";

type Content = {
  registryNumber: number;
  contentHashHex: string;
  ownerAssetHex: string;
  content: any;
};

type Data =
  | Content
  | {
      error: string;
    };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  // API 3: GET /api/get-content/:id
  // Get content by id
  try {
    if (req.method === "GET") {
      const pathParams = req.query.slug as string[];
      const [registryId, contentId] = pathParams[0].split("-");

      const mesh = new MeshTxBuilder({ fetcher: maestro, submitter: maestro });
      const initiator = new MeshTxInitiator(mesh, maestro, {
        collateralUTxO: { input: { txHash: "", outputIndex: 0 }, output: { address: "", amount: [] } },
        walletAddress: "",
      });

      // Get the ownerAssetHex and contentHashHex
      const [contentRegistry, ownershipRegistry] = await initiator.getScriptUtxos(Number(registryId), [
        "content",
        "ownership",
      ]);
      const contentArray = parseContentRegistry(contentRegistry.output.plutusData as string);
      const ownershipArray = parseOwnershipRegistry(ownershipRegistry.output.plutusData as string);
      console.log(contentArray, ownershipArray);

      // Resolve content from IPFS

      const completeContent: Content = {
        registryNumber: Number(registryId),
        contentHashHex: contentArray[Number(contentId)],
        ownerAssetHex: ownershipArray[Number(contentId)],
        content: {},
      };
      await new InfuraDownloader()
        .downloadContent(contentArray[Number(contentId)])
        .then((content) => {
          const jsonStart = content.data.indexOf("{");
          const jsonEnd = content.data.lastIndexOf("}");
          const json = content.data.substring(jsonStart, jsonEnd + 1);
          completeContent.content = JSON.parse(json);
        })
        .catch((error) => {
          console.log("No IPFS content resolved for contentItem: ", contentArray[Number(contentId)]);
        });

      res.status(200).json(completeContent);
    } else {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
