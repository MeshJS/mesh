import {
  buildDataCost,
  buildTxBuilder,
  toAddress,
  toPlutusData,
  toRelay,
  toValue,
} from '@mesh/common/utils';
import {
  Asset,
  BuilderData,
  Certificate,
  MeshTxBuilderBody,
  Metadata,
  MintItem,
  Output,
  PoolParams,
  Protocol,
  PubKeyTxIn,
  Quantity,
  RefTxIn,
  RequiredWith,
  ScriptSourceInfo,
  ScriptTxIn,
  TxIn,
  TxInParameter,
  UTxO,
  Unit,
  ValidityRange,
} from '..';
import { TransactionBuilder, csl, selectUtxos } from '@mesh/core';
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  LANGUAGE_VERSIONS,
} from '@mesh/common/constants';
import JSONbig from 'json-bigint';
import { signTransaction } from '@meshsdk/mesh-csl';

export const emptyTxBuilderBody = (): MeshTxBuilderBody => ({
  inputs: [],
  outputs: [],
  extraInputs: [],
  selectionThreshold: 0,
  collaterals: [],
  requiredSignatures: [],
  referenceInputs: [],
  mints: [],
  changeAddress: '',
  metadata: [],
  validityRange: {},
  certificates: [],
  signingKey: [],
});

export interface IMeshSerializer {
  serializeTxBody(txBody: MeshTxBuilderBody, protocolParams: Protocol): string;
  addSigningKeys(txHex: string, signingKeys: string[]): string;
}

export class CSLSerializer implements IMeshSerializer {
  txBuilder: TransactionBuilder;
  protocolParams: Protocol;
  meshTxBuilderBody: MeshTxBuilderBody = emptyTxBuilderBody();

  constructor(protocolParams?: Protocol) {
    this.protocolParams = protocolParams || DEFAULT_PROTOCOL_PARAMETERS;
    this.txBuilder = buildTxBuilder(protocolParams);
  }

  serializeTxBody(
    txBody: MeshTxBuilderBody,
    protocolParams?: Protocol
  ): string {
    if (protocolParams) {
      this.protocolParams = protocolParams;
    }
    this.txBuilder = buildTxBuilder(protocolParams);
    const {
      inputs,
      outputs,
      extraInputs,
      selectionThreshold,
      collaterals,
      referenceInputs,
      mints,
      changeAddress,
      certificates,
      validityRange,
      requiredSignatures,
      metadata,
    } = txBody;

    if (extraInputs.length > 0) {
      this.addUtxosFrom(extraInputs, String(selectionThreshold));
    }

    this.removeDuplicateInputs();

    mints.sort((a, b) => a.policyId.localeCompare(b.policyId));
    inputs.sort((a, b) => {
      if (a.txIn.txHash === b.txIn.txHash) {
        return a.txIn.txIndex - b.txIn.txIndex;
      } else {
        return a.txIn.txHash.localeCompare(b.txIn.txHash);
      }
    });

    this.addAllInputs(inputs);
    this.addAllOutputs(outputs);
    this.addAllCollaterals(collaterals);
    this.addAllReferenceInputs(referenceInputs);
    this.addAllMints(mints);
    this.addAllCertificates(certificates);
    this.addValidityRange(validityRange);
    this.addAllRequiredSignatures(requiredSignatures);
    this.addAllMetadata(metadata);

    this.addCostModels();
    if (changeAddress) {
      // Hacky fix to set a dummy collateral return so fees are calculated correctly
      const totalCollateral = collaterals
        .map(
          (collateral) =>
            collateral.txIn.amount?.find((asset) => asset.unit === 'lovelace')
              ?.quantity || '0'
        )
        .reduce((acc, curr) => acc + parseInt(curr), 0);

      const collateralEstimate = Math.ceil(
        (this.protocolParams.collateralPercent *
          Number(
            Number(
              this.txBuilder
                .min_fee()
                .checked_add(csl.BigNum.from_str('10000'))
                .to_js_value()
            )
          )) /
          100
      );

      let collateralReturnNeeded = false;

      if (totalCollateral - collateralEstimate > 0) {
        const collateralEstimateOutput = csl.TransactionOutput.new(
          csl.Address.from_bech32(changeAddress),
          csl.Value.new(csl.BigNum.from_str(String(collateralEstimate)))
        );

        if (
          totalCollateral - collateralEstimate >
          Number(
            csl
              .min_ada_for_output(
                collateralEstimateOutput,
                csl.DataCost.new_coins_per_byte(
                  csl.BigNum.from_str(this.protocolParams.coinsPerUTxOSize)
                )
              )
              .to_js_value()
          )
        ) {
          this.txBuilder.set_collateral_return(
            csl.TransactionOutput.new(
              csl.Address.from_bech32(changeAddress),
              csl.Value.new(csl.BigNum.from_str(String(totalCollateral)))
            )
          );
          this.txBuilder.set_total_collateral(
            csl.BigNum.from_str(String(totalCollateral))
          );
          collateralReturnNeeded = true;
        }
      }

      this.addChange(changeAddress);
      if (collateralReturnNeeded) this.addCollateralReturn(changeAddress);
    }

    const tx = this.txBuilder.build_tx();
    // const txJson = JSON.parse(tx.to_json());
    const txHex = tx.to_hex();
    return txHex;
  }

