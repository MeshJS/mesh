import { fromChainVariableFee, toRoyaltyUnit, type Royalty, type RoyaltyInfoType, RoyaltyInfoShape } from './common/royalties.ts';
import { toBech32Address } from "./common/chain.ts";
import { Lucid } from 'https://deno.land/x/lucid@0.10.7/mod.ts';

export function toRoyaltyInfo(lucid: Lucid, chainInfo: RoyaltyInfoType): Royalty[] {
  const { metadata } = chainInfo;
  let royalties: Royalty[] = [];
  metadata.forEach((royalty) => {
    royalties.push({
      address: toBech32Address(lucid, royalty.address),
      fee: fromChainVariableFee(royalty.fee),
      minFee: royalty.minFee ? Number(royalty.minFee) : undefined,
      maxFee: royalty.maxFee ? Number(royalty.maxFee) : undefined,
    });
  });

  return royalties;
}

export async function extractRoyaltyInfo(lucid: Lucid, policy: string) {
  try {
    const utxo = await lucid.utxoByUnit(toRoyaltyUnit(policy));
    if (utxo) {
      const chainInfo = await lucid.datumOf(utxo, RoyaltyInfoShape);
      return toRoyaltyInfo(lucid, chainInfo);
    } else return undefined;
  } catch (err) {
    console.log('Error getting royalties');
    console.log(err);
  }
  return undefined;
}
