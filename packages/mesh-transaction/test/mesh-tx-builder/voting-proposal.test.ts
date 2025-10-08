import {
  DRep,
  MeshTxBuilder,
  OfflineFetcher,
} from "@meshsdk/core";

import { txHash } from "../test-util";

describe("MeshTxBuilder - Voting Proposal", () => {
  const offlineFetcher = new OfflineFetcher();

  offlineFetcher.addUTxOs([
    {
      input: {
        txHash: txHash("tx1"),
        outputIndex: 0,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "1000000000000000000",
          },
        ],
      },
    },
    {
      input: {
        txHash: txHash("tx2"),
        outputIndex: 0,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
      },
    },
    {
      input: {
        txHash: txHash("tx2"),
        outputIndex: 1,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
      },
    },
    {
      input: {
        txHash: txHash("tx3"),
        outputIndex: 0,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
      },
    },
  ]);

  const txBuilder = new MeshTxBuilder({
    fetcher: offlineFetcher,
  });

  const txBuilder2 = new MeshTxBuilder({
    fetcher: offlineFetcher,
  });

  beforeEach(() => {
    txBuilder.reset();
    txBuilder2.reset();
  });

  it("Info action proposal", async () => {
    const txHex = await txBuilder
      .txIn(txHash("tx1"), 0)
      .txIn(txHash("tx2"), 0)
      .txIn(txHash("tx3"), 0)
      .proposal(
        { kind: "InfoAction", action: { type: "InfoAction" } },
        {
          anchorUrl: "https://path-to.jsonld",
          anchorDataHash:
            "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",
        },
        "stake_test17rekjamvnjyn3c3tcjpxe7ea20g7aek9vdqkaa3jefknz3gc066pt",
      )
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();
    console.log(txHex);
  });
});
