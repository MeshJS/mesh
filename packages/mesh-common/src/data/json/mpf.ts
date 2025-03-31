import {
  conStr0,
  ConStr0,
  conStr1,
  ConStr1,
  conStr2,
  ConStr2,
} from "./constructors";
import { byteString, ByteString, integer, Integer } from "./primitives";

export type ProofStep = ProofStepBranch | ProofStepFork | ProofStepLeaf;
export type ProofStepBranch = ConStr0<
  [
    Integer, // skip
    ByteString, // neighbors
  ]
>;
export type ProofStepFork = ConStr1<
  [
    Integer, // skip
    ForkNeighbor, // neighbor
  ]
>;
export type ProofStepLeaf = ConStr2<
  [
    Integer, // skip
    ByteString, // key
    ByteString, // value
  ]
>;
export type ForkNeighbor = ConStr0<
  [
    Integer, // nibble
    ByteString, // prefix
    ByteString, // root
  ]
>;

/**
 * The utility function to transform a JSON proof from Aiken TS offchain library to Mesh JSON Data type
 * @param proof The proof object from Aiken TS offchain library
 * @returns The proof object in Mesh JSON Data type
 */
export const jsonProofToPlutusData = (proof: object): ProofStep[] => {
  const proofSteps: ProofStep[] = [];
  const proofJson = proof as any[];
  proofJson.forEach((proof) => {
    const skip = integer(proof.skip);
    switch (proof.type) {
      case "branch":
        proofSteps.push(
          conStr0([skip, byteString(proof.neighbors.toString("hex"))]),
        );
        break;
      case "fork":
        const { prefix, nibble, root } = proof.neighbor;
        const neighbor: ForkNeighbor = conStr0([
          integer(nibble),
          byteString(prefix.toString("hex")),
          byteString(root.toString("hex")),
        ]);
        proofSteps.push(conStr1([skip, neighbor]));
        break;
      case "leaf":
        const { key, value } = proof.neighbor;
        proofSteps.push(conStr2([skip, byteString(key), byteString(value)]));
        break;
    }
  });
  return proofSteps;
};
