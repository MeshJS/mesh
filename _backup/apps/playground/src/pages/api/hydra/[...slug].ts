import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

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
      const { data, status } = await axiosInstance.post(slug[1]!, _req.body);
      _res.status(status).json(data);
    } else {
      const { data, status } = await axiosInstance.get(slug[1]!);
      _res.status(status).json(data);
    }
  } catch (error) {
    console.error("Hydra error", error);
    _res.status(500).json(error);
  }
}
