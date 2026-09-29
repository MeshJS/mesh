import { js_get_required_inputs_to_resolve } from "@sidan-lab/whisky-js-nodejs";

import { getRequiredInputs } from "../../src/utils/transaction-parser";

jest.mock("@sidan-lab/whisky-js-nodejs", () => ({
  js_get_required_inputs_to_resolve: jest.fn(),
}));

const mockedGetRequiredInputs = jest.mocked(js_get_required_inputs_to_resolve);

const mockRequiredInputs = (data: string[]) => {
  mockedGetRequiredInputs.mockReturnValue({
    get_status: () => "success",
    get_error: () => "",
    get_data: () => JSON.stringify(data),
  } as ReturnType<typeof js_get_required_inputs_to_resolve>);
};

describe("getRequiredInputs", () => {
  beforeEach(() => {
    mockedGetRequiredInputs.mockReset();
  });

  test("rejects malformed output indexes", () => {
    mockRequiredInputs(["txhash#1abc"]);

    expect(() => getRequiredInputs("txhex")).toThrow(
      "Invalid UTxO output index: 1abc",
    );
  });

  test("parses nonnegative integer output indexes", () => {
    mockRequiredInputs(["txhash#12"]);

    expect(getRequiredInputs("txhex")).toEqual([
      { txHash: "txhash", outputIndex: 12 },
    ]);
  });
});
