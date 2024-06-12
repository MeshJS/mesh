export type Relay =
  | {
      type: 'SingleHostAddr';
      IPV4?: string;
      IPV6?: string;
      port?: number;
    }
  | {
      type: 'SingleHostName';
      domainName: string;
      port?: number;
    }
  | {
      type: 'MultiHostName';
      domainName: string;
    };
