// parameterize against an identifying keyphrase to keep the address unique. addresses with many utxos can be slower to query against.
// by default I recommend using the project's policyId
//
// REMEMBER TO PARAMETERIZE - THE SCRIPT WILL ALWAYS SUCCEED WITHOUT PARAMETERS
validator(_key: ByteArray) {
  fn spend(_datum: Data, _redeemer: Data, _context: Data) -> Bool {
    False
  }
}
