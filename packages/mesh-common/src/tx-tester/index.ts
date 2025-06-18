import { MeshValue } from "../data";
import {
  MeshTxBuilderBody,
  MintParam,
  Output,
  TxIn,
  txInToUtxo,
} from "../types";

// Import testing functions from submodules

/**
 * TxTester class for evaluating transactions
 */
export class TxTester {
  txBody: MeshTxBuilderBody;
  inputsEvaluating: TxIn[];
  outputsEvaluating: Output[];
  traces: string[];

  /**
   * Create a new TxTester instance
   * @param txBody The transaction builder body
   */
  constructor(txBody: MeshTxBuilderBody) {
    this.txBody = { ...txBody };
    this.inputsEvaluating = [];
    this.outputsEvaluating = [];
    this.traces = [];
  }

  /**
   * Add a trace to the TxTester
   * @param funcName The function name where the error occurred
   * @param message The error message
   */
  addTrace(funcName: string, message: string): void {
    const msg = `[Error - ${funcName}]: ${message}`;
    this.traces.push(msg);
  }

  /**
   * Check if the transaction evaluation was successful
   * @returns true if there are no errors, false otherwise
   */
  success(): boolean {
    return this.traces.length === 0;
  }

  /**
   * Get the error messages if any
   * @returns A string representation of the errors or "No errors" if there are none
   */
  errors(): string {
    if (this.traces.length > 0) {
      return `${this.traces}`;
    } else {
      return "No errors";
    }
  }

  /**
   * Checks if the transaction is valid after a specified timestamp.
   * @param requiredTimestamp The timestamp after which the transaction should be valid
   * @returns The TxTester instance for chaining
   */
  validAfter = (requiredTimestamp: number): this => {
    const invalidBefore = this.txBody.validityRange?.invalidHereafter
      ? this.txBody.validityRange.invalidHereafter
      : 9999_999_999_999; // A very large number representing "no limit"

    const isValidAfter = this.txBody.validityRange?.invalidBefore
      ? this.txBody.validityRange.invalidBefore < requiredTimestamp
      : true;

    if (!isValidAfter) {
      this.addTrace(
        "validAfter",
        `tx invalid before ${invalidBefore}, with requiredTimestamp ${requiredTimestamp}`,
      );
    }
    return this;
  };

  /**
   * Checks if the transaction is valid before a specified timestamp.
   * @param requiredTimestamp The timestamp before which the transaction should be valid
   * @returns The TxTester instance for chaining
   */
  validBefore = (requiredTimestamp: number): this => {
    const invalidHereafter = this.txBody.validityRange?.invalidBefore
      ? this.txBody.validityRange.invalidBefore
      : 0; // Representing "no limit"

    const isValidBefore = this.txBody.validityRange?.invalidHereafter
      ? this.txBody.validityRange.invalidHereafter > requiredTimestamp
      : true;

    if (!isValidBefore) {
      this.addTrace(
        "validBefore",
        `tx invalid after ${invalidHereafter}, with requiredTimestamp ${requiredTimestamp}`,
      );
    }

    return this;
  };

  // Extra Signatories Methods

  /**
   * Checks if a specific key is signed in the transaction.
   * @param keyHash The key hash to check
   * @returns The TxTester instance for chaining
   */
  keySigned = (keyHash: string): this => {
    const isKeySigned = keySignedLogic(this.txBody.requiredSignatures, keyHash);
    if (!isKeySigned) {
      this.addTrace("keySigned", `tx does not have key ${keyHash} signed`);
    }
    return this;
  };

  /**
   * Checks if any one of the specified keys is signed in the transaction.
   * @param keyHashes The array of key hashes to check
   * @returns The TxTester instance for chaining
   */
  oneOfKeysSigned = (keyHashes: string[]): this => {
    const isOneOfKeysSigned = keyHashes.some((keyHash) =>
      keySignedLogic(this.txBody.requiredSignatures, keyHash),
    );

    if (!isOneOfKeysSigned) {
      this.addTrace(
        "oneOfKeysSigned",
        `tx does not have any of the keys signed: ${keyHashes.join(", ")}`,
      );
    }
    return this;
  };

