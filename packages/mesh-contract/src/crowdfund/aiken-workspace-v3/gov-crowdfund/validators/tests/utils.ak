use cardano/address.{from_script}
use mocktail.{mock_policy_id, mock_script_hash}

pub const mock_auth_token = mock_policy_id(0)

pub const mock_completion_script = mock_script_hash(0)

pub const mock_spend_script_hash = mock_script_hash(1)

pub const mock_crowdfund_address = from_script(mock_spend_script_hash)
