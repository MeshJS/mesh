use cardano/address.{from_script}
use mocktail.{
  mock_policy_id, mock_pub_key_hash, mock_script_hash,
  mock_script_stake_key_hash,
}
use types.{CrowdfundDatum}

pub const mock_auth_token = mock_policy_id(0)

pub const mock_share_token = mock_policy_id(1)

pub const mock_completion_script = mock_script_hash(0)

pub const mock_crowdfund_spend_script_hash = mock_script_hash(1)

pub const mock_crowdfund_stake_script_hash = mock_script_stake_key_hash(0)

pub const mock_crowdfund_address = from_script(mock_crowdfund_spend_script_hash)

pub const mock_fee_address = from_script("fee_address")

pub const mock_fundraise_target = 100000000000

pub const mock_deadline = 1750735607

pub const mock_expiry_buffer = 3600 * 24

pub const mock_min_charge = 10

pub fn mock_crowdfund_datum(
  current_fundraised_amount: Int,
  allow_over_subscription: Bool,
) {
  CrowdfundDatum {
    completion_script: mock_completion_script,
    share_token: mock_share_token,
    crowdfund_address: mock_crowdfund_address,
    fundraise_target: mock_fundraise_target,
    current_fundraised_amount,
    allow_over_subscription,
    deadline: mock_deadline,
    expiry_buffer: mock_expiry_buffer,
    fee_address: mock_fee_address,
    min_charge: mock_min_charge,
  }
}

pub const mock_current_fundraised_amount = 2000000

pub const mock_extra_fundraised_amount = 4000000

pub const mock_contribute_less_than_min_fundraised_amount = 1999999

pub const mock_contribute_min_fundraised_amount = 2000000

pub const mock_contribute_over_fundraised_amount = 100000000001

pub const auth_allow_over_subscription =
  mock_crowdfund_datum(mock_current_fundraised_amount, True)

pub const auth_not_allow_over_subscription =
  mock_crowdfund_datum(mock_current_fundraised_amount, False)

pub const mock_proposer_key_hash = mock_pub_key_hash(0)