  /**
   * Checks if all specified keys are signed in the transaction.
   * @param keyHashes The array of key hashes to check
   * @returns The TxTester instance for chaining
   */
  allKeysSigned = (keyHashes: string[]): this => {
    const missingKeys: string[] = [];

    const isAllKeysSigned = keyHashes.every((keyHash) => {
      const isKeySigned = keySignedLogic(
        this.txBody.requiredSignatures,
        keyHash,
      );
      if (!isKeySigned) {
        missingKeys.push(keyHash);
      }
      return isKeySigned;
    });

    if (!isAllKeysSigned) {
      this.addTrace(
        "allKeysSigned",
        `tx does not have all keys signed: ${missingKeys.join(", ")}`,
      );
    }
    return this;
  };

  /**
   * Checks if a specific token is minted in the transaction.
   * @param policyId The policy ID of the token
   * @param assetName The asset name of the token
   * @param quantity The quantity of the token
   * @returns The TxTester instance for chaining
   */
  tokenMinted = (
    policyId: string,
    assetName: string,
    quantity: number,
  ): this => {
    const isTokenMinted = tokenMintedLogic(
      this.txBody.mints,
      policyId,
      assetName,
      quantity,
    );

    if (!isTokenMinted) {
      this.addTrace(
        "tokenMinted",
        `Token with policy_id: ${policyId}, asset_name: ${assetName}, quantity: ${quantity} not found in mints.`,
      );
    }

    return this;
  };

  /**
   * Checks if a specific token is minted in the transaction and that it is the only mint.
   * @param policyId The policy ID of the token
   * @param assetName The asset name of the token
   * @param quantity The quantity of the token
   * @returns The TxTester instance for chaining
   */
  onlyTokenMinted = (
    policyId: string,
    assetName: string,
    quantity: number,
  ): this => {
    const isTokenMinted = tokenMintedLogic(
      this.txBody.mints,
      policyId,
      assetName,
      quantity,
    );
    const isOnlyOneMint = this.txBody.mints?.length === 1;

    if (!isTokenMinted) {
      this.addTrace(
        "onlyTokenMinted",
        `Token with policy_id: ${policyId}, asset_name: ${assetName}, quantity: ${quantity} not found in mints`,
      );
    }

    if (!isOnlyOneMint) {
      this.addTrace(
        "onlyTokenMinted",
        `Expected only one mint, but found ${this.txBody.mints?.length || 0} mints.`,
      );
    }

    return this;
  };

  /**
   * Checks if a specific token is minted in the transaction, ensuring that it is the only mint for the given policy ID.
   * @param policyId The policy ID of the token
   * @param assetName The asset name of the token
   * @param quantity The quantity of the token
   * @returns The TxTester instance for chaining
   */
  policyOnlyMintedToken = (
    policyId: string,
    assetName: string,
    quantity: number,
  ): this => {
    const filteredMints =
      this.txBody.mints?.filter((token) => {
        return token.policyId === policyId;
      }) || [];

    const isTokenMinted = tokenMintedLogic(
      this.txBody.mints,
      policyId,
      assetName,
      quantity,
    );
    const isOnlyOneMint = filteredMints.length === 1;

    if (!isOnlyOneMint) {
      this.addTrace(
        "policyOnlyMintedToken",
        `Expected only one mint for policy_id: ${policyId}, but found ${filteredMints.length} mints.`,
      );
    }

    if (!isTokenMinted) {
      this.addTrace(
        "policyOnlyMintedToken",
        `Token with policy_id: ${policyId}, asset_name: ${assetName}, quantity: ${quantity} not found in mints.`,
      );
    }

    return this;
  };

  /**
   * Checks if a specific policy ID is burned in the transaction, ensuring that it is the only minting (i.e. burning item).
   * @param policyId The policy ID to check
   * @returns true if the policy is the only burn, false otherwise
   */
  checkPolicyOnlyBurn = (policyId: string): boolean => {
    const filteredMints =
      this.txBody.mints?.filter((token) => {
        return (
          token.policyId === policyId &&
          token.mintValue.findIndex((m) => BigInt(m.amount) > 0) >= 0
        );
      }) || [];

    return filteredMints.length === 0;
  };

  /**
   * Not apply filter to inputs
   * @returns The TxTester instance for chaining
   */
  allInputs = (): this => {
    this.inputsEvaluating = this.txBody.inputs?.slice() || [];
    return this;
  };

  /**
   * Filter inputs by address
   * @param address The address to filter by
   * @returns The TxTester instance for chaining
   */
  inputsAt = (address: string): this => {
    this.inputsEvaluating =
      this.txBody.inputs?.filter(
        (input) => txInToUtxo(input.txIn).output.address === address,
      ) || [];
    return this;
  };

