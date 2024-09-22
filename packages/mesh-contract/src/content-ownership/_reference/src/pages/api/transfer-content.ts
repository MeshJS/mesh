import { maestro } from "@/backend";
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
  newOwnerAssetHex: string; // user input
  contentNumber: number; // index of content in api `get-content`'s data
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // API 4: PUT /api/transfer-content
  // Transfer content
  try {
    if (req.method === "PUT") {
      const {
        feeUtxo,
        ownerTokenUtxo,
        collateralUtxo,
        walletAddress,
        registryNumber,
        newOwnerAssetHex,
        contentNumber,
      }: Body = req.body;

      const mesh = new MeshTxBuilder({ fetcher: maestro, submitter: maestro });
      const user = new UserAction(mesh, maestro, {
        collateralUTxO: collateralUtxo,
        walletAddress: walletAddress,
      });

      const rawTx = await user.transferContent({
        feeUtxo,
        ownerTokenUtxo,
        walletAddress,
        registryNumber,
        newOwnerAssetHex,
        contentNumber,
      });

      res.status(200).json({ rawTx });
    } else {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
