import { ContentRegistryDatum, OwnershipRegistryDatum } from "@/transactions/type";
import { parseInlineDatum } from "@sidan-lab/sidan-csl";
import multihashes from "multihashes";

export const decodeOnchainRecord = (hexString: string) => {
  const decodedBytes = Buffer.from("1220" + hexString, "hex");
  const decodedIpfsHash = multihashes.toB58String(decodedBytes);
  return decodedIpfsHash;
};

export const parseContentRegistry = (contentRegistryPlutusData: string): string[] =>
  parseInlineDatum<any, ContentRegistryDatum>({
    inline_datum: contentRegistryPlutusData as string,
  }).fields[1].list.map((datum) => decodeOnchainRecord(datum.bytes));

export const parseOwnershipRegistry = (ownershipRegistryPlutusData: string): string[] =>
  parseInlineDatum<any, OwnershipRegistryDatum>({
    inline_datum: ownershipRegistryPlutusData as string,
  }).fields[1].list.map((datum) => datum.list[0].bytes + datum.list[1].bytes);
