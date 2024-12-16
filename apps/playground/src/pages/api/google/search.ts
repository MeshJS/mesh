import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

export default async function handler(
  _req: NextApiRequest,
  _res: NextApiResponse,
) {
  try {
    const query = _req.body.query;
    const resGoogle = await axios.get(
      `https://customsearch.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API}&cx=${process.env.GOOGLE_SEARCH_CX}&num=10&q=${query}`,
    );
    _res.status(200).json(resGoogle.data);
  } catch (error) {
    _res.status(500).json(error);
  }
}
