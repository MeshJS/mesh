import { AnyEventObject, assertEvent, assign, fromCallback, fromPromise, sendTo, setup } from "xstate";
import { HTTPClient } from "../utils";

// Define interfaces for dependencies to enable dependency injection
export interface WebSocketFactory {
  create(url: string): WebSocket;
}

export interface HTTPClientFactory {
  create(baseURL: string): HTTPClient;
}

// Default implementations
export class DefaultWebSocketFactory implements WebSocketFactory {
  create(url: string): WebSocket {
    return new WebSocket(url);
  }
}

export class DefaultHTTPClientFactory implements HTTPClientFactory {
  create(baseURL: string): HTTPClient {
    return new HTTPClient(baseURL);
  }
}

// Configuration interface for the machine
export interface HydraMachineConfig {
  webSocketFactory?: WebSocketFactory;
  httpClientFactory?: HTTPClientFactory;
}

// Context type
export interface HydraContext {
  baseURL: string;
  client?: HTTPClient;
  connection?: WebSocket;
  error?: unknown;
  headURL: string;
  request?: unknown;
}

// Event types
export type HydraEvent =
  | { type: "Connect"; baseURL: string; address?: string; snapshot?: boolean; history?: boolean }
  | { type: "Ready"; connection: WebSocket }
  | { type: "Send"; data: unknown }
  | { type: "Message"; data: { [x: string]: unknown; tag: string } }
  | { type: "Error"; data: unknown }
  | { type: "Disconnect"; code: number }
  | { type: "Init" }
  | { type: "Commit"; data: unknown }
  | { type: "NewTx"; tx: unknown }
  | { type: "Recover"; txHash: unknown }
  | { type: "Decommit"; tx: unknown }
  | { type: "Abort" }
  | { type: "Contest" }
  | { type: "Fanout" }
  | { type: "Close" };

