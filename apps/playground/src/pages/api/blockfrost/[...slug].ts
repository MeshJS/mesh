import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

export default async function handler(
  _req: NextApiRequest,
  _res: NextApiResponse,
) {
  try {
    let { slug } = _req.query;
    slug = slug as string[];

    const network = slug[0];
    let key = process.env.BLOCKFROST_API_KEY_PREPROD;
    switch (network) {
      case "testnet":
        key = process.env.BLOCKFROST_API_KEY_TESTNET;
        break;
      case "mainnet":
        key = process.env.BLOCKFROST_API_KEY_MAINNET;
        break;
      case "preview":
        key = process.env.BLOCKFROST_API_KEY_PREVIEW;
        break;
    }

    const axiosInstance = axios.create({
      baseURL: `https://cardano-${network}.blockfrost.io/api/v0`,
      headers: { project_id: key },
    });

    /**
     * get url from slug
     */
    let url = slug?.slice(1).join("/");

    // get params if exists
    let params = _req.query;
    delete _req.query["slug"];
    if (Object.keys(params).length > 0) {
      url += "?";

      for (const key in params) {
        url += `${key}=${params[key]}&`;
      }
    }
    // end get params if exists

    /**
     * call blockfrost api
     */
    if (url == "tx/submit" || url == "utils/txs/evaluate") {
      const body = _req.body;

      const headers = { "Content-Type": "application/cbor" };
      const { data, status } = await axiosInstance.post(url, body, {
        headers,
      });
      _res.status(status).json(data);
    } else {
      const { data, status } = await axiosInstance.get(`${url}`);
      _res.status(status).json(data);
    }
  } catch (error) {
    _res.status(500).json(error);
  }
}