  addSigningKeys(txHex: string, signingKeys: string[]): string {
    if (signingKeys.length > 0) {
      return signTransaction(txHex, signingKeys);
    }
    return txHex;
  }

  private addUtxosFrom = (extraInputs: UTxO[], threshold: Quantity) => {
    const requiredAssets = this.meshTxBuilderBody.outputs.reduce(
      (map, output) => {
        const outputAmount = output.amount;
        outputAmount.forEach((asset) => {
          const { unit, quantity } = asset;
          const existingQuantity = Number(map.get(unit)) || 0;
          map.set(unit, String(existingQuantity + Number(quantity)));
        });
        return map;
      },
      new Map<Unit, Quantity>()
    );
    this.meshTxBuilderBody.inputs.reduce((map, input) => {
      const inputAmount = input.txIn.amount;
      inputAmount?.forEach((asset) => {
        const { unit, quantity } = asset;
        const existingQuantity = Number(map.get(unit)) || 0;
        map.set(unit, String(existingQuantity - Number(quantity)));
      });
      return map;
    }, requiredAssets);
    this.meshTxBuilderBody.mints.reduce((map, mint) => {
      const mintAmount: Asset = {
        unit: mint.policyId + mint.assetName,
        quantity: String(mint.amount),
      };
      const existingQuantity = Number(map.get(mintAmount.unit)) || 0;
      map.set(
        mintAmount.unit,
        String(existingQuantity - Number(mintAmount.quantity))
      );
      return map;
    }, requiredAssets);
    const selectedInputs = selectUtxos(extraInputs, requiredAssets, threshold);
    selectedInputs.forEach((input) => {
      const pubKeyTxIn: PubKeyTxIn = {
        type: 'PubKey',
        txIn: {
          txHash: input.input.txHash,
          txIndex: input.input.outputIndex,
          amount: input.output.amount,
          address: input.output.address,
        },
      };
      this.meshTxBuilderBody.inputs.push(pubKeyTxIn);
      this.addTxIn(pubKeyTxIn as RequiredWith<PubKeyTxIn, 'txIn'>);
    });
  };