// Factory function to create the machine with injected dependencies
export function createHydraMachine(config: HydraMachineConfig = {}) {
  const {
    webSocketFactory = new DefaultWebSocketFactory(),
    httpClientFactory = new DefaultHTTPClientFactory(),
  } = config;

  return setup({
    actions: {
      newTx: ({ event }) => {
        assertEvent(event, "NewTx");
        sendTo("server", { type: "Send", data: { tag: event.type, transaction: event.tx } });
      },
      recoverUTxO: ({ event }) => {
        assertEvent(event, "Recover");
        sendTo("server", { type: "Send", data: { tag: event.type, recoverTxId: event.txHash } });
      },
      decommitUTxO: ({ event }) => {
        assertEvent(event, "Decommit");
        sendTo("server", { type: "Send", data: { tag: event.type, decommitTxId: event.tx } });
      },
      initHead: () => {
        sendTo("server", { type: "Send", data: { tag: "Init" } });
      },
      abortHead: () => {
        sendTo("server", { type: "Send", data: { tag: "Abort" } });
      },
      closeHead: () => {
        sendTo("server", { type: "Send", data: { tag: "Close" } });
      },
      contestHead: () => {
        sendTo("server", { type: "Send", data: { tag: "Contest" } });
      },
      fanoutHead: () => {
        sendTo("server", { type: "Send", data: { tag: "Fanout" } });
      },
      closeConnection: ({ context }) => {
        if (context.connection?.readyState === WebSocket.OPEN) {
          context.connection.close(1000, "Client disconnected");
        }
        return { baseURL: "", headURL: "", connection: undefined, error: undefined };
      },
      setURL: assign(({ event }) => {
        assertEvent(event, "Connect");
        const url = event.baseURL.replace("http", "ws");
        const history = `history=${event.history ? "yes" : "no"}`;
        const snapshot = `snapshot-utxo=${event.snapshot ? "yes" : "no"}`;
        const address = event.address ? `&address=${event.address}` : "";
        return {
          baseURL: event.baseURL,
          headURL: `${url}/?${history}&${snapshot}${address}`,
        };
      }),
      setConnection: assign(({ event }) => {
        assertEvent(event, "Ready");
        return { connection: event.connection };
      }),
      createClient: assign(({ context }) => {
        return { client: httpClientFactory.create(context.baseURL) };
      }),
      setError: assign(({ event }) => {
        assertEvent(event, "Error");
        return { error: event.data };
      }),
      setRequest: assign(({ event }) => {
        assertEvent(event, ["Commit"]);
        return { request: event.data };
      }),
      clearRequest: assign(() => {
        return { request: undefined };
      }),
    },
    guards: {
      isInitializing: ({ event }) => {
        assertEvent(event, "Message");
        if (event.data.tag === "Greetings") {
          return event.data.headStatus === "Initializing";
        }
        return event.data.tag === "HeadIsInitializing";
      },
      isAborted: ({ event }) => {
        assertEvent(event, "Message");
        return event.data.tag === "HeadIsAborted";
      },
      isCommitted: ({ event }) => {
        assertEvent(event, "Message");
        return event.data.tag === "Committed";
      },
      isOpen: ({ event }) => {
        assertEvent(event, "Message");
        if (event.data.tag === "Greetings") {
          return event.data.headStatus === "Open";
        }
        return event.data.tag === "HeadIsOpen";
      },
      isClosed: ({ event }) => {
        assertEvent(event, "Message");
        if (event.data.tag === "Greetings") {
          return event.data.headStatus === "Closed";
        }
        return event.data.tag === "HeadIsClosed";
      },
      isContested: ({ event }) => {
        assertEvent(event, "Message");
        return event.data.tag === "HeadIsContested";
      },
      isReadyToFanout: ({ event }) => {
        assertEvent(event, "Message");
        if (event.data.tag === "Greetings") {
          return event.data.headStatus === "FanoutPossible";
        }
        return event.data.tag === "ReadyToFanout";
      },
      isFinalized: ({ event }) => {
        assertEvent(event, "Message");
        return event.data.tag === "HeadIsFinalized";
      },
    },
    actors: {
      server: fromCallback<AnyEventObject, { url: string }>(({ sendBack, receive, input }) => {
        const ws = webSocketFactory.create(input.url);

        ws.onopen = () => {
          sendBack({ type: "Ready", connection: ws });
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
      commit: fromPromise<unknown, { client?: HTTPClient; request: unknown }>(
        async ({ input, signal }) => {
          if (!input.client) {
            throw new Error("Client is not initialized");
          }
          if (!input.request) {
            throw new Error("Request is not provided");
          }
          const { client, request } = input;
          return await client.post("/commit", request, undefined, signal);
        }
      ),
    },
    types: {
      context: {} as HydraContext,
      events: {} as HydraEvent,
    },
  }).createMachine({
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
            actions: "setURL",
          },
        },
      },
      Connection: {
        invoke: {
          src: "server",
          input: ({ context }) => ({
            url: context.headURL,
          }),
          onDone: {
            target: "Connected",
            actions: "createClient",
          },
          onError: "Disconnected",
        },
        initial: "Connecting",
        states: {
          Connecting: {
            on: {
              Ready: {
                target: "Done",
                actions: "setConnection",
              },
            },
          },
          Done: { type: "final" },
        },
      },
      Connected: {
        on: {
          Message: [
            {
              target: ".Initializing",
              guard: "isInitializing",
            },
            {
              target: ".Open",
              guard: "isOpen",
            },
            {
              target: ".Closed",
              guard: "isClosed",
            },
            {
              target: ".FanoutPossible",
              guard: "isReadyToFanout",
            },
          ],
          Disconnect: {
            target: "Disconnected",
            actions: "closeConnection",
          },
          Error: { actions: "setError" },
        },
        initial: "Idle",
        states: {
          Idle: {
            on: {
              Init: { actions: "initHead" },
            },
            always: {
              target: "Initializing",
              guard: "isInitializing",
            },
          },
          Initializing: {
            on: {
              Abort: { actions: "abortHead" },
            },
            always: [
              {
                target: "Open",
                guard: "isOpen",
              },
              {
                target: "Final",
                guard: "isAborted",
              },
            ],
            initial: "ReadyToCommit",
            states: {
              ReadyToCommit: {
                on: {
                  Commit: {
                    target: "Committing",
                    actions: "setRequest",
                  },
                },
              },
              Committing: {
                invoke: {
                  src: "commit",
                  input: ({ context }) => ({
                    client: context.client,
                    request: context.request,
                  }),
                  onError: {
                    target: "ReadyToCommit",
                  },
                },
                always: {
                  target: "Done",
                  actions: "clearRequest",
                  guard: "isCommitted",
                },
              },
              Done: {
                type: "final",
              },
            },
          },
          Open: {
            on: {
              Close: { actions: "closeHead" },
              NewTx: { actions: "newTx" },
            },
            always: {
              target: "Closed",
              guard: "isClosed",
            },
            initial: "TODO",
            states: {
              TODO: {},
            },
          },
          Closed: {
            on: {
              Contest: { actions: "contestHead" },
            },
            always: [
              {
                target: "Contested",
                guard: "isContested",
              },
              {
                target: "FanoutPossible",
                guard: "isReadyToFanout",
              },
            ],
          },
          FanoutPossible: {
            on: {
              Fanout: { actions: "fanoutHead" },
            },
            always: {
              target: "Final",
              guard: "isFinalized",
            },
          },
          Final: {
            on: {
              Init: { actions: "initHead" },
            },
            always: {
              target: "Initializing",
              guard: "isInitializing",
            },
          },
          Contested: {},
        },
      },
    },
  });
}

// Re-export the original machine for backward compatibility
export const machine = createHydraMachine();
