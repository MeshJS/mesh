use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Credential, from_script}
use cardano/assets.{Lovelace, lovelace_of}
use cardano/certificate.{
  Certificate, DelegateBlockProduction, DelegateBoth, DelegateCredential,
  DelegateRepresentative, DelegateVote, RegisterCredential,
  RegisterDelegateRepresentative, StakePoolId, UnregisterCredential,
  UnregisterDelegateRepresentative,
}
use cardano/transaction.{Input, Output, Redeemer, ScriptPurpose, Spend}
use cocktail.{inputs_at}
use types.{CrowdfundRedeemer}

pub fn redeemer_with_input(
  redeemers: Pairs<ScriptPurpose, Redeemer>,
  input: Input,
) -> Option<Data> {
  let output_reference = input.output_reference
  redeemers |> pairs.get_first(Spend(output_reference))
}

pub fn register_stake_certificate(
  certificates: List<Certificate>,
  credential: Credential,
) {
  list.has(certificates, RegisterCredential { credential, deposit: Never })
}

pub fn unregister_stake_certificate(
  certificates: List<Certificate>,
  credential: Credential,
) {
  list.has(certificates, UnregisterCredential { credential, refund: Never })
}

pub fn register_drep_certificate(
  certificates: List<Certificate>,
  credential: Credential,
  deposit: Lovelace,
) {
  list.has(
    certificates,
    RegisterDelegateRepresentative {
      delegate_representative: credential,
      deposit,
    },
  )
}

pub fn unregister_drep_certificate(
  certificates: List<Certificate>,
  credential: Credential,
  refund: Lovelace,
) {
  list.has(
    certificates,
    UnregisterDelegateRepresentative {
      delegate_representative: credential,
      refund,
    },
  )
}

pub fn delegate_vote_certificate(
  certificates: List<Certificate>,
  credential: Credential,
  delegate_representative: DelegateRepresentative,
) {
  list.has(
    certificates,
    DelegateCredential {
      credential,
      delegate: DelegateVote { delegate_representative },
    },
  )
}

pub fn delegate_stake_certificate(
  certificates: List<Certificate>,
  credential: Credential,
  stake_pool: StakePoolId,
) {
  list.has(
    certificates,
    DelegateCredential {
      credential,
      delegate: DelegateBlockProduction { stake_pool },
    },
  )
}

pub fn delegate_stake_and_vote_certificate(
  certificates: List<Certificate>,
  credential: Credential,
  stake_pool: StakePoolId,
  delegate_representative: DelegateRepresentative,
) {
  list.has(
    certificates,
    DelegateCredential {
      credential,
      delegate: DelegateBoth { stake_pool, delegate_representative },
    },
  )
}

pub fn check_lovelace_diff(input: Input, output: Output, diff: Lovelace) {
  let lovelace_from_input_output = input.output.value |> lovelace_of()
  let lovelace_from_output = output.value |> lovelace_of()

  lovelace_from_output - lovelace_from_input_output == diff
}

pub fn check_spend_script_input_redeemer(
  spend: ByteArray,
  inputs: List<Input>,
  redeemers: Pairs<ScriptPurpose, Redeemer>,
  redeemer: CrowdfundRedeemer,
) {
  let spend_address = from_script(spend)
  expect [only_input] = inputs_at(inputs, spend_address)
  expect Some(only_inpuy_redeemer_data) =
    redeemer_with_input(redeemers, only_input)

  expect only_input_redeemer: CrowdfundRedeemer = only_inpuy_redeemer_data

  only_input_redeemer == redeemer
}
