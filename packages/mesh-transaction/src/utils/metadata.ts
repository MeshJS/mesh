import JSONBig from "json-bigint";

import type { Metadatum, MetadatumMap } from "@meshsdk/common";

export type MetadataMergeLevel = boolean | number;

export const metadataObjToMap = (metadata: any): Metadatum => {
  if (typeof metadata === "bigint") {
    return metadata;
  } else if (typeof metadata === "string") {
    return metadata;
  } else if (typeof metadata === "number") {
    return metadata;
  } else if (metadata instanceof Uint8Array) {
    return metadata;
  } else if (Array.isArray(metadata)) {
    // Recursively process each element in the array
    return metadata.map(metadataObjToMap);
  } else if (metadata && typeof metadata === "object") {
    // Convert to MetadatumMap recursively
    const map: MetadatumMap = new Map();
    if (metadata instanceof Map) {
      // for Map
      metadata.forEach((value, key) => {
        map.set(metadataObjToMap(key), metadataObjToMap(value));
      });
    } else {
      // for Object
      Object.entries(metadata).forEach(([key, value]) => {
        map.set(metadataObjToMap(key), metadataObjToMap(value));
      });
    }
    return map;
  } else {
    throw new Error("Metadata map conversion: Unsupported metadata type");
  }
};

/**
 * Recursively merge two metadata. Returns the 2nd item if the maximum allowed
 * merge depth has passed.
 *
 * Merging maps ({ key: value }):
 * Two maps are merged by recursively including the (key, value) pairs from both the maps.
 * When further merge isn't allowed (by currentDepth), the 2nd item is preferred,
 * replacing the 1st item.
 *
 * Merging arrays:
 * Two arrays are merged by concatenating them.
 * When merge isn't allowed (by currentDepth), the 2nd array is returned.
 *
 * Merging primitive types (number, string, etc.):
 * Primitive types are not merged in the sense of concatenating. In case they are the same,
 * either of them can be considered as the "merged value". 2nd item is returned here.
 * When merge isn't allowed (by currentDepth), the 2nd item is returned.
 *
 * @param a first item
 * @param b second item
 * @param currentDepth the current merge depth; decreases in a recursive call
 * @returns merged item or a preferred item, chosen according to currentDepth
 */
export const mergeContents = (
  a: Metadatum,
  b: Metadatum,
  currentDepth: number,
): Metadatum => {
  // Handle no merge
  if (currentDepth <= 0) {
    return b;
  }
  // Handle merging of maps
  if (a instanceof Map && b instanceof Map) {
    b.forEach((value: Metadatum, key: Metadatum) => {
      if (a.has(key)) {
        a.set(
          key,
          mergeContents(a.get(key) as Metadatum, value, currentDepth - 1),
        );
      } else {
        a.set(key, value);
      }
    });
    return a;
  }
  // Handle merging of arrays
  else if (Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  }
  // Handle merging of primitive types
  if (
    (typeof a === "number" ||
      typeof a === "bigint" ||
      typeof a === "string" ||
      a instanceof Uint8Array) &&
    (typeof b === "number" ||
      typeof b === "bigint" ||
      typeof b === "string" ||
      b instanceof Uint8Array)
  ) {
    if (typeof a === typeof b) {
      if (a === b) {
        // Equal primitive types (string, number or bigint)
        return b;
      }
      if (
        a instanceof Uint8Array &&
        b instanceof Uint8Array &&
        areUint8ArraysEqual(a, b)
      ) {
        // Equal Uint8Array values
        return b;
      }
    }
    // If values are not equal or types are mismatched
    throw new Error(
      `Tx metadata merge error: cannot merge ${JSONBig.stringify(a)} with ${JSONBig.stringify(b)}`,
    );
  }

  // Unsupported or mismatched types
  throw new Error(
    `Tx metadata merge error: cannot merge ${getMetadatumType(a)} type with ${getMetadatumType(b)} type`,
  );
};

const getMergeDepth = (mergeOption: MetadataMergeLevel): number => {
  return typeof mergeOption === "number"
    ? mergeOption
    : mergeOption === true
      ? 1
      : 0;
};

const getMetadatumType = (a: Metadatum): string => {
  if (a instanceof Map) return "map";
  if (Array.isArray(a)) return "array";
  return "primitive";
};

const areUint8ArraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
