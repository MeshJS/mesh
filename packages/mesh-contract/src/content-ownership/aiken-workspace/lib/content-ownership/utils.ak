use aiken/primitive/bytearray
use cardano/assets.{AssetName}
use content_ownership/common.{convert_int_to_bytes}

pub fn get_registry_token_name(count: Int) -> AssetName {
  bytearray.concat("Registry (", convert_int_to_bytes(count))
    |> bytearray.concat(")")
}
