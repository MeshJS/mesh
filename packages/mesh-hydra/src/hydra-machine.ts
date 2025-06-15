import { AnyEventObject, assertEvent, assign, EventObject, fromCallback, sendTo, setup } from "xstate";

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
    setConnection: assign(({ event }) => {
      assertEvent(event, "Ready")
      return { connection: event.connection }
    }),
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
    setError: assign(({ event }) => {
      assertEvent(event, "Error")
      return { error: event.data }
    }),
  },
  guards: {
    isInitializing: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsInitializing";
    },
    isAborted: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsAborted";
    },
    isOpen: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsOpen";
    },
    isClosed: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsClosed";
    },
    isContested: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsContested";
    },
    isReadyToFanout: ({ event }) => {
      assertEvent(event, "Message")
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
      headURL: string,
      connection?: WebSocket,
      error?: unknown,
    },
    events: {} as
      | { type: "Connect", baseURL: string, address?: string, snapshot?: boolean, history?: boolean }
      | { type: "Ready", connection: WebSocket }
      | { type: "Send", data: unknown }
      | { type: "Message", data: { tag: string } }
      | { type: "Error", data: unknown }
      | { type: "Disconnect", code: number }
      | { type: "Init" }
      | { type: "Abort" }
      | { type: "Close" }
      | { type: "Contest" }
      | { type: "Commit" }
      | { type: "Greetings" }
      | { type: "Fanout" }
      | { type: "Close" }
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAkCaARASgQQHToEtYBjAewDtyxiAXSAYgGEKraBtABgF1FQAHUrAI0CFXiAAeiAOwAmAMy4AHABYArCqUA2adK0c5ATgA0IAJ6JZStbi1a1aw4ekBGF1pXzDAX2+m0WHjMlNQiFPQQFGC4BOQAbqQA1tEBOLjBrGHkCLEJxACGWZxcxeICQlniUgguHIY2arKyhhzyru7ysi6mFghqrbaqRi6yHBxazvK+-hhpGaGi5PRgAE4rpCu4fAA2hQBmGwC2uKlBLAsUOfGkBUXcpUgg5cKLVYhaSi64KtIcKoYqcbyeQTNQ9Syjb7AsaGFxqFyGNpKaYgU7pc60RbokKY8hQeiYMD5CBmB78QQvMSPapuOq2DhKeRKKyeDxacEITpKXCwhwTaRKbQtdwotHzWgMQgkDE0MlPCmVamIVm4KxeaQqCaCtr2DmNL7MrzyNSC+H9KZ+VGzM44ugQegAUTWGzlz0VoGqmq+jSa2lkOi08hcKg5H1kuDUgcjvxcnTU0lF1uxmUguAAkhBtmB6GnyMJXQrXkqEJ9DLhpLzGSpZI15JoOdIQbgOGp5AZ-ibOvZE4Fk6FUxms-QCxUix7EG4tOG2nJGS4K7JXKHPrgXEpES06uvgQnLWKZQO8yJ8tsCAAvWL47AAIw2su4ZULVPHNRb3P0JrcgpU1ZM5kQ64qKqrS1DoP52FYPZzAeEDpkeBAnuel7Dg+jxumOkgTu4Wi4F4Hz9AirgBhytQcN6kbqNoLYCpBe5JuKdpwS8iEXniw4uDwaFPuQbwli05bWIGhgTM0CjyCRYzkR4JofjRyJ0b2DGpgA8nwYBLIw2yCGAI6Ujxxa1CaPJtn8dadD+sgkV0NhMnU8axqogJaFBNoprBqnqShnHkqOz6YTU85fDGjSeJoQZMiRXIRuMsItMJLQgi5fYSrBmnafawR0LA97efKvn6S+hnToC871I4fwhv+NRmqq+hKC2DLwqFSVKalWmwAwunuv5bjwhG+iGAoHA1iMwkkR4QE1v0-q-EGTgtTB6TtZ1HGPvlvF2EBDLVjWXhkboYJVe4P6qg4w06CBTgWjMimLQAYvk5CkAArjQAAKghCNeQ4PU9r1dRh1RKLo5Y6Oq-y6IG0gkZ40i2E1m21Joa4Lbaqa-S972fQQ33ZgDfnVL8ZbVguiLBj+DiRVY0UTAidQTK0zkKdBaOwXdsQnjmR74wV-mluWlZ1jWCj1kd1m4fVgqqG4uiGPJN0s25uDs+QnM87xvw2HIdTNJqw3WN0VWMmWwaxq4jLDfUviWk9EBwOIpxrXpvFMtyarOJqcuMnoh29KBPJwg4jLwmRnjXVavZSmQrNO91nrqKqsL1SarSxeyVVtu+1ZwkK8Ygj+qOZBh6EE4gsLhsyALm055kkQC3yB44YHnYNhcXOQyUiHiseA2X+jKLr1dArIlW9MaBqDcGTTGuMkZt5iFD4FEPelzUVhBYGdRyx4tmj4gM+2NnYdNFdDjz3aK+89UWjuM2qhNK2woHXqsJQoi+j2BqYPnwOmZgJfGs2jwx-B7Lo6hxihgFMZREcg6yNiZGoH+sFczMVPKxKAACDLznDPtKubR+jbw5IyHC65YxyxUKbG+8sI6K37O5NSvMS5XywuuCM6h17NEChWEi7gvg-kZDWXQI9PCyCQUtdKmDCprkUDoT4sZ4zSFbJZI6etbBWDIlORcn4VBiIxq9D6sAvpZkkf5CYOFNQTABCCAUU4941E1DYDwCgdC8KnK2XRHNtgmMJsaVUowWjqE3HoHhN9viaE4QYFx1gxGZTgBfLi60sG-B5HLJkGp6ojxHiRRs4ZRjNCDJk7a4d9ys1wAAFQkLmOIiEIDeIAnCXCzg7BuE6G4RcHJgSv2cFRChMZqElKVgAZVVnwWAAALUgNBgh7AICsQ4kA6klgaeqZpsYugjGhhnRo5ibFkQZL1P4Yjhn5FGRMmggyCB2wADKkGJAshJztiyfBsk0m+ay2mbN6D8Js3TgYalcPgsR6BqCkEOIcYQhIACOz04n3J8o8l8zzGl6Dea0jZHS7AcB5AKRwFZJ6iOZq5Oh+AQVguENgPgfB1hxDhXlBFfNlmvJaes9pGdBplm6Y4NcwY3y7gVkSlKJKyBkpoFUmpiykUrNRSyz5+8Kw2B+NYAECUGSIiBaS8FNAVYsVpUw3ikqmXvPRVVJyQFFUmmBjWS2MTQWasJGQFYdtakPLjvUl5KLmUfI5BQuW2LrCCWNE4HwhLO6pmYCKilVLSA0udfC11Sz3WrLRayr5wJFDmuZBoMx-T6KLXDZq7VaDdXcX1Yyj1RqU3Kk1HDTlFZ1AVkBSG1q6IRX2ujasYtiTEVlqTTK71+hwyKtnJqBxTN+WhtSra4QXcMEut7gm5FvavUmuBnwgUwNPCGnUNbbwQA */
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
        onDone: "Connected",
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
            Init: {
              actions: "initHead",
              reenter: true
            }
          },
          always: {
            target: "Initializing",
            guard: "isInitializing"
          }
        },
        Initializing: {
          on: {
            Abort: {
              actions: "abortHead",
              reenter: true
            },
          },
          always: [{
            target: "Open",
            guard: "isOpen"
          }, {
            target: "Final",
            guard: "isAborted",
            reenter: true
          }]
        },
        Open: {
          on: {
            Close: {
              actions: "closeHead",
              reenter: true,
            },
          },
          always: {
            target: "Closed",
            guard: "isClosed"
          }
        },
        Closed: {
          on: {
            Contest: {
              actions: "contestHead",
              reenter: true
            }
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
            Fanout: {
              actions: "fanoutHead",
              reenter: true
            }
          },
          always: {
            target: "Final",
            guard: "isFinalized"
          }
        },
        Final: {
          on: {
            Init: {
              actions: "initHead",
              reenter: true
            }
          },
          always: {
            target: "Initializing",
            guard: "isInitializing"
          }
        },
        Contested: {},
        TxInvalid: {},
        SnapshotConfirmed: {},
        SnapshotSideLoaded: {},
        DecommitRequested: {},
        DecommitApproved: {},
        DecommitInvalid: {},
        DecommitFinalized: {},
        CommitRecorded: {},
        CommitApproved: {},
        CommitFinalized: {},
        CommitRecovered: {},
        Committing: {}
      }
    },
  }
});
