import { Cardano, Serialization } from "@cardano-sdk/core";
import { Hash28ByteBase16 } from "@cardano-sdk/crypto";

import { IFetcher, UTxO } from "@meshsdk/common";

import { getTransactionRequiredSigners } from "../../src/cardano/utils/transaction-signers";

describe("TransactionSigners", () => {
  class MockFetcher implements Partial<IFetcher> {
    private utxos: Map<string, UTxO[]> = new Map();

    addUTxOs(txHash: string, utxos: UTxO[]) {
      this.utxos.set(txHash, utxos);
    }

    async fetchUTxOs(txHash: string): Promise<UTxO[]> {
      const utxos = this.utxos.get(txHash);
      if (!utxos) {
        throw new Error(`Transaction not found: ${txHash}`);
      }
      return utxos;
    }
  }

  describe("getTransactionRequiredSigners", () => {
    it("should extract payment signers from transaction inputs", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1000000n,
            },
          },
        ],
        fee: 200000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBeGreaterThan(0);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
    });

    it("should extract signers from multiple inputs", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash1 =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";
      const inputTxHash2 =
        "e6a99b6338fbacd1e411c7bf69d963d83975d8ad1336cb70cd600bdd049c4cae";

      mockFetcher.addUTxOs(inputTxHash1, [
        {
          input: {
            txHash: inputTxHash1,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      mockFetcher.addUTxOs(inputTxHash2, [
        {
          input: {
            txHash: inputTxHash2,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "3000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash1),
            index: 1,
          },
          {
            txId: Cardano.TransactionId(inputTxHash2),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 4500000n,
            },
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBeGreaterThan(0);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
    });

    it("should extract signers from collateral inputs", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";
      const collateralTxHash =
        "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      mockFetcher.addUTxOs(collateralTxHash, [
        {
          input: {
            txHash: collateralTxHash,
            outputIndex: 2,
          },
          output: {
            address:
              "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
            amount: [
              {
                unit: "lovelace",
                quantity: "5000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1500000n,
            },
          },
        ],
        collaterals: [
          {
            txId: Cardano.TransactionId(collateralTxHash),
            index: 2,
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBeGreaterThan(0);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
    });

    it("should extract signers from withdrawals", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 0,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 0,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 2500000n,
            },
          },
        ],
        withdrawals: [
          {
            stakeAddress: Cardano.RewardAccount.fromCredential(
              {
                type: Cardano.CredentialType.KeyHash,
                hash: Hash28ByteBase16(
                  "3333c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f",
                ),
              },
              Cardano.NetworkId.Testnet,
            ),
            quantity: 1000000n,
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(2);
      expect(
        signers.has("3333c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
    });

    it("should throw error when input transaction is not found", async () => {
      const mockFetcher = new MockFetcher();

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(
              "0000000000000000000000000000000000000000000000000000000000000001",
            ),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1000000n,
            },
          },
        ],
        fee: 200000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      await expect(
        getTransactionRequiredSigners(
          fullTx,
          mockFetcher as unknown as IFetcher,
        ),
      ).rejects.toThrow("Transaction not found");
    });

    it("should handle enterprise addresses (payment-only)", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
            amount: [
              {
                unit: "lovelace",
                quantity: "500000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
            ),
            value: {
              coins: 499000000n,
            },
          },
        ],
        fee: 1000000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBeGreaterThan(0);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
    });

    it("should deduplicate signers from multiple sources", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash1 =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";
      const inputTxHash2 =
        "e6a99b6338fbacd1e411c7bf69d963d83975d8ad1336cb70cd600bdd049c4cae";

      // Same address for both inputs
      mockFetcher.addUTxOs(inputTxHash1, [
        {
          input: {
            txHash: inputTxHash1,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      mockFetcher.addUTxOs(inputTxHash2, [
        {
          input: {
            txHash: inputTxHash2,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "3000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash1),
            index: 1,
          },
          {
            txId: Cardano.TransactionId(inputTxHash2),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 4500000n,
            },
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      const signersArray = Array.from(signers);
      expect(signersArray.length).toBe(new Set(signersArray).size);
      expect(signersArray.length).toBe(1);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
    });

    it("should extract signers from stake registration certificate", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1500000n,
            },
          },
        ],
        certificates: [
          {
            __typename: Cardano.CertificateType.Registration,
            stakeCredential: {
              type: Cardano.CredentialType.KeyHash,
              hash: Hash28ByteBase16(
                "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
              ),
            },
            deposit: 2000000n,
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(2);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      expect(
        signers.has("9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6"),
      ).toBe(true);
    });

    it("should extract signers from stake deregistration certificate", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 3500000n,
            },
          },
        ],
        certificates: [
          {
            __typename: Cardano.CertificateType.Unregistration,
            stakeCredential: {
              type: Cardano.CredentialType.KeyHash,
              hash: Hash28ByteBase16(
                "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
              ),
            },
            deposit: 2000000n,
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(2);
      expect(
        signers.has("9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6"),
      ).toBe(true);
    });

    it("should extract signers from stake delegation certificate", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1500000n,
            },
          },
        ],
        certificates: [
          {
            __typename: Cardano.CertificateType.StakeDelegation,
            stakeCredential: {
              type: Cardano.CredentialType.KeyHash,
              hash: Hash28ByteBase16(
                "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
              ),
            },
            poolId: Cardano.PoolId(
              "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
            ),
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(2);
      expect(
        signers.has("9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6"),
      ).toBe(true);
    });

    it("should extract signers from explicit required signers field", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1500000n,
            },
          },
        ],
        requiredExtraSignatures: [
          Hash28ByteBase16(
            "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
          ),
          Hash28ByteBase16(
            "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
          ),
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(3);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      expect(
        signers.has("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8"),
      ).toBe(true);
      expect(
        signers.has("9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6"),
      ).toBe(true);
    });

    it("should not extract signers from script hash credentials in certificates", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1500000n,
            },
          },
        ],
        certificates: [
          {
            __typename: Cardano.CertificateType.Registration,
            stakeCredential: {
              type: Cardano.CredentialType.ScriptHash,
              hash: Hash28ByteBase16(
                "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
              ),
            },
            deposit: 2000000n,
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(1);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      expect(
        signers.has("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8"),
      ).toBe(false);
    });

    it("should extract signers from drep registration certificate", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1500000n,
            },
          },
        ],
        certificates: [
          {
            __typename: Cardano.CertificateType.RegisterDelegateRepresentative,
            dRepCredential: {
              type: Cardano.CredentialType.KeyHash,
              hash: Hash28ByteBase16(
                "7b79ee6d81b54cbff049c9e534191e57ed6ca25766e7975669fa66a7",
              ),
            },
            deposit: 500000000n,
            anchor: null,
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(2);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      expect(
        signers.has("7b79ee6d81b54cbff049c9e534191e57ed6ca25766e7975669fa66a7"),
      ).toBe(true);
    });

    it("should extract signers from vote delegation certificate", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1500000n,
            },
          },
        ],
        certificates: [
          {
            __typename: Cardano.CertificateType.VoteDelegation,
            stakeCredential: {
              type: Cardano.CredentialType.KeyHash,
              hash: Hash28ByteBase16(
                "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
              ),
            },
            dRep: {
              __typename: "AlwaysAbstain",
            },
          },
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(2);
      expect(
        signers.has("9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6"),
      ).toBe(true);
    });

    it("should combine signers from inputs, certificates, withdrawals, and explicit signers", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 2500000n,
            },
          },
        ],
        certificates: [
          {
            __typename: Cardano.CertificateType.Registration,
            stakeCredential: {
              type: Cardano.CredentialType.KeyHash,
              hash: Hash28ByteBase16(
                "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
              ),
            },
            deposit: 2000000n,
          },
        ],
        withdrawals: [
          {
            stakeAddress: Cardano.RewardAccount(
              "stake_test1upvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c73tq3f",
            ),
            quantity: 500000n,
          },
        ],
        requiredExtraSignatures: [
          Hash28ByteBase16(
            "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
          ),
        ],
        fee: 500000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      // Should have signers from all sources
      expect(signers.size).toBeGreaterThan(2);
      // From input
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      // From certificate and withdrawal (same key)
      expect(
        signers.has("9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6"),
      ).toBe(true);
      // From explicit required signers
      expect(
        signers.has("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8"),
      ).toBe(true);
    });

    it("should handle transaction with no inputs (only minting/burning)", async () => {
      const mockFetcher = new MockFetcher();

      const coreTx = {
        inputs: [],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 1000000n,
            },
          },
        ],
        requiredExtraSignatures: [
          Hash28ByteBase16(
            "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f",
          ),
        ],
        fee: 200000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      // Should only have explicit required signer
      expect(signers.size).toBe(1);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
    });

    it("should handle transaction with multiple withdrawal addresses", async () => {
      const mockFetcher = new MockFetcher();

      const inputTxHash =
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023";

      mockFetcher.addUTxOs(inputTxHash, [
        {
          input: {
            txHash: inputTxHash,
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            amount: [
              {
                unit: "lovelace",
                quantity: "2000000",
              },
            ],
          },
        },
      ]);

      const coreTx = {
        inputs: [
          {
            txId: Cardano.TransactionId(inputTxHash),
            index: 1,
          },
        ],
        outputs: [
          {
            address: Cardano.PaymentAddress(
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            ),
            value: {
              coins: 3500000n,
            },
          },
        ],
        withdrawals: [
          {
            stakeAddress: Cardano.RewardAccount.fromCredential(
              {
                type: Cardano.CredentialType.KeyHash,
                hash: Hash28ByteBase16(
                  "3333c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f",
                ),
              },
              Cardano.NetworkId.Testnet,
            ),
            quantity: 500000n,
          },
          {
            stakeAddress: Cardano.RewardAccount.fromCredential(
              {
                type: Cardano.CredentialType.KeyHash,
                hash: Hash28ByteBase16(
                  "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                ),
              },
              Cardano.NetworkId.Testnet,
            ),
            quantity: 300000n,
          },
        ],
        fee: 300000n,
      };

      const transaction = Serialization.TransactionBody.fromCore(coreTx as any);
      const witnessSet = new Serialization.TransactionWitnessSet();
      const fullTx = new Serialization.Transaction(transaction, witnessSet);

      const signers = await getTransactionRequiredSigners(
        fullTx,
        mockFetcher as unknown as IFetcher,
      );

      expect(signers.size).toBe(3);
      expect(
        signers.has("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      expect(
        signers.has("3333c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f"),
      ).toBe(true);
      expect(
        signers.has("9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6"),
      ).toBe(true);
    });
  });
});
