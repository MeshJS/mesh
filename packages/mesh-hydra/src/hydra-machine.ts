import axios, { AxiosInstance, type RawAxiosRequestHeaders } from "axios";
import { AnyEventObject, assertEvent, assign, fromCallback, fromPromise, sendTo, setup } from "xstate";
import { parseHttpError } from "./utils";

export const hydra = setup({
  actions: {
    initHead: () => {
      sendTo("server", { type: "Send", data: { "tag": "Init" } })
    },
    abortHead: () => {
      sendTo("server", { type: "Send", data: { "tag": "Abort" } })
    },
    closeHead: () => {
      sendTo("server", { type: "Send", data: { "tag": "Close" } })
    },
    contestHead: () => {
      sendTo("server", { type: "Send", data: { "tag": "Contest" } })
    },
    fanoutHead: () => {
      sendTo("server", { type: "Send", data: { "tag": "Fanout" } })
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
      | { type: "Abort" }
      | { type: "Close" }
      | { type: "Contest" }
      | { type: "Fanout" }
      | { type: "Close" }
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAkCaARASgQQHToEtYBjAewDtyxiAXSAYgGEKraBtABgF1FQAHUrAI0CFXiAAeiAOwAmAMy4AHABYArCqUA2adK0c5ATgA0IAJ6JZStbi1a1aw4ekBGF1pXzDAX2+m0WHjMlNQiFPQQFGC4BOQAbqQA1tEBOLjBrGHkCLEJxACGWZxcxeICQlniUghuLrK48gaGjhyqhi7yWqYWCJocuNKtLkpKsoYcKnbSar7+GGkZoaLk9GAATmuka7h8ADaFAGZbALa4qUEsSxQ58aQFRdylSCDlwstVMnUDE0qGsrpaeQuNRKbqWFzSWyDaTOVTTNSyRGzEDndKXWjLNEhDHkKD0TBgfIQMxPfiCN5iZ7VNwcQy2VryUaqTqTMEIeRWXDtBxaWHacbuZGoxa0BgAWTgsHyMFJL3JlSpiDqHBcA30zmkTImdjZehUyk0jkMSk6amk8hmfhR8wu2LoEHoEtgUplLh4z1eCtA1JcTm+gNpk0BclkbLcvIazUM9nUWhN0yFNqxmXFkulYDYsndZIq70VNV9NhVLg4HDGMJUENB5iVkyUuDNal5ahchukk0TgWToVTzvTbHk2blucp3sQmi0uGG7ZGo15skrYfN9QX7VGKn+JYhnYW6Pt9EIJD3ss9ebHvU6uCsXmstNa7QXbJUMKvQ3NmkZ5rNO9tKYdAFENi2E95TPSQZERWxrCBcsxkRJ8X1kN95A-JQv2kH9u1FCBcAASQgXYwHoXDyGEECR3ID4EAcfpZBjCYOXvORdUrZQ5A4M17EMZ8NEwkV7TwgiiPIilKPzdwVH1QEPCcLQSwcaw2TjOkOkGDkjFUBw+L3SA8NIkR8l2AgAC9YjxbAACMthoESvXAhBES+KxBkRZ89UMeQ2W0SE3EkjoQS8CEVG0u1dJIt5DJMsz6FssDqTLesNyQoLfWLMNSzpNQJjcGFWmfewQr-PSIqM0zcRit0ylA0d7OmeolBLJQOF5Vs9HsdLaQbbKIXGOECqtYUdJw8KDNKszcAJIkzAAFVIZhjmOYQmFIBayO4KqKKoiFZFVQYOj+aYnAUNQvJ0KdW0kySONLLSBqTfiwv0ghIrKqA0VWmgRHK9ZNm2PZDhOM57qG4rRqi3F3sWz6zJuPJCmWYpYpq6kEUUOQm3nE15A5asei3SFnLkxoPJUFVCp7Yanpe8b5qhr68SRsTz19CEDQ4jQkMBTp0tYlVKxBTQYRQ8nsNwAB5PgwBWRhdkEDN1o9aqmfsv5+maBESxjKwETDRFFBxuSPErDpPBFgSJalmKFZzUSto4bGBjolqzRVM0w2xyd1HUTUvCjc0zd0mW5YdYI6FgGzreHW383afVTRQnQmpGc0w1R19VA8T94wDnCg9gBhGbtjoG20O8F15ORpDDewVzLON9A435-hz9JZfzh02EqxXNvzBFJxLDy-jkpCkNxpUa9fOjS8bjzZBbgAxfJyFIABXGgAAVBCECzCPoRfl7Xwv83NOkYVkJtn19fQq5rGpJJsI06jNDoIVuuYuwenD99Xjet4IHfhKR1PMjRAz9cDqCBK0X4fwPKeVvh0S8XszQmicI4f2d0P4g3nrEQyxF9JH3PHGVUDUdBZQ8NCMeNQ9YNG1m5C65otALxwbsK2Q5gHK2qE2SE7Z9CXxUNxBwcCejWESloBcrh5DmgmM1XwVpl4QDgOIc4G1o7nkZPqVQ592yNAcDtDi6VJzcg0PGRE9hrCYUPGQUKEAVF2WqPfK8a5G723aNGNkjR6weB2iCZsDDJJmzAuwqiD5lBjEvqoZqHIVBhm4uA4EagLTaDon4gJFAsL01sXFRA0Z+ijG4q4CJgJHy3wtMQv4rY9ZkKbKk8g+AoiZJAVQhqapibGkzk1aJJSsq2A3K2bGiInAWktO-Xc1iGkcPHByA0WjPDsz0SdW+RoGhoQmPzaMC5hnWkwdYwShFxlUT6NMs0szdHySUtoZQKygT2FLByOeGDRlFRGs9MauJ9niUmPrDyZidB1EkpQ3QdI5L3xauoWELdnnUwhpNYks1abCHeczFsqovCmm8n8zQXlxi4FpFuVo9cTRKAhVTV5b14XQzed3VR9lUo2DsG5f4ECqxYv6HeY0pYeLNEYQ838FNQYvPBm9dA9SqV2MsCqOklZSxbisMpBZeNaQ2HUZ0MYzgAwYR5ek3SFtlZBPEhxVULt-ktgtHJFwYZ3B0i8I4W80xVItzzpARFNKJg2DUlYJoHlphhjrA2aYpCEllgTJqz+uBv5r03s6f+ezRVZOoiCcB5S5IgmcBxG+eNnyKBaHXSYnhfT3JGby0W2DyCGWdZw5wV5JgGGGG4VxQilSWsjI4LKkjuJ1ALVsx5fLQ5wHtOWpU9tFBlkSX0naDUG01CZFyBQdhSkbhcrI7wQA */
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
                  actions: "setError"
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
          }
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
