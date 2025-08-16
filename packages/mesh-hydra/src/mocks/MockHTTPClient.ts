import { HTTPClient } from "../utils";

export class MockHttpClient extends HTTPClient {
  public static instances: MockHttpClient[] = [];
  public static nextPostErrors: Error[] = [];
  public static postCalls: Array<{ endpoint: string; payload: unknown }> = [];
  public static nextPostResponses: unknown[] = [];

  constructor(baseURL: string) {
    super(baseURL);
    MockHttpClient.instances.push(this);
  }

  async post(endpoint: string, payload: unknown) {
    MockHttpClient.postCalls.push({ endpoint, payload });
    if (MockHttpClient.nextPostErrors.length > 0) {
      throw MockHttpClient.nextPostErrors.shift();
    }
    if (MockHttpClient.nextPostResponses.length > 0) {
      return MockHttpClient.nextPostResponses.shift();
    }
    // Default response for /commit endpoint - return a draft transaction
    if (endpoint === "/commit") {
      return {
        type: "TxBabbage",
        description: "Draft commit tx",
        cborHex: "84a4...",
      };
    }
    return { status: 200, data: "ok" };
  }

  async get(endpoint: string) {
    return { status: 200, data: {} };
  }

  async delete(endpoint: string) {
    return { status: 200, data: "ok" };
  }

  public static reset() {
    MockHttpClient.instances = [];
    MockHttpClient.nextPostErrors = [];
    MockHttpClient.postCalls = [];
    MockHttpClient.nextPostResponses = [];
  }
}
