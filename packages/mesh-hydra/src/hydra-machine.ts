import { AnyEventObject, assertEvent, assign, fromCallback, fromPromise, sendTo, setup } from "xstate";
import { HTTPClient } from "./utils";

export const hydra = setup({
  actions: {
    newTx: ({ event }) => {
      assertEvent(event, "NewTx")
      sendTo("server", { type: "Send", data: { tag: event.type, transaction: event.tx } })
    },
    recoverUTxO: ({ event }) => {
      assertEvent(event, "Recover")
      sendTo("server", { type: "Send", data: { tag: event.type, recoverTxId: event.txHash } })
    },
    decommitUTxO: ({ event }) => {
      assertEvent(event, "Decommit")
      sendTo("server", { type: "Send", data: { tag: event.type, decommitTxId: event.tx } })
    },
    initHead: () => {
      sendTo("server", { type: "Send", data: { tag: "Init" } })
    },
    abortHead: () => {
      sendTo("server", { type: "Send", data: { tag: "Abort" } })
    },
    closeHead: () => {
      sendTo("server", { type: "Send", data: { tag: "Close" } })
    },
    contestHead: () => {
      sendTo("server", { type: "Send", data: { tag: "Contest" } })
    },
    fanoutHead: () => {
      sendTo("server", { type: "Send", data: { tag: "Fanout" } })
    },
    closeConnection: ({ context }) => {
      if (context.connection?.readyState === WebSocket.OPEN) {
        context.connection.close(1000, "Client disconnected");
      }
      return { baseURL: "", headURL: "", connection: undefined, error: undefined };
    },
    setURL: assign(({ event }) => {
      assertEvent(event, "Connect")
      const url = event.baseURL.replace("http", "ws");
      const history = `history=${event.history ? "yes" : "no"}`;
      const snapshot = `snapshot-utxo=${event.snapshot ? "yes" : "no"}`
      const address = event.address ? `&address=${event.address}` : "";
      return {
        baseURL: event.baseURL,
        headURL: `${url}/?${history}&${snapshot}${address}`,
      }
    }),
    setConnection: assign(({ event }) => {
      assertEvent(event, "Ready")
      return { connection: event.connection }
    }),
    createClient: assign(({ context }) => {
      return { client: new HTTPClient(context.baseURL) }
    }),
    setError: assign(({ event }) => {
      assertEvent(event, "Error")
      return { error: event.data }
    }),
    setRequest: assign(({ event }) => {
      assertEvent(event, ["Commit"])
      return { request: event.data }
    }),
    clearRequest: assign(() => {
      return { request: undefined }
    }),
  },
  guards: {
    isInitializing: ({ event }) => {
      assertEvent(event, "Message")
      if (event.data.tag === "Greetings") {
        return event.data.headStatus === "Initializing";
      }
      return event.data.tag === "HeadIsInitializing";
    },
    isAborted: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsAborted";
    },
    isCommitted: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "Committed";
    },
    isOpen: ({ event }) => {
      assertEvent(event, "Message")
      if (event.data.tag === "Greetings") {
        return event.data.headStatus === "Open";
      }
      return event.data.tag === "HeadIsOpen";
    },
    isClosed: ({ event }) => {
      assertEvent(event, "Message")
      if (event.data.tag === "Greetings") {
        return event.data.headStatus === "Closed";
      }
      return event.data.tag === "HeadIsClosed";
    },
    isContested: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsContested";
    },
    isReadyToFanout: ({ event }) => {
      assertEvent(event, "Message")
      if (event.data.tag === "Greetings") {
        return event.data.headStatus === "FanoutPossible";
      }
      return event.data.tag === "ReadyToFanout";
    },
    isFinalized: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsFinalized";
    }
  },
  actors: {
    server: fromCallback<AnyEventObject, { url: string }>(({ sendBack, receive, input }) => {
      const ws = new WebSocket(input.url);

      ws.onopen = () => {
        sendBack({ type: "Ready", connection: ws })
      };
      ws.onerror = (error) => {
        sendBack({ type: "Error", data: error });
      };
      ws.onmessage = (event) => {
        sendBack({ type: "Message", data: JSON.parse(event.data) });
      };
      ws.onclose = (event) => {
        sendBack({ type: "Disconnect", code: event.code });
      };

      receive((event) => {
        assertEvent(event, "Send");
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event.data));
        else sendBack({ type: "Error", data: new Error("Connection is not open") });
      });

      return () => ws.close();
    }),
    commit: fromPromise<unknown, { client?: HTTPClient, request: unknown }>(async ({ input, signal }) => {
      if (!input.client) {
        throw new Error("Client is not initialized");
      }
      if (!input.request) {
        throw new Error("Request is not provided");
      }
      const { client, request } = input;
      return await client.post("/commit", request, undefined, signal);
    })
  },
  types: {
    context: {} as {
      baseURL: string,
      client?: HTTPClient,
      connection?: WebSocket,
      error?: unknown,
      headURL: string,
      request?: unknown,
    },
    events: {} as
      | { type: "Connect", baseURL: string, address?: string, snapshot?: boolean, history?: boolean }
      | { type: "Ready", connection: WebSocket }
      | { type: "Send", data: unknown }
      | { type: "Message", data: { [x: string]: unknown, tag: string } }
      | { type: "Error", data: unknown }
      | { type: "Disconnect", code: number }
      | { type: "Init" }
      | { type: "Commit", data: unknown }
      | { type: "NewTx", tx: unknown }
      | { type: "Recover", txHash: unknown }
      | { type: "Decommit", tx: unknown }
      | { type: "Abort" }
      | { type: "Contest" }
      | { type: "Fanout" }
      | { type: "Close" }
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAkCaARASgQQHToEtYBjAewDtyxiAXSAYgGEKraBtABgF1FQAHUrAI0CFXiAAeiAOwAmAMy4AHABYArCqUA2adK0c5ATgA0IAJ6JZStbi1a1aw4ekBGF1pXzDAX2+m0WHjMlNQiFPQQFGC4BOQAbqQA1tEBOLjBrGHkCLEJxACGWZxcxeICQlniUghuLrK48gaGjhyqhi7yWqYWCJocuNKtLkpKsoYcKnbSar7+GGkZoaLk9GAATmuka7h8ADaFAGZbALa4qUEsSxQ58aQFRdylSCDlwstVMnUDE0qGsrpaeQuNRKbqWFzSWyDaTOVTTNSyRGzEDndKXWjLNEhDHkKD0TBgfIQMxPfiCN5iZ7VWr9DiGdSuZqyYYqMEIeRWXAQvSGLTMhQ-ZGoxa0BgAWTgsHyMFJL3JlSpiDqHHqw1cSk6OhU7RcbL0WgGzg52g4dOaLiF8wu2LoEHoEtgUplLh4z1eCtA1Nkpq5HO19PhmmkbJcBhUAxUzL5hg1k3plsCWMy4sl0rAbFkrrJFXeipqLmauE8claSmG2kRIZUg1wCJUka8dScWgTC3RtvtqZl8izcpzlM9iE0Bq0HS09LsgK02hD0nk4YLMNq7QR89b1uTdsIJHbsvducHvU6uCsXmsdNa7VkrPMQ5hJ6Gc808iUc7U0nXSdCDAAohstnu8oHpIMiIrY1hAmMRiVrevT3t6ZZPhqr7yO+n4irauAAJIQLsYD0Fh5DCIB-bkB8CAOP047uKG7gcPOEJ6p4yjetI2gNr8rjoe2kDYbh+EkRSZF5u46i4BwfKDBoaimvRbLUeJ1h6C42qRjoFp+CiVpfqKEDYURIj5LsBAAF6xHi2AAEZbDQgkeiBCCIl8rgcqeEJ0jePTaIY4mAipCjPl43E2rxhFvEZpnmfQdnAdSKpKMomiIhyILqBoIYcG4RYIqoUxWDGGlzImGGhQZBARWZuLRS6ZRAQODnTIoCiDHU0yRm4GVZeoViTDo+VlsFm76eFxmVVAuAEkSZgACqkMwxzHMITCkAtxHcLVpHkRC14NJ4ZZAplTgqmy1g+ZGfxeKOVgQkog3fnpYWGaN5loqtNAiFV6ybNseyHCcZzaSVD1lRVL3zYt73mTceSFMsxQxfV1IIganRlnUkyvqOnmIM0PlSTGvzMiyhVacVPHAyNkW4q9EMfXiCPCYeBaaLgvIeI0L56J1-TXi+SimvzbF3bpuAAPJ8GAKyMLsgjputbp1YzDlOYo9HSJM9bTn8IaIv0-O-BqEzvp4KjC5h4uS-QAByYAAO7TRIDNbaurMgq03q8h08jBrBHR6LWfMOPSxb-GbvEWysTsifRC45c4Kh0vo7ghvIL5FvRjSuB4mUjGHenS7LdrBHQsC2fL2ZCeR7ThkuDiyHyGfDCGCI2MCjJAgisggjMmnCuT6Qy7ADBR0zmXhpliK8q0HjbSG9ixypKm6PR-l5wPhfVb2+6I4gyMB0HqhqCp9jyHPGhckfKhL4MQLVmvABi+TkKQACuNAAAqCEIll4fQj-P2-EeDUE4njVFJFol8qzVlrNWaw9ZdCOA-L3QG-d-6vw-l-AgP8BLlz7JXPM74XDKBhLfOcKE2IpzTgnVOBhRI51usgsmIU9L31iEZAiBkgHVGnPUa8Yw1AeG0J3NQOsu4nl0P8DwbFfhHwfmw3Y0VcHbyVtUARCVtpdzGCMX4MYTr6CLG4b0mVvaTCRMiZ+EA4DiHOBtfBh4Xw2Hrq+fmKltT2AcBlA03J9BJS7kfV8n5txkGYbY+y1R6yOPaPzN2jZeRskaAlDwzIQTjnfJ0esZtgLKKrh0BowI7AeXaIMbGNRDCKB0HoaskwVRpSQUVNsNpMQYXMqE2KONRx5IEfoekRSJjxKPhfNSQjtAuLqaTBpmRMToCiK0neNQrC8O1FYTiYxhin1gvOHy4w1LxwKaMPOsyVFDlTieacbEx5uIcCI2CScGioWmGxFKmo144Twoc8imgiFOPOa43kVz5IjGUPcnxri1AvheSDZ6uJ3kiV6uJToTRjFAmTrBXQRCE7vnHKncYXFGETPusNJ6VNxqTWJLNcGwgYVM0vvC-QMIkVuC6LBEY9QMX8zpR4T2ELKZjRpsIOmVKHIFmPPSvkfiFA8JOiCVmHAQRuGcDoKR3KiW8umVQQV1I5z9F5CMPq3tvQ6AymMAY3or70QmNeCYa8I4aqVJMGwiFLqDGnMCUEvsboB0Jn8MpXd2jWoluQXA01RboFFramoR9FCOt5M6ssIIdZ2HhSMKJwqnA+DxRuAlBch4QHDaGSYXIxjDkBCMAsTKehL36HWBO504z2Afk-dBn9HRYLeQrTaBDpVRM6OrVZMlZBVmmJ6+EiJXwJzGX3ZhuBWHkCMuGxBUJEQAkjYCH2FaIREPnJMJce1U4TpQVO4ucBbR5ozkWbUbE5BZy7m6ithtiEKD+P8byEJfC+CAA */
  id: "HYDRA",
  initial: "Disconnected",
  context: {
    baseURL: "",
    headURL: "",
  },
  states: {
    Disconnected: {
      on: {
        Connect: {
          target: "Connection",
          actions: "setURL"
        }
      }
    },
    Connection: {
      invoke: {
        src: "server",
        input: ({ context }) => ({
          url: context.headURL,
        }),
        onDone: {
          target: "Connected",
          actions: "createClient"
        },
        onError: "Disconnected"
      },
      initial: "Connecting",
      states: {
        Connecting: {
          on: {
            Ready: {
              target: "Done",
              actions: "setConnection"
            }
          }
        },
        Done: { type: "final" }
      }
    },
    Connected: {
      on: {
        Message: [{
          target: ".Initializing",
          guard: "isInitializing",
        }, {
          target: ".Open",
          guard: "isOpen",
        }, {
          target: ".Closed",
          guard: "isClosed",
        }, {
          target: ".FanoutPossible",
          guard: "isReadyToFanout",
        }],
        Disconnect: {
          target: "Disconnected",
          actions: "closeConnection"
        },
        Error: { actions: "setError" }
      },
      initial: "Idle",
      states: {
        Idle: {
          on: {
            Init: { actions: "initHead" }
          },
          always: {
            target: "Initializing",
            guard: "isInitializing"
          }
        },
        Initializing: {
          on: {
            Abort: { actions: "abortHead" }
          },
          always: [{
            target: "Open",
            guard: "isOpen"
          }, {
            target: "Final",
            guard: "isAborted",
          }],
          initial: "ReadyToCommit",
          states: {
            ReadyToCommit: {
              on: {
                Commit: {
                  target: "Committing",
                  actions: "setRequest"
                }
              }
            },
            Committing: {
              invoke: {
                src: "commit",
                input: ({ context }) => ({
                  client: context.client,
                  request: context.request
                }),
                onError: {
                  target: "ReadyToCommit",
                }
              },
              always: {
                target: "Done",
                actions: "clearRequest",
                guard: "isCommitted"
              }
            },
            Done: {
              type: "final"
            }
          },
        },
        Open: {
          on: {
            Close: { actions: "closeHead" },
            NewTx: { actions: "newTx" }
          },
          always: {
            target: "Closed",
            guard: "isClosed"
          },
          initial: "TODO",
          states: {
            TODO: {}
          },
        },
        Closed: {
          on: {
            Contest: { actions: "contestHead" }
          },
          always: [{
            target: "Contested",
            guard: "isContested"
          }, {
            target: "FanoutPossible",
            guard: "isReadyToFanout"
          }]
        },
        FanoutPossible: {
          on: {
            Fanout: { actions: "fanoutHead" }
          },
          always: {
            target: "Final",
            guard: "isFinalized"
          }
        },
        Final: {
          on: {
            Init: { actions: "initHead" }
          },
          always: {
            target: "Initializing",
            guard: "isInitializing"
          }
        },
        Contested: {},
        // TxInvalid: {},
        // SnapshotConfirmed: {},
        // SnapshotSideLoaded: {},
        // DecommitRequested: {},
        // DecommitApproved: {},
        // DecommitInvalid: {},
        // DecommitFinalized: {},
        // CommitRecorded: {},
        // CommitApproved: {},
        // CommitFinalized: {},
        // CommitRecovered: {},
      }
    },
  }
});
