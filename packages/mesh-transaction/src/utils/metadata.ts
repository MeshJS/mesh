import JSONBig from "json-bigint";
import { Metadata } from "@meshsdk/common";

type ValueType = "array" | "object" | "primitive" | "nullish";

export type MetadataMergeLevel = boolean | number;

const getMergeDepth = (mergeOption: MetadataMergeLevel): number => {
    return typeof mergeOption === "number"
        ? mergeOption
        : mergeOption === true
            ? 1
            : 0;
}

const getType = (value: unknown): ValueType => {
    if (Array.isArray(value))
        return "array";
    if (value !== null && typeof value === "object")
        return "object";
    if (value === null || value === undefined)
        return "nullish";
    return "primitive";
}

/**
 * Recursively merge two items. Returns the 2nd item if the maximum allowed
 * merge depth has passed.
 * 
 * Merging objects ({ key: value }):
 * Two objects are merged by recursively including the (key, value) pairs from both the objects.
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
const mergeContents = (a: any, b: any, currentDepth: number): any => {
    const type_a = getType(a);
    const type_b = getType(b);

    if (currentDepth <= 0 || type_a === "nullish" || type_b === "nullish") {
        // Tend to return the 2nd item, which is supposed to be the updated one
        // If both are nullish, 2nd item is returned
        return b ?? a ?? b;
    }

    if (type_a === "primitive" && type_b === "primitive") {
        if (a === b) {
            return b;
        } else {
            throw new Error(`Tx metadata merge error: cannot merge ${a} with ${b}`);
        }
    }

    else if (type_a === "array" && type_b === "array") {
        return [...a, ...b];
    }

    else if (type_a === "object" && type_b === "object") {
        for (const key in b) {
            Object.assign(a, { [key]: mergeContents(a[key], b[key], currentDepth - 1) });
        }
        return a;
    }

    throw new Error(`Tx metadata merge error: cannot merge ${type_a} type with ${type_b} type`);
}

const mergeChosenMetadata = (metadataArr: string[], tag: string, mergeDepth: number): Metadata[] => {
    if (!metadataArr.length)
        return [];

    // Assuming all the elements are JSON stringified, parse them first
    for (let i = 0; i < metadataArr.length; i++) {
        try {
            metadataArr[i] = JSONBig.parse(metadataArr[i]!);
        } catch (e) {
            throw new Error(`Tx metadata merge error: cannot parse metadata value: ${e}`);
        }
    }

    let mergedSoFar = metadataArr[0];

    for (let i = 1; i < metadataArr.length; i++) {
        mergedSoFar = mergeContents(mergedSoFar, metadataArr[i], mergeDepth);
    }

    return [{ tag, metadata: JSONBig.stringify(mergedSoFar) }];
};

/**
 * Merges multiple metadata entries in an array of metadata that belong to the same tag.
 * Can merge objects upto a defined depth.
 * 
 * @param metadataList metadata array of meshTxBuilderBody
 * @param tag tag value to group all the metadata belonging to that same tag
 * @param mergeOption the effective depth till which the merge will happen,
 *      beyond this depth, the newer element would replace the older one.
 *      If false or 0, the latest metadata entry with the specified tag is preserved
 *      and the earlier ones are discarded
 * @returns metadata array for meshTxBuilderBody; with  all the metadata entries not belonging
 *      to the specified tag are preserved
 */
export const mergeAllMetadataByTag = (metadataList: Metadata[], tag: string, mergeOption: MetadataMergeLevel): Metadata[] => {
    const mergeDepth = getMergeDepth(mergeOption);

    const chosenElementsMetadata = [];
    const restElements = [];

    for (const metadata of metadataList) {
        if (metadata.tag == tag) {  // Number can also match here
            chosenElementsMetadata.push(metadata.metadata);
        } else {
            restElements.push(metadata);
        }
    }

    const mergedItem = mergeChosenMetadata(chosenElementsMetadata, tag, mergeDepth);

    return [...restElements, ...mergedItem];
}
