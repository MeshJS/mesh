import * as cjsCbors from "@stricahq/cbors";

export const cbors: typeof cjsCbors & { default?: typeof cjsCbors } = cjsCbors;
const exportedCbors = cbors?.default || cbors;

export const StricaEncoder = exportedCbors.Encoder;

export const StricaDecoder = exportedCbors.Decoder;
export type StricaDecoder = cjsCbors.Decoder;
