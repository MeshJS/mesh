use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}
use mocktail.{complete, mocktail_tx, required_signer_hash}
use mocktail/virgin_key_hash.{mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_utxo_ref}

pub type Datum {
  owner: VerificationKeyHash,
}

pub type Redeemer {
  msg: ByteArray,
}

validator hello_world {
  spend(
    datum_opt: Option<Datum>,
    redeemer: Redeemer,
    _input: OutputReference,
    tx: Transaction,
  ) {
    expect Some(datum) = datum_opt
    let must_say_hello = redeemer.msg == "Hello, World!"
    let must_be_signed = list.has(tx.extra_signatories, datum.owner)
    must_say_hello && must_be_signed
  }

  else(_) {
    fail
  }
}

fn mock_tx(is_owner_signed: Bool) -> Transaction {
  mocktail_tx()
    |> required_signer_hash(is_owner_signed, mock_pub_key_hash(0))
    |> complete()
}

test test_hello_world() {
  let datum = Some(Datum { owner: mock_pub_key_hash(0) })
  let redeemer = Redeemer { msg: "Hello, World!" }
  let tx = mock_tx(True)
  hello_world.spend(datum, redeemer, mock_utxo_ref(0, 0), tx)
}

test test_failed_hello_world_incorrect_redeemer() {
  let datum = Some(Datum { owner: mock_pub_key_hash(0) })
  let redeemer = Redeemer { msg: "GM World!" }
  let tx = mock_tx(True)
  !hello_world.spend(datum, redeemer, mock_utxo_ref(0, 0), tx)
}

test test_failed_hello_world_without_signer() {
  let datum = Some(Datum { owner: mock_pub_key_hash(0) })
  let redeemer = Redeemer { msg: "Hello, World!" }
  let tx = mock_tx(False)
  !hello_world.spend(datum, redeemer, mock_utxo_ref(0, 0), tx)
}
