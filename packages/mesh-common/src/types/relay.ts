export type Relay =
  | {
      type: "SingleHostAddr";
      IPV4?: string;
      IPV6?: string;
      port?: number;
    }
  | {
      type: "SingleHostName";
      domainName: string;
      port?: number;
    }
  | {
      type: "MultiHostName";
      domainName: string;
    };

export const relayToObj = (relay: Relay): object => {
  switch (relay.type) {
    case "SingleHostAddr":
      return {
        singleHostAddr: {
          ipv4: relay.IPV4,
          ipv6: relay.IPV6,
          port: relay.port,
        },
      };
    case "SingleHostName":
      return {
        singleHostName: {
          hostname: relay.domainName,
          port: relay.port,
        },
      };
    case "MultiHostName":
      return {
        multiHostName: {
          dnsName: relay.domainName,
        },
      };
  }
};
