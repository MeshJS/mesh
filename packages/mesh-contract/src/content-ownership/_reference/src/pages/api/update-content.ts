import { maestro, uploadMarkdown } from "@/backend";
import { UserAction } from "@/transactions/user";
import { MeshTxBuilder, UTxO } from "@meshsdk/core";
import type { NextApiRequest, NextApiResponse } from "next";

type Data =
  | {
      rawTx: string;
    }
  | {
      error: string;
    };

type Body = {
  feeUtxo: UTxO;
  ownerTokenUtxo: UTxO;
  collateralUtxo: UTxO;
  walletAddress: string;
  registryNumber: number;
  newContent: any;
  contentNumber: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    // API 3: PUT /api/update-content
    // Update content
    if (req.method === "PUT") {
      const {
        feeUtxo,
        ownerTokenUtxo,
        collateralUtxo,
        walletAddress,
        registryNumber,
        newContent,
        contentNumber,
      }: Body = req.body;

      // Upload new content to IPFS and get Hash
      const newContentHashHex = await uploadMarkdown(newContent);

      // Build Transaction
      const mesh = new MeshTxBuilder({ fetcher: maestro, submitter: maestro });
      const user = new UserAction(mesh, maestro, {
        collateralUTxO: collateralUtxo,
        walletAddress: walletAddress,
      });

      const rawTx = await user.updateContent({
        feeUtxo,
        ownerTokenUtxo,
        walletAddress,
        registryNumber,
        newContentHashHex,
        contentNumber,
      });

      // Return the rawTx
      res.status(200).json({ rawTx });
    } else {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
