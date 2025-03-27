/*
This file is part of meshjs.dev.

This source code is licensed under the MIT license found in the
LICENSE file in the root directory of this source tree. See the
Apache-2.0 License for more details.
*/

/**
 * MIT License
 *
 * Copyright (c) 2024 Evgenii Lisitskii
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Cbor, CborBytes } from "@harmoniclabs/cbor";
import { dataFromCbor } from "@harmoniclabs/plutus-data";
import {
  Application,
  encodeUPLC,
  parseUPLC,
  UPLCConst,
  UPLCProgram,
} from "@harmoniclabs/uplc";

import { Data, PlutusDataType } from "@meshsdk/common";

import { PlutusData } from "../types";
import { fromBuilderToPlutusData } from "../utils";

const supportedPlutusCoreVersions = [
  {
    version: [1, 0, 0],
    language: "Plutus V1",
  },
  {
    version: [1, 1, 0],
    language: "Plutus V3",
  },
];

export type OutputEncoding =
  | "SingleCBOR"
  | "DoubleCBOR"
  | "PurePlutusScriptBytes";

/**
 * Applies arguments to a Plutus script, effectively parameterizing the script with provided data.
 *
 * @param {Uint8Array[]} args - An array of arguments to be applied to the script, each as a Uint8Array.
 * @param {Uint8Array} program - The original Plutus script as a Uint8Array.
 * @param {OutputEncoding} outputEncoding - The desired encoding for the output.
 * @returns {Uint8Array} The modified Plutus script with applied arguments.
 *
 * @description
 * This function performs the following steps:
 * 1. Extracts the pure Plutus bytes from the input program.
 * 2. Parses the UPLC (Untyped Plutus Core) from the pure Plutus bytes.
 * 3. Decodes the provided arguments from CBOR format.
 * 4. Iterates through the decoded arguments, applying each as a term to the program body.
 * 5. Creates a new UPLC program with the modified body.
 * 6. Encodes the new program and applies the specified output encoding.
 *
 * @note
 * - This function modifies the structure of the Plutus script by applying arguments, which can change its behavior when executed.
 * - The function assumes that the input arguments are in a compatible format (CBOR-encoded) and that the program is a valid Plutus script.
 */
const applyArgsToPlutusScript = (
  args: Uint8Array[],
  program: Uint8Array,
  outputEncoding: OutputEncoding,
): Uint8Array => {
  const purePlutusBytes = getPurePlutusBytes(program);
  const parsedProgram = parseUPLC(purePlutusBytes, "flat");
  const decodedArgs = args.map((arg) => dataFromCbor(arg));
  let body = parsedProgram.body;

  for (const plutusData of decodedArgs) {
    const argTerm = UPLCConst.data(plutusData);
    body = new Application(body, argTerm);
  }

  const encodedProgram = new UPLCProgram(parsedProgram.version, body);
  const newPlutusScriptBytes = encodeUPLC(encodedProgram).toBuffer().buffer;
  return applyEncoding(newPlutusScriptBytes, outputEncoding);
};

/**
 * Normalizes a Plutus script by extracting its pure Plutus bytes and applying a specified encoding.
 *
 * @param {Uint8Array} plutusScript - The Plutus script to be normalized as a Uint8Array.
 * @param {OutputEncoding} encoding - The desired encoding for the output.
 * @returns {Uint8Array} The normalized Plutus script.
 *
 * @description
 * This function performs the following steps:
 * 1. Extracts the pure Plutus bytes in hex from the input script.
 * 2. Applies the specified encoding to the pure Plutus bytes.
 *
 * @note
 * - This function is useful for standardizing the format of Plutus scripts, ensuring they are in a consistent state for further processing or comparison.
 * - The normalization process does not modify the logical content of the script, only its representation.
 */
export const normalizePlutusScript = (
  plutusScript: string,
  encoding: OutputEncoding,
): string => {
  const bytes = Buffer.from(plutusScript, "hex");
  const purePlutusBytes = getPurePlutusBytes(bytes);
  const normalizedBytes = applyEncoding(purePlutusBytes, encoding);
  return Buffer.from(normalizedBytes).toString("hex");
};

const hasSupportedPlutusVersion = (plutusScript: Uint8Array): boolean => {
  if (plutusScript.length < 3) {
    return false;
  }
  const version = [plutusScript[0], plutusScript[1], plutusScript[2]];
  return supportedPlutusCoreVersions.some((supportedVersion) => {
    return (
      supportedVersion.version[0] === version[0] &&
      supportedVersion.version[1] === version[1] &&
      supportedVersion.version[2] === version[2]
    );
  });
};

const getPurePlutusBytes = (plutusScript: Uint8Array): Uint8Array => {
  let unwrappedScript = plutusScript;
  let length = 0;
  try {
    while (unwrappedScript.length >= 3 && length != unwrappedScript.length) {
      length = unwrappedScript.length;
      if (hasSupportedPlutusVersion(unwrappedScript)) {
        return unwrappedScript;
      }
      const cbor = Cbor.parse(unwrappedScript);
      if (cbor instanceof CborBytes) {
        unwrappedScript = cbor.bytes;
      } else {
        break;
      }
    }
  } catch (error) {
    console.error("Error parsing Plutus script:", error);
  }
  if (hasSupportedPlutusVersion(unwrappedScript)) {
    return unwrappedScript;
  }
  throw new Error("Unsupported Plutus version or invalid Plutus script bytes");
};

const applyCborEncoding = (plutusScript: Uint8Array): Uint8Array => {
  return Cbor.encode(new CborBytes(plutusScript)).toBuffer();
};

export const applyEncoding = (
  plutusScript: Uint8Array,
  outputEncoding: OutputEncoding,
): Uint8Array => {
  switch (outputEncoding) {
    case "SingleCBOR":
      return applyCborEncoding(plutusScript);
    case "DoubleCBOR":
      return applyCborEncoding(applyCborEncoding(plutusScript));
    case "PurePlutusScriptBytes":
      return plutusScript;
    default:
      return applyCborEncoding(plutusScript);
  }
};

export const applyParamsToScript = (
  rawScript: string,
  params: object[] | Data[],
  type: PlutusDataType = "Mesh",
): string => {
  let plutusParams: PlutusData[] = [];
  switch (type) {
    case "JSON":
      params.forEach((param) => {
        plutusParams.push(
          fromBuilderToPlutusData({
            type: "JSON",
            content: param as string,
          }),
        );
      });
      break;
    case "CBOR":
      params.forEach((param) => {
        plutusParams.push(
          fromBuilderToPlutusData({
            type: "CBOR",
            content: param as string,
          }),
        );
      });
      break;
    case "Mesh":
      params.forEach((param) => {
        plutusParams.push(
          fromBuilderToPlutusData({
            type: "Mesh",
            content: param as Data,
          }),
        );
      });
      break;
  }

  const byteParams = plutusParams.map((param) => {
    return Buffer.from(param.toCbor(), "hex");
  });

  const scriptHex = Buffer.from(
    applyArgsToPlutusScript(
      byteParams,
      Buffer.from(rawScript, "hex"),
      "DoubleCBOR",
    ),
  ).toString("hex");

  return scriptHex;
};
