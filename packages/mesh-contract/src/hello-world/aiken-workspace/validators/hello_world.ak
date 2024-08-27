use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{VerificationKey}

type Datum {
  owner: Hash<Blake2b_224, VerificationKey>,
}

type Redeemer {
  msg: ByteArray,
}

validator {
  fn hello_world(
    datum: Datum,
    redeemer: Redeemer,
    context: ScriptContext,
  ) -> Bool {
    let must_say_hello = redeemer.msg == "Hello, World!"
    let must_be_signed =
      list.has(context.transaction.extra_signatories, datum.owner)
    must_say_hello && must_be_signed
  }
}

fn mock_tx(is_owner_signed: Bool) -> Transaction {
  mocktail_tx()
    |> required_signer_hash(is_owner_signed, mock_pub_key_hash(0))
    |> complete()
}

test test_hello_world() {
  let datum = Datum { owner: mock_pub_key_hash(0) }
  let redeemer = Redeemer { msg: "Hello, World!" }
  let tx = mock_tx(True)
  let context =
    ScriptContext { transaction: tx, purpose: Spend(mock_utxo_ref(0, 0)) }
  hello_world(datum, redeemer, context)
}

test test_failed_hello_world_incorrect_redeemer() {
  let datum = Datum { owner: mock_pub_key_hash(0) }
  let redeemer = Redeemer { msg: "GM World!" }
  let tx = mock_tx(True)
  let context =
    ScriptContext { transaction: tx, purpose: Spend(mock_utxo_ref(0, 0)) }
  !hello_world(datum, redeemer, context)
}

test test_failed_hello_world_without_signer() {
  let datum = Datum { owner: mock_pub_key_hash(0) }
  let redeemer = Redeemer { msg: "Hello, World!" }
  let tx = mock_tx(False)
  let context =
    ScriptContext { transaction: tx, purpose: Spend(mock_utxo_ref(0, 0)) }
  !hello_world(datum, redeemer, context)
}
