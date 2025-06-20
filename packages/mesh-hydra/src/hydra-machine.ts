import axios, { AxiosInstance, type RawAxiosRequestHeaders } from "axios";
import { AnyEventObject, assertEvent, assign, fromCallback, sendTo, setup } from "xstate";
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
    setRequest: assign(({ event }) => {
      assertEvent(event, ["Commit"])
      return { request: event.data }
    }),
    setError: assign(({ event }) => {
      assertEvent(event, "Error")
      return { error: event.data }
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
  /** @xstate-layout N4IgpgJg5mDOIC5QAkCaARASgQQHToEtYBjAewDtyxiAXSAYgGEKraBtABgF1FQAHUrAI0CFXiAAeiAOwAmAMy4AHABYArCqUA2adK0c5ATgA0IAJ6JZStbi1a1aw4ekBGF1pXzDAX2+m0WHjMlNQiFPQQFGC4BOQAbqQA1tEBOLjBrGHkCLEJxACGWZxcxeICQlniUghuLrK48gaGjhyqhi7yWqYWCJocuNKtLkpKsoYcKnbSar7+GGkZoaLk9GAATmuka7h8ADaFAGZbALa4qUEsSxQ58aQFRdylSCDlwstVMnUDE0qGsrpaeQuNRKbqWFzSWyDaTOVTTNSyRGzEDndKXWjLNEhDHkKD0TBgfIQMxPfiCN5iZ7VNwcQy2VryUaqTqTMEIeRWXDtBxaWHacbuZGoxa0BgAWTgsHyMFJL3JlSpiDqHBcA30zmkTImdjZehUyk0jkMSk6amk8hmfhR8wu2LoEHoEtgUplLh4z1eCtA1JcTm+gNpk0BclkbLcvIazUM9nUWhN0yFNqxmXFkulYDYsndZIq70VNV9NhVLg4HDGMJUENB5iVkyUuDNal5ahchukk0TgWToVTzvTbHk2blucp3sQmi0uGG7ZGo15skrYfN9QX7VGKn+JYhnYW6Pt9EIJD3ss9ebHvU6uCsXmstNa7QXbJUMKvQ3NmkZ5rNO9tKYdAFENi2E95TPSQZERWxrCBcsxkRJ8X1kN95A-JQv2kH9u1FCBcAASQgXYwHoXDyGEECR3ID4EAcfpZBjCYOXvORdUrZQ5A4M17EMZ8NEwkV7TwgiiPIilKPzdwVH1QEPCcLQSwcaw2TjOkOkGSsEQ4LQ6NkPi90gPDSJEfJdgIAAvWI8WwAAjLYaBEr1wIQRE1EUDgLUad9ERNNkTUUBRHF9DkXInXS7X0ki3mMsyLPoeywOpMt6w3JCIUrAUXDDUs6TUCY3BhVpn3sUK-wMyKTPM3FYrdMpQNHRzpnqJQSyUTT2kK+xMtpBtcohcY4SKq1hT0nCIqM8qLNwAkiTMAAVUhmGOY5hCYUhFrI7gaooqjgTjBsXMBX5zWcVkawQX4bCBdtaSOzUnGKnsRsMggooqqA0TWmgREquK6uqJD5EUZ8mt9QZajqNluPrYtZARJwWsk+7sNwAB5PgwBWRhdkEDMNo9WqxPPP5+maBESxjKwETDRFFA5bQJMrDpPERgTUfR2LcZzUTtrcxQ5DsblQbNMMAcndR1E1Lwo3NZn9Mx7GHWCOhYDsjnhy5-M2oaewUJ0FqRnNMMET8gqPE-eMZZwuXYAYH6CccrdFBBdUy0mZx-jDewVzLON9A435-gt9Iseth02GqvGtvzBFJxLQwvDo5UkOrHp3ARV86O0UsQTjnTBqTfj9IAMXychSAAVxoAAFQQhCswj6GL0uK9tqijoGP4m2fX19GkMNJJsI06jNDoIQcQPG-Lqua4IOvhNV09fsQYfcHUIFWl+P44-kYXLzFs0TScRxpbzrsC5wwvYmM4jDJb-M41VJqdByjxoWTpVqYaCnn1cSTzS0cfL67HZkOBedtqhNkhO2fQXcVDcQcNvU61gkpaS7vIc0ExNK+CtKXCAcBxDnE2urc8jJ9SqBhu2RoDhZDyUypObkGgERXTgvITCh4yBhQgIQhy1R+5XjXH7Ny7RoxskaPWDw1CnbND-gjE+u47RgVAVRB8ygxhd1UJpDkKgwzcRXsCDQf9fQjDjszTE-ELJcPiogaM-RRjcVcOowEj5ToWgfn8Vs1Nn5NhMRQfAUQLGLxqFYVUehGhw1NvDEROVbAblbADRETgLSWjmKfYa-iwHjg5AachngOKkw4myI0DQ0KaViXoTSudklyJKvhQiaSqJ9CyWaHJVCaGnR9soYpQJ7Clg5BU60KSOGlTGtFXEdTxKwNVP8LSLlWg+20CxOhCgJggkGGWYxsjfwPSGc9cauJJqEmJHNBaS0aBjPPMCLwV49Aw1EXMroiCUIryWTCXyCIrCB1GjskZb1jnCC+lAM5jkkIqH6CyQYLi0IbjUD5JsV46iwLgvDFCHynovQmugPxEciH2xhDYEF1N-hWDSjC-U0YYZuTcGlXkgdWZ20UeJDiqozQTENB0JsbgwzuDpF4Rwt5piqUDlbSAgKErqG+LTJocdph912o2J+Mz-hJP6VUrZE8K7V2dDPWpWLuFLxBCvNxcls6DCFqdVs5oGzjG9pMTwvo+lDUGRfcgxkRVL2cFeSYBhhhuCEQglOXLIyOBymg7idR7X52GliJW9pXU1B5rgMsFomqeGoU1P1SomRcgUHYFxG5Bi518EAA */
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
              always: {
                target: "Done",
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

  async get(endpoint: string) {
    try {
      const { data, status } = await this._instance.get(endpoint);
      if (status === 200 || status == 202) return data;
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async post(endpoint: string, payload: unknown, headers?: RawAxiosRequestHeaders) {
    try {
      const { data, status } = await this._instance.post(endpoint, payload, {
        headers: headers ?? { "Content-Type": "application/json" }
      });
      if (status === 200 || status == 202) return data;
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  private readonly _instance: AxiosInstance;
}
