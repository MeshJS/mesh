import { getDRepIds } from "@meshsdk/core-cst";

describe("DRep", () => {
  test("Get DRepIds of a CIP105 script", () => {
    expect(
      getDRepIds(
        "drep_script190xv8v32n43luhu9ag05s5mvcs6079lg4zghzyg3j9vlgle68y3",
      ),
    ).toEqual({
      cip105: "drep_script190xv8v32n43luhu9ag05s5mvcs6079lg4zghzyg3j9vlgle68y3",
      cip129: "drep1yv4uesaj92wk8ljlsh4p7jzndnzrflchaz5fzug3zxg4naqkpeas3",
    });
  });

  test("Get DRepIds of a CIP129 script", () => {
    expect(
      getDRepIds("drep1yv4uesaj92wk8ljlsh4p7jzndnzrflchaz5fzug3zxg4naqkpeas3"),
    ).toEqual({
      cip105: "drep_script190xv8v32n43luhu9ag05s5mvcs6079lg4zghzyg3j9vlgle68y3",
      cip129: "drep1yv4uesaj92wk8ljlsh4p7jzndnzrflchaz5fzug3zxg4naqkpeas3",
    });
  });

  test("Get DRepIds of a CIP105 key hash", () => {
    expect(
      getDRepIds("drep100gzgh095hxsgarhdvacsz8m98sdwkyhm5924w74au5djs8u5ud"),
    ).toEqual({
      cip105: "drep100gzgh095hxsgarhdvacsz8m98sdwkyhm5924w74au5djs8u5ud",
      cip129: "drep1yfaaqfzaukju6pr5wa4nhzqglv57p46cjlws424m6hhj3kg2k9vj7",
    });
  });

  test("Get DRepIds of a CIP129 key hash", () => {
    expect(
      getDRepIds("drep1yfaaqfzaukju6pr5wa4nhzqglv57p46cjlws424m6hhj3kg2k9vj7"),
    ).toEqual({
      cip105: "drep100gzgh095hxsgarhdvacsz8m98sdwkyhm5924w74au5djs8u5ud",
      cip129: "drep1yfaaqfzaukju6pr5wa4nhzqglv57p46cjlws424m6hhj3kg2k9vj7",
    });
  });
});
