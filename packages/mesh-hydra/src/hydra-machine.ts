import axios, { AxiosInstance, type RawAxiosRequestHeaders } from "axios";
import { AnyEventObject, assertEvent, assign, fromCallback, fromPromise, sendTo, setup } from "xstate";
import { parseHttpError } from "./utils";

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
      return { client: new Client(context.baseURL) }
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
    commit: fromPromise<unknown, { client?: Client, request: unknown }>(async ({ input, signal }) => {
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
      client?: Client,
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
  /** @xstate-layout N4IgpgJg5mDOIC5QAkCaARASgQQHToEtYBjAewDtyxiAXSAYgGEKraBtABgF1FQAHUrAI0CFXiAAeiAOwAmAMy4AHABYArCqUA2adK0c5ATgA0IAJ6JZStbi1a1aw4ekBGF1pXzDAX2+m0WHjMlNQiFPQQFGC4BOQAbqQA1tEBOLjBrGHkCLEJxACGWZxcxeICQlniUghuLrK48gaGjhyqhi7yWqYWCJocuNKtLkpKsoYcKnbSar7+GGkZoaLk9GAATmuka7h8ADaFAGZbALa4qUEsSxQ58aQFRdylSCDlwstVMnUDE0qGsrpaeQuNRKbqWFzSWyDaTOVTTNSyRGzEDndKXWjLNEhDHkKD0TBgfIQMxPfiCN5iZ7VWr9DiGdSuZqyYYqMEIeRWXAQvSGLTMhQ-ZGoxa0BgAWTgsHyMFJL3JlSpiDqHHqw1cSk6OhU7RcbL0WgGzg52g4dOaLiF8wu2LoEHoEtgUplLh4z1eCtA1Nkpq5HO19PhmmkbJcBhUAxUzL5hg1k3plsCWMy4sl0rAbFkrrJFXeipqLmauE8claSmG2kRIZUg1wCJUka8dScWgTC3RtvtqZl8izcpzlM9iE0Bq0HS09LsgK02hD0nk4YLMNq7QR89b1uTdsIJHbsvducHvU6uCsXmsdNa7VkrPMQ5hJ6Gc808iUc7U0nXSdCDAAohstnu8oHpIMiIrY1hAmMRiVrevT3t6ZZPhqr7yO+n4irauAAJIQLsYD0Fh5DCIB-bkB8CAOP047uKG7gcPOEJ6p4yjetI2gNr8rjoe2kDYbh+EkRSZF5u46i4BwfKDBoaimvRbLUeJ1h6C42qRjoFp+CiVpfqKEDYURIj5LsBAAF6xHi2AAEZbDQgkeiBCCIl8rgcqeEJ0jePTaIY4mAipCjPl43E2rxhFvEZpnmfQdnAdSKpKMomiIhyILqBoIYcG4RYIqoUxWDGGlzImGGhQZBARWZuLRS6ZRAQODnTIoCiDHU0yRm4GVZeoViTDo+VlsFm76eFxmVVAuAEkSZgACqkMwxzHMITCkAtxHcLVpHkRC14NJ4ZZAplTgqmy1g+ZGfxeKOVgQkog3fnpYWGaN5loqtNAiFV6ybNseyHCcZzaSVD1lRVL3zYt73mTceSFMsxQxfV1IIganRlnUkyvqOnmIM0PlSTGvzMiyhVacVPHAyNkW4q9EMfXiCPCYeBaaLgvIeI0L56J1-TXi+SimvzbF3bpuAAPJ8GAKyMLsgjputbp1YzDlOYo9HSJM9bTn8IaIv0-O-BqEzvp4KjC5h4uS9F8vZkJW30QuOXOCodL6O4IbyC+Rb0Y0rgeJlIxm7x0uy3awR0LAtnW32tt5u04ZLg4sh8t7wwhgiNjAoyQIIrIIIzJpwrk+kMuwAwDN2yp4l1GM+jsdtIb2A7Kkqbo9H+YHenB6XdpsDVCubXmyO1qhjiqGoKn2PIDcaFy48qC3gxAtWHe4AAYvk5CkAArjQAAKghCJZeH0Ovm87+XebqzzapSS0c9VtWtbVtY9a6I4H4F4DRen9ve8HwQR8BJR33IjRA74XDKBhEvOcKE2Lu09s7D2BhRL+1up-MmIU9Kr1iEZAiBkL6HmnPUa8Yw1AeG0DnNQOtc4nl0P8DwbFfjjxXtg8guCCEOTIQlbaucxgjF+DGE6+gixuG9JleQ6s+SyF8JpTeEA4DiHOBtGOh4Xw2CTq+fmKltT2AcBlA03JBjTgEcCHw6C0jbjIJg5R9lqj1nUe0fmIJ6LtF5GyRoCUPDMhBOOd8nR6xm2AiApW1R2iKGznYDy7RBjYxqIYRQOhW4STjPzAwgSKA6TpjY2KONRwNGBJE+k0SJjuPHrPNSFDtBaI-kVNsNpMToCiNk0BNQrDEO1FYTiYxhhT1gvOHy4w1JO0iaMDuzSQlDg9ieacbFMr1l5A4KhsFXYNFQvqewMDeQrxwnhcZ5FNAQI0bM7RCy9HLJGMoNZ+h572JfNskGz1cR7JEr1cSnQmjiKBG7WCugIHOxBKGVu1Z-j3MpmNCahJiSzXBsIZ5TM55vP0DCT5bguiwRGPUf5-MkUeF5CTQumDhpPSpuNGFkMnn9xUQ5Asx5kVSMTqjWQJ0QSsw4ACxcOgGGguJeCxpVA4XUrnP0XkIw+oSO9DoDKYwBjennvRCY14JgrwtkrYJW1Jg2EQpdIxZYQQhghD5NQL4-g8nrCC8xG57rFxDgKuKkwuRjGHICEYBY0U9Bbv0OsztzpxnsCwjev996OgAbsyltiwEsscZ0dW3SZJMtgi3GwRrXyJysFfGppM6lDVYUZW1YDnBQkRACcenQJH6tcLtSYS49oewzQSoaYc4C2jzTUb2RZtRsTkL7XOoIE2G0gQoP4-xvIQmVRLcguAqAAHcAAEEdChgBnS4FtwIOjKAhNqiSure3uqTgaeiIxHE0qcGY3wQA */
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
            Close: { actions: "closeHead" }
          },
          always: {
            target: "Closed",
            guard: "isClosed"
          },
          initial: "new state 1",
          states: {
            "new state 1": {}
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

class Client {
  constructor(private baseURL: string) {
    this._instance = axios.create({
      baseURL: this.baseURL,
    });
  }

  async get(endpoint: string, signal?: AbortSignal) {
    try {
      const { data, status } = await this._instance.get(endpoint, { signal });
      if (status === 200 || status == 202) return data;
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async post(endpoint: string, payload: unknown, headers?: RawAxiosRequestHeaders, signal?: AbortSignal) {
    try {
      const { data, status } = await this._instance.post(endpoint, payload, {
        headers: headers ?? { "Content-Type": "application/json" }, signal,
      });
      if (status === 200 || status == 202) return data;
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  private readonly _instance: AxiosInstance;
}