  /**
   * Filter inputs by unit
   * @param unit The unit to filter by
   * @returns The TxTester instance for chaining
   */
  inputsWith = (unit: string): this => {
    this.inputsEvaluating =
      this.txBody.inputs?.filter((input) => {
        const inputValue = MeshValue.fromAssets(
          txInToUtxo(input.txIn).output.amount,
        );
        const quantity = inputValue.get(unit);
        return quantity > 0;
      }) || [];
    return this;
  };

  /**
   * Filter inputs by policy ID
   * @param policyId The policy ID to filter by
   * @returns The TxTester instance for chaining
   */
  inputsWithPolicy = (policyId: string): this => {
    this.inputsEvaluating =
      this.txBody.inputs?.filter((input) => {
        const inputValue = MeshValue.fromAssets(
          txInToUtxo(input.txIn).output.amount,
        );
        const assets = inputValue.getPolicyAssets(policyId);
        return assets.length > 0;
      }) || [];
    return this;
  };

  /**
   * Filter inputs by address and policy ID
   * @param address The address to filter by
   * @param policyId The policy ID to filter by
   * @returns The TxTester instance for chaining
   */
  inputsAtWithPolicy = (address: string, policyId: string): this => {
    this.inputsEvaluating =
      this.txBody.inputs?.filter((input) => {
        const utxo = txInToUtxo(input.txIn);
        const inputValue = MeshValue.fromAssets(utxo.output.amount);
        const assets = inputValue.getPolicyAssets(policyId);
        return utxo.output.address === address && assets.length > 0;
      }) || [];
    return this;
  };

  /**
   * Filter inputs by address and unit
   * @param address The address to filter by
   * @param unit The unit to filter by
   * @returns The TxTester instance for chaining
   */
  inputsAtWith = (address: string, unit: string): this => {
    this.inputsEvaluating =
      this.txBody.inputs?.filter((input) => {
        const utxo = txInToUtxo(input.txIn);
        const inputValue = MeshValue.fromAssets(utxo.output.amount);
        const quantity = inputValue.get(unit);
        return utxo.output.address === address && quantity > 0;
      }) || [];
    return this;
  };

  /**
   * Check if inputs contain the expected value.
   * *Reminder - It must be called after filtering methods for inputs*
   * @param expectedValue The expected value
   * @returns The TxTester instance for chaining
   */
  inputsValue = (expectedValue: any): this => {
    let value = new MeshValue();
    this.inputsEvaluating.forEach((input) => {
      const utxo = txInToUtxo(input.txIn);
      value.addAssets(utxo.output.amount);
    });

    const isValueCorrect = value.eq(expectedValue);
    if (!isValueCorrect) {
      this.addTrace(
        "inputsValue",
        `inputs ${JSON.stringify(this.inputsEvaluating)} have value ${JSON.stringify(value)}, expect ${JSON.stringify(expectedValue)}`,
      );
    }
    return this;
  };

  // /**
  //  * Check if inputs contain a specific inline datum.
  //  * *Reminder - It must be called after filtering methods for inputs*
  //  * @param datumCbor The datum CBOR to check
  //  * @returns The TxTester instance for chaining
  //  */
  // inputsInlineDatumExist = (datumCbor: string): this => {
  //   const inputsWithInlineDatum = this.inputsEvaluating.filter((input) => {
  //     const utxo = txInToUtxo(input.txIn);
  //     return utxo.output.plutusData === datumCbor;
  //   });

  //   if (inputsWithInlineDatum.length === 0) {
  //     this.addTrace(
  //       "inputsInlineDatumExist",
  //       `No inputs with inline datum matching: ${datumCbor}`,
  //     );
  //   }
  //   return this;
  // };

  /**
   * Not apply filter to outputs
   * @returns The TxTester instance for chaining
   */
  allOutputs = (): this => {
    this.outputsEvaluating = this.txBody.outputs?.slice() || [];
    return this;
  };

  /**
   * Filter outputs by address
   * @param address The address to filter by
   * @returns The TxTester instance for chaining
   */
  outputsAt = (address: string): this => {
    this.outputsEvaluating =
      this.txBody.outputs?.filter((output) => output.address === address) || [];
    return this;
  };

