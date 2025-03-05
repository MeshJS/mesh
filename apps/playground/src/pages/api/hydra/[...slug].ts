import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

import { toBytes } from "@meshsdk/common";

export default async function handler(
  _req: NextApiRequest,
  _res: NextApiResponse,
) {
  try {
    let { slug } = _req.query;
    slug = slug as string[];

    const axiosInstance = axios.create({
      baseURL: `http://${slug[0]}/`,
    });

    if (_req.body) {
      console.log("POST 0", slug[0]);
      console.log("POST 1", slug[1]);
      console.log("POST body", _req.body);
      const { data, status } = await axiosInstance.post(slug[1]!, _req.body);
      console.log("POST data", data);
      console.log("POST status", status);
      _res.status(status).json(data);
    } else {
      const { data, status } = await axiosInstance.get(slug[1]!);
      _res.status(status).json(data);
    }
  } catch (error) {
    console.error('error', error);
    _res.status(500).json(error);
  }
}