  private makePlutusScriptSource = (
    scriptSourceInfo: Required<ScriptSourceInfo>
  ): csl.PlutusScriptSource => {
    const scriptHash = csl.ScriptHash.from_hex(
      scriptSourceInfo.spendingScriptHash
    );
    const scriptRefInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(scriptSourceInfo.txHash),
      scriptSourceInfo.txIndex
    );
    const scriptSource = csl.PlutusScriptSource.new_ref_input_with_lang_ver(
      scriptHash,
      scriptRefInput,
      LANGUAGE_VERSIONS[scriptSourceInfo.version]
    );
    return scriptSource;
  };

  // Below protected functions for completing tx building

  protected removeDuplicateInputs = () => {
    const inputs = this.meshTxBuilderBody.inputs;
    const getTxInId = (txIn: TxInParameter): string => {
      return `${txIn.txHash}#${txIn.txIndex}`;
    };
    const addedInputs: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const currentTxInId = getTxInId(inputs[i].txIn);
      if (addedInputs.includes(currentTxInId)) {
        inputs.splice(i, 1);
        i--;
      } else {
        addedInputs.push(currentTxInId);
      }
    }
  };

  private addAllInputs = (inputs: TxIn[]) => {
    for (let i = 0; i < inputs.length; i++) {
      const currentTxIn = inputs[i]; //TODO: add type
      switch (currentTxIn.type) {
        case 'PubKey':
          this.addTxIn(currentTxIn as RequiredWith<PubKeyTxIn, 'txIn'>);
          break;
        case 'Script':
          this.addScriptTxIn(
            currentTxIn as RequiredWith<ScriptTxIn, 'txIn' | 'scriptTxIn'>
          );
          break;
      }
    }
  };

  private addTxIn = (currentTxIn: RequiredWith<PubKeyTxIn, 'txIn'>) => {
    this.txBuilder.add_input(
      csl.Address.from_bech32(currentTxIn.txIn.address),
      csl.TransactionInput.new(
        csl.TransactionHash.from_hex(currentTxIn.txIn.txHash),
        currentTxIn.txIn.txIndex
      ),
      toValue(currentTxIn.txIn.amount)
    );
  };

  private addScriptTxIn = ({
    scriptTxIn,
    txIn,
  }: RequiredWith<ScriptTxIn, 'txIn' | 'scriptTxIn'>) => {
    let cslDatum: csl.DatumSource;
    const { datumSource, scriptSource, redeemer } = scriptTxIn;
    if (datumSource.type === 'Provided') {
      cslDatum = csl.DatumSource.new(
        this.castDataToPlutusData(datumSource.data)
      );
    } else {
      const refTxIn = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(datumSource.txHash),
        datumSource.txIndex
      );
      cslDatum = csl.DatumSource.new_ref_input(refTxIn);
    }
    let cslScript: csl.PlutusScriptSource;
    if (scriptSource.type == 'Inline') {
      cslScript = this.makePlutusScriptSource(
        scriptSource.txInInfo as Required<ScriptSourceInfo>
      );
    } else {
      cslScript = csl.PlutusScriptSource.new(
        csl.PlutusScript.from_hex_with_version(
          scriptSource.script.code,
          LANGUAGE_VERSIONS[scriptSource.script.version]
        )
      );
    }
    const cslRedeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_spend(),
      csl.BigNum.from_str('0'),
      this.castDataToPlutusData(redeemer.data),
      csl.ExUnits.new(
        csl.BigNum.from_str(String(redeemer.exUnits.mem)),
        csl.BigNum.from_str(String(redeemer.exUnits.steps))
      )
    );
    this.txBuilder.add_plutus_script_input(
      csl.PlutusWitness.new_with_ref(cslScript, cslDatum, cslRedeemer),
      csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txIn.txHash),
        txIn.txIndex
      ),
      toValue(txIn.amount)
    );
  };

  private addAllOutputs = (outputs: Output[]) => {
    for (let i = 0; i < outputs.length; i++) {
      const currentOutput = outputs[i];
      this.addOutput(currentOutput);
    }
  };

  private addOutput = ({ amount, address, datum, referenceScript }: Output) => {
    const txValue = toValue(amount);
    const multiAsset = txValue.multiasset();
    if (txValue.is_zero() && multiAsset === undefined)
      throw Error('Invalid output amount');

    let outputBuilder = csl.TransactionOutputBuilder.new().with_address(
      toAddress(address)
    );
    if (datum && datum.type === 'Hash') {
      outputBuilder = outputBuilder.with_data_hash(
        csl.hash_plutus_data(this.castDataToPlutusData(datum.data))
      );
    }
    if (datum && datum.type === 'Inline') {
      outputBuilder = outputBuilder.with_plutus_data(
        this.castDataToPlutusData(datum.data)
      );
    }
    if (referenceScript) {
      outputBuilder = outputBuilder.with_script_ref(
        csl.ScriptRef.new_plutus_script(
          csl.PlutusScript.from_hex_with_version(
            referenceScript.code,
            LANGUAGE_VERSIONS[referenceScript.version]
          )
        )
      );
    }
    const amountBuilder = outputBuilder.next();

    if (multiAsset) {
      const output = txValue.coin().is_zero()
        ? amountBuilder
            .with_asset_and_min_required_coin_by_utxo_cost(
              multiAsset,
              buildDataCost(this.protocolParams.coinsPerUTxOSize)
            )
            .build()
        : amountBuilder.with_coin_and_asset(txValue.coin(), multiAsset).build();
      this.txBuilder.add_output(output);
    } else {
      const output = amountBuilder.with_coin(txValue.coin()).build();
      this.txBuilder.add_output(output);
    }
  };

  private addAllCollaterals = (collaterals: PubKeyTxIn[]) => {
    const collateralBuilder = csl.TxInputsBuilder.new();
    for (let i = 0; i < collaterals.length; i++) {
      const currentCollateral = collaterals[i];
      this.addCollateral(
        collateralBuilder,
        currentCollateral as RequiredWith<PubKeyTxIn, 'txIn'>
      );
    }
    this.txBuilder.set_collateral(collateralBuilder);
  };

  private addCollateral = (
    collateralBuilder: csl.TxInputsBuilder,
    currentCollateral: RequiredWith<PubKeyTxIn, 'txIn'>
  ) => {
    collateralBuilder.add_input(
      csl.Address.from_bech32(currentCollateral.txIn.address),
      csl.TransactionInput.new(
        csl.TransactionHash.from_hex(currentCollateral.txIn.txHash),
        currentCollateral.txIn.txIndex
      ),
      toValue(currentCollateral.txIn.amount)
    );
  };

  private addCollateralReturn = (returnAddress: string) => {
    const currentFee = this.txBuilder.get_fee_if_set()?.to_js_value();
    if (currentFee) {
      const collateralAmount = Math.ceil(
        (this.protocolParams.collateralPercent * Number(currentFee)) / 100
      );
      this.txBuilder.set_total_collateral_and_return(
        csl.BigNum.from_str(String(collateralAmount)),
        csl.Address.from_bech32(returnAddress)
      );
    }
  };

  private addAllReferenceInputs = (refInputs: RefTxIn[]) => {
    refInputs.forEach((refInput) => {
      this.addReferenceInput(refInput);
    });
  };

  private addReferenceInput = ({ txHash, txIndex }: RefTxIn) => {
    const refInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(txHash),
      txIndex
    );
    this.txBuilder.add_reference_input(refInput);
  };

  protected addAllMints = (mints: MintItem[]) => {
    const mintBuilder = csl.MintBuilder.new();
    let plutusMintCount = 0;
    for (let i = 0; i < mints.length; i++) {
      const mintItem = mints[i] as Required<MintItem>;
      if (!mintItem.scriptSource)
        throw Error('Mint script is expected to be provided');
      if (mintItem.type === 'Plutus') {
        if (!mintItem.redeemer)
          throw Error('Missing mint redeemer information');
        this.addPlutusMint(mintBuilder, mintItem, plutusMintCount); // TODO: Update after csl update
        plutusMintCount++; // TODO: Remove after csl update
      } else if (mintItem.type === 'Native') {
        this.addNativeMint(mintBuilder, mintItem);
      }
    }
    this.txBuilder.set_mint_builder(mintBuilder);
  };

  private addPlutusMint = (
    mintBuilder: csl.MintBuilder,
    { redeemer, policyId, scriptSource, assetName, amount }: Required<MintItem>,
    redeemerIndex: number
  ) => {
    const newRedeemer: csl.Redeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_mint(),
      csl.BigNum.from_str(String(redeemerIndex)),
      this.castDataToPlutusData(redeemer.data),
      csl.ExUnits.new(
        csl.BigNum.from_str(String(redeemer.exUnits.mem)),
        csl.BigNum.from_str(String(redeemer.exUnits.steps))
      )
    );
    const script =
      scriptSource.type === 'Reference Script'
        ? csl.PlutusScriptSource.new_ref_input_with_lang_ver(
            csl.ScriptHash.from_hex(policyId),
            csl.TransactionInput.new(
              csl.TransactionHash.from_hex(scriptSource.txHash),
              scriptSource.txIndex
            ),
            LANGUAGE_VERSIONS[scriptSource.version]
          )
        : csl.PlutusScriptSource.new(
            csl.PlutusScript.from_hex_with_version(
              scriptSource.script.code,
              LANGUAGE_VERSIONS[scriptSource.script.version]
            )
          );

    mintBuilder.add_asset(
      csl.MintWitness.new_plutus_script(script, newRedeemer),
      csl.AssetName.new(Buffer.from(assetName, 'hex')),
      csl.Int.from_str(amount)
    );
  };

  private addNativeMint = (
    mintBuilder: csl.MintBuilder,
    { scriptSource, assetName, amount }: Required<MintItem>
  ) => {
    if (scriptSource.type === 'Reference Script')
      throw Error('Native mint cannot have reference script');
    mintBuilder.add_asset(
      csl.MintWitness.new_native_script(
        csl.NativeScript.from_hex(scriptSource.script.code)
      ),
      csl.AssetName.new(Buffer.from(assetName, 'hex')),
      csl.Int.from_str(amount)
    );
  };

  private decimalToFraction(
    decimal: number
  ): [numerator: number, denominator: number] {
    const powerOf10 = 10 ** decimal.toString().split('.')[1].length;
    const numerator = decimal * powerOf10;
    const denominator = powerOf10;

    return [numerator, denominator];
  }

  private toPoolParams = (poolParams: PoolParams): csl.PoolParams => {
    const marginFraction = this.decimalToFraction(poolParams.margin);
    const relays = csl.Relays.new();
    poolParams.relays.forEach((relay) => {
      relays.add(toRelay(relay));
    });
    const rewardAddress = csl.RewardAddress.from_address(
      csl.Address.from_bech32(poolParams.rewardAddress)
    );
    if (rewardAddress === undefined) {
      throw new Error('Reward address is invalid');
    }
    const poolOwners = csl.Ed25519KeyHashes.new();
    poolParams.owners.forEach((owner) => {
      poolOwners.add(csl.Ed25519KeyHash.from_hex(owner));
    });
    return csl.PoolParams.new(
      csl.Ed25519KeyHash.from_hex(poolParams.operator),
      csl.VRFKeyHash.from_hex(poolParams.VRFKeyHash),
      csl.BigNum.from_str(poolParams.pledge),
      csl.BigNum.from_str(poolParams.cost),
      csl.UnitInterval.new(
        csl.BigNum.from_str(marginFraction[0].toString()),
        csl.BigNum.from_str(marginFraction[1].toString())
      ),
      rewardAddress,
      poolOwners,
      relays,
      poolParams.metadata
        ? csl.PoolMetadata.from_json(JSONbig.stringify(poolParams.metadata))
        : undefined
    );
  };

  private addCertificate = (
    certificates: csl.Certificates,
    cert: Certificate
  ) => {
    switch (cert.type) {
      case 'RegisterPool':
        certificates.add(
          csl.Certificate.new_pool_registration(
            csl.PoolRegistration.new(this.toPoolParams(cert.poolParams))
          )
        );
        break;
      case 'RegisterStake':
        certificates.add(
          csl.Certificate.new_stake_registration(
            csl.StakeRegistration.new(
              csl.StakeCredential.from_keyhash(
                csl.Ed25519KeyHash.from_hex(cert.stakeKeyHash)
              )
            )
          )
        );
        break;
      case 'DelegateStake':
        certificates.add(
          csl.Certificate.new_stake_delegation(
            csl.StakeDelegation.new(
              csl.StakeCredential.from_keyhash(
                csl.Ed25519KeyHash.from_hex(cert.stakeKeyHash)
              ),
              cert.poolId.startsWith('pool')
                ? csl.Ed25519KeyHash.from_bech32(cert.poolId)
                : csl.Ed25519KeyHash.from_hex(cert.poolId)
            )
          )
        );
        break;
      case 'DeregisterStake':
        certificates.add(
          csl.Certificate.new_stake_deregistration(
            csl.StakeDeregistration.new(
              csl.StakeCredential.from_keyhash(
                csl.Ed25519KeyHash.from_hex(cert.stakeKeyHash)
              )
            )
          )
        );
        break;
      case 'RetirePool':
        certificates.add(
          csl.Certificate.new_pool_retirement(
            csl.PoolRetirement.new(
              cert.poolId.startsWith('pool')
                ? csl.Ed25519KeyHash.from_bech32(cert.poolId)
                : csl.Ed25519KeyHash.from_hex(cert.poolId),
              cert.epoch
            )
          )
        );
    }
  };

  protected addAllCertificates = (allCertificates: Certificate[]) => {
    const certificates = csl.Certificates.new();
    allCertificates.forEach((cert) => {
      this.addCertificate(certificates, cert);
    });
    this.txBuilder.set_certs(certificates);
  };

  protected addCostModels = () => {
    this.txBuilder.calc_script_data_hash(
      csl.TxBuilderConstants.plutus_vasil_cost_models()
    );
  };

  private addChange = (changeAddress: string) => {
    this.txBuilder.add_change_if_needed(csl.Address.from_bech32(changeAddress));
  };

  private addValidityRange = ({
    invalidBefore,
    invalidHereafter,
  }: ValidityRange) => {
    if (invalidBefore) {
      this.txBuilder.set_validity_start_interval_bignum(
        csl.BigNum.from_str(invalidBefore.toString())
      );
    }
    if (invalidHereafter) {
      this.txBuilder.set_ttl_bignum(
        csl.BigNum.from_str(invalidHereafter.toString())
      );
    }
  };

  private addAllRequiredSignatures = (requiredSignatures: string[]) => {
    requiredSignatures.forEach((pubKeyHash) => {
      this.txBuilder.add_required_signer(
        csl.Ed25519KeyHash.from_hex(pubKeyHash)
      );
    });
  };

  private addAllMetadata = (allMetadata: Metadata[]) => {
    allMetadata.forEach(({ tag, metadata }) => {
      this.txBuilder.add_json_metadatum(
        csl.BigNum.from_str(tag),
        JSONbig.stringify(metadata)
      );
    });
  };

  protected castRawDataToJsonString = (rawData: object | string) => {
    if (typeof rawData === 'object') {
      return JSONbig.stringify(rawData);
    } else {
      return rawData as string;
    }
  };

  protected castDataToPlutusData = ({ type, content }: BuilderData) => {
    if (type === 'Mesh') {
      return toPlutusData(content);
    }
    if (type === 'CBOR') {
      return csl.PlutusData.from_hex(content as string);
    }
    return csl.PlutusData.from_json(
      content as string,
      csl.PlutusDatumSchema.DetailedSchema
    );
  };
}
