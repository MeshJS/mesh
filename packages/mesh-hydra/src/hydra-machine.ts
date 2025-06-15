import { AnyEventObject, assertEvent, assign, fromCallback, sendTo, setup } from "xstate";

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
      if (event.data.tag === "Greetings") {
        return event.data.headStatus === "Initializing";
      }
      return event.data.tag === "HeadIsInitializing";
    },
    isAborted: ({ event }) => {
      assertEvent(event, "Message")
      return event.data.tag === "HeadIsAborted";
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
      headURL: string,
      connection?: WebSocket,
      error?: unknown,
    },
    events: {} as
      | { type: "Connect", baseURL: string, address?: string, snapshot?: boolean, history?: boolean }
      | { type: "Ready", connection: WebSocket }
      | { type: "Send", data: unknown }
      | { type: "Message", data: { [x: string]: unknown, tag: string } }
      | { type: "Error", data: unknown }
      | { type: "Disconnect", code: number }
      | { type: "Init" }
      | { type: "Abort" }
      | { type: "Close" }
      | { type: "Contest" }
      | { type: "Fanout" }
      | { type: "Close" }
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAkCaARASgQQHToEtYBjAewDtyxiAXSAYgGEKraBtABgF1FQAHUrAI0CFXiAAeiAOwAmAMy4AHABYArCqUA2adK0c5ATgA0IAJ6JZStbi1a1aw4ekBGF1pXzDAX2+m0WHjMlNQiFPQQFGC4BOQAbqQA1tEBOLjBrGHkCLEJxACGWZxcxeICQlniUgguHIY2arKyhhzyru7ysi6mFghqrbaqRi6yHBxazvK+-hhpGaGi5PRgAE4rpCu4fAA2hQBmGwC2uKlBLAsUOfGkBUXcpUgg5cKLVYhaSi64KtIcKoYqcbyeQTNQ9Syjb7AsaGFxqFyGNpKaYgU7pc60RbokKY8hQeiYMD5CBmB78QQvMSPapuOq2DhKeRKKyeDxacEITpKXCwhwTaRKbQtdwotHzWgMACycFg+RgZKeFMq1MQI0MWlwTIZsk0LlUTNkHMZhlwch1OkBeuZLlFszOOLoEHo0tgsvlLh4j2eytANOaKk1sn0zMcHi8Kg5bg8uFk0kR0nhKj1HltgWxmSlMrlYDYsk95IqrxVNSsJq08gMelqAOskZU5e+jlqmmB+htflRdvToUzruzbHk+cVhapvsQaiUHGUBh1zlcWlq0kj0nkNlagMcDJ+rXbMzT4sd9EIJAxNAV3qLY4QrJjxusdQZsJ1HJ+JtGnxXLaUK7U0lTc1PBgAFE1g2c8lUvSRVUBWQY1+Jx6l-etDXMRB-i+OxDFjINK2kH4tH-e0MwgXAAEkIG2MB6FI8hhHAkdyDeBBdA1VlGjaXQXHUbpUOYpllFULjw30etkQ7MVAJI8jKPoejKUY4s3ARXAOCaJpV3kNxPhQ3oPgDVS-k3bR7BUQjuwlKTaJEfJtgIAAvWJ8WwAAjDYz24MoINHKCag4OEY36BN1PLcMjWcFT5CTBMVwURld07fdJLIqyCBs+zHNkjyvS8hSrzcBQVKiloNBaAVIzGAMmSChNEX6KZxK7A9IGSl40ocvFZI9TyGKYoYoQ4CcKpbEFyr+TVv0aGrV1aMympIgB5PgwCWRhtkEHMsoLeSmNqfykMMRkBU8djIy6bkulGIMRgXfQ-waxKHWaxblsyocL28mkRm5SK2W3VSdXkSNgS+YE40FLctAUO69wAx6SNW9anWCOhYHct6cp2sZuQO+EEVhOoNAjXi4T1FTYW-QE5G0SLZqShHYAYOSfR82lzoG6mONaA7Iw8aQVO0AmJjqBF4okuH0jWhmnTYLrsp64tIanYZ7Dw98yuJ3n+f0eohdhdVafFgAxfJyFIABXGgAAVBCEZyZON02LaZyDqkZAMkwUJF-gtOtAW+EMNIOy6DeI3AHfNq2bYIO2qOdj73jsFSqeZVTEREoHNM1NoDsnVRIbaEOexIw3Yhs6irLj3KfJYqF7ChzjuNO0mugRX8vHqQuLLD0vtle7rtoVyHNXsIVtNbsFeMEnk5BUQFPknOF6o7U2IDgcRTn75nqiZc6736FolCfInelqDVeQnIWXATBloYStJjzIOHN5dtD1Bjcn2a5hF2V4ituQ8LoF96grg8KZe6sNMiQXelXaoT5lD+lcKoIEz5iYAm+HCCc-pYpxk7lkcyIg8TP3jggdUU5mQAkQYCcsKDeiri+IfLoKh1L9HsARcBRELjkHwFEIhMDVRWC+HoCsThtCeEnMfRA01bBMKEp0ZotU1C4MgLwpiahOjThnnOdwi4OSOADLGP4Oo6iqGZLIJRUkKJgBUQrNB8jPC6BXCCHiulPiml+LPFwwJ+gTjEjDDhXcaKtVsu1KA1i8pfVsJDQUugDF1CNF4U0TR6x4T8oKLo5jcDPSrtAnaXENQIn+u4VkVhAbEyKXBREFC2zlkUew-BzV6bKLlgPcJftOgVjUVhAETDSkn3rIodQB9GiLz8rUvx9Ti4mwjtbV00dKJhJ8vYRQSlEQ-ARDEpQdYPjfE-E4-4kU1BsPGXNbu5AbILOqBMehI9Z4AgRNTSM5TYxpzGKApkRy77+MdNiFGjoLmqhGHzMMq51CQx1LWYmzJFCTl+CuPGzQ7AZIACoSBonENKEB-k1EwbgdwDgnF2BYTpCEeEAoKFngZCcAoMkAGUzl8FgAAC1IDQYIewCArEOE0raW9VSRT5n8Vo-QDCMnsByJopLZCNClUmFOBhaX0qZSymlBBV4ABlSDEm5cOFpLMRiKBqlfA0C53HiuBCaX8XE-LwRuhk9A1BSCHEOMIQkABHM2cA-nNN5din4mp3CuFnKDTwZqEmWs0nqVwQqxmfImfgB1TrhDYD4HwdYcRtU5MUg4L4IrPCriDL+Vo4qNyalxmI-Czg7UJudTQNFGKsWeMcDGbRzzPDoV6ZYc1uBw1aSjauGNYtQ72rIImmgJcznBIzRjRSkUAzdIOcCD2Hhi0DVLW4ctehK11JOcwUdhIyArFXpi71L8agjBsL8NROExhX3+OKi66D1QKC4hOdQYDjl00dTW5NqbSDpuPTy09japxCyYXUEpwD70jEfYGg6s8gwZN3TW8dbUp3y3CVYXF+c7BSsbZoe9kr2IUtGFS3xsad1fpdQ69NKw0O6ppHycamlOhX0cL+H+vQmjQaTM4NUqgmEfMHUXdEo6CGhJPcQtwE5lCHM+JDBwDJOgrpsHQgagJhZ4t8L4IAA */
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
          }]
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
