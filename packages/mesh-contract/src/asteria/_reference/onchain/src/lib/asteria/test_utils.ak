use aiken/bytearray
use aiken/transaction.{Mint, ScriptPurpose, Spend}

/// Converts a given ScriptPurpose into a ByteArray representation.
///
/// This function is primarily designed to offer a way to uniquely represent different
/// `ScriptPurpose` variants in a `ByteArray` format. This is useful for operations like
/// comparisons, especially when we want to store these in a dictionary.
///
/// # Parameters:
/// - `sp`: The `ScriptPurpose` instance that needs to be converted.
///
/// # Returns:
/// A `ByteArray` representation of the provided `ScriptPurpose`.
fn script_purpose_to_byte_array(sp: ScriptPurpose) -> ByteArray {
  when sp is {
    Spend(ref) -> ref.transaction_id.hash
    Mint(policy_id) -> policy_id

    // Default case to handle any other unexpected variants.
    // It returns a generic ByteArray representation of "0".
    _ -> "0"
  }
}

/// Compares two ScriptPurpose instances.
///
/// This function leverages the `script_purpose_to_byte_array` function to convert each
/// `ScriptPurpose` into a `ByteArray` and then performs a comparison.
///
/// # Parameters:
/// - `a`: The first `ScriptPurpose` instance.
/// - `b`: The second `ScriptPurpose` instance.
///
/// # Returns:
/// An `Ordering` result (`Less`, `Equal`, or `Greater`) based on the comparison of the ByteArray
/// representations of the provided `ScriptPurpose` instances.
pub fn script_purpose_compare(a: ScriptPurpose, b: ScriptPurpose) -> Ordering {
  let byte_a = script_purpose_to_byte_array(a)
  let byte_b = script_purpose_to_byte_array(b)

  bytearray.compare(byte_a, byte_b)
}
