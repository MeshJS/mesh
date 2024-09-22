import {
  getRingAreaSample,
  getDiamondAreaSample,
  writePelletsCSV,
} from "./utils.ts";

const pellets = getRingAreaSample(20, 30, 30n, 80n, 0.15);
//const pellets = getDiamondAreaSample(0n, 9n, 30n, 50n, 0.05);

writePelletsCSV(pellets, "tests/admin/pellets/circle1.csv");
