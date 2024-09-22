use aiken/bytearray.{length, take}
use aiken/math
use aiken/transaction/credential.{
  Address, ScriptCredential, VerificationKeyCredential,
}
use aiken/transaction/value.{AssetName}

pub fn has_prefix(prefix: ByteArray, name: AssetName) -> Bool {
  take(name, length(prefix)) == prefix
}

pub fn distance(delta_x: Int, delta_y: Int) -> Int {
  math.abs(delta_x) + math.abs(delta_y)
}

pub fn required_fuel(distance: Int, fuel_per_step: Int) -> Int {
  distance * fuel_per_step
}

pub fn is_script_address(address: Address) -> Bool {
  when address.payment_credential is {
    VerificationKeyCredential(_) -> False
    ScriptCredential(_) -> True
  }
}