  /**
   * Filter outputs by unit
   * @param unit The unit to filter by
   * @returns The TxTester instance for chaining
   */
  outputsWith = (unit: string): this => {
    this.outputsEvaluating =
      this.txBody.outputs?.filter((output) => {
        const outputValue = MeshValue.fromAssets(output.amount);
        const quantity = outputValue.get(unit);
        return quantity > 0;
      }) || [];
    return this;
  };

  /**
   * Filter outputs by policy ID
   * @param policyId The policy ID to filter by
   * @returns The TxTester instance for chaining
   */

  outputsWithPolicy = (policyId: string): this => {
    this.outputsEvaluating =
      this.txBody.outputs?.filter((output) => {
        const outputValue = MeshValue.fromAssets(output.amount);
        const assets = outputValue.getPolicyAssets(policyId);
        return assets.length > 0;
      }) || [];
    return this;
  };

  /**
   * Filter outputs by address and policy ID
   * @param address The address to filter by
   * @param policyId The policy ID to filter by
   * @returns The TxTester instance for chaining
   */
  outputsAtWithPolicy = (address: string, policyId: string): this => {
    this.outputsEvaluating =
      this.txBody.outputs?.filter((output) => {
        const outputValue = MeshValue.fromAssets(output.amount);
        const assets = outputValue.getPolicyAssets(policyId);
        return output.address === address && assets.length > 0;
      }) || [];
    return this;
  };

  /**
   * Filter outputs by address and unit
   * @param address The address to filter by
   * @param unit The unit to filter by
   * @returns The TxTester instance for chaining
   */
  outputsAtWith = (address: string, unit: string): this => {
    this.outputsEvaluating =
      this.txBody.outputs?.filter((output) => {
        const outputValue = MeshValue.fromAssets(output.amount);
        const quantity = outputValue.get(unit);
        return output.address === address && quantity > 0;
      }) || [];
    return this;
  };

  /**
   * Check if outputs contain the expected value.
   * *Reminder - It must be called after filtering methods for outputs*
   * @param expectedValue The expected value
   * @returns The TxTester instance for chaining
   */
  outputsValue = (expectedValue: MeshValue): this => {
    let value = new MeshValue();
    this.outputsEvaluating.forEach((output) => {
      value.addAssets(output.amount);
    });

    const isValueCorrect = value.eq(expectedValue);
    if (!isValueCorrect) {
      this.addTrace(
        "outputsValue",
        `tx outputs ${JSON.stringify(this.outputsEvaluating)} have value ${JSON.stringify(value)}, expected ${JSON.stringify(expectedValue)}`,
      );
    }
    return this;
  };

  /**
   * Check if outputs contain a specific inline datum.
   * *Reminder - It must be called after filtering methods for outputs*
   * @param datumCbor The datum CBOR to check
   * @returns The TxTester instance for chaining
   */
  outputsInlineDatumExist = (datumCbor: string): this => {
    const outputsWithInlineDatum = this.outputsEvaluating.filter((output) => {
      if (output.datum && output.datum.type === "Inline") {
        return output.datum.data.content === datumCbor;
      }
      return false;
    });

    if (outputsWithInlineDatum.length === 0) {
      this.addTrace(
        "outputs_inline_datum_exist",
        `No outputs with inline datum matching: ${datumCbor}`,
      );
    }
    return this;
  };
}

/**
 * Internal logic to check if a key is signed
 * @param requiredSignatures The required signatures of the tx builder body
 * @param keyHash The key hash to check
 * @returns true if the key is signed, false otherwise
 */
export function keySignedLogic(
  requiredSignatures: string[],
  keyHash: string,
): boolean {
  return (
    requiredSignatures?.some((signatory: string) => signatory === keyHash) ||
    false
  );
}

/**
 * Internal logic to check if a token is minted
 * @param mints The mints info of the tx builder body
 * @param policyId The policy ID of the token
 * @param assetName The asset name of the token
 * @param quantity The quantity of the token
 * @returns true if the token is minted, false otherwise
 */
export function tokenMintedLogic(
  mints: MintParam[],
  policyId: string,
  assetName: string,
  quantity: number,
): boolean {
  return (
    mints?.some((token) => {
      return (
        token.policyId === policyId &&
        token.mintValue.findIndex(
          (m) =>
            m.assetName === assetName && BigInt(m.amount) === BigInt(quantity),
        ) >= 0
      );
    }) || false
  );
}
