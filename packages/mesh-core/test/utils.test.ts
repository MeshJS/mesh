import { deserializePoolId } from "../src";

describe("Util tests", () => {
  it("should correctly deserialize a pool id", () => {
    expect(
      deserializePoolId(
        "pool1lzg07gaddygem6f5ch60yv0l0g2529af87hqgw6gkqdmsfs39z9",
      ),
    ).toBe("f890ff23ad69119de934c5f4f231ff7a154517a93fae043b48b01bb8");
  });
});
