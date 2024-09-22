import { parse, stringify } from "jsr:@std/csv";

type Coordinates = Array<{ pos_x: bigint; pos_y: bigint }>;
type PelletParams = Array<{ fuel: number; pos_x: bigint; pos_y: bigint }>;

function getRandomSubarray<T>(arr: Array<T>, size: number) {
  const shuffled = arr.slice(0);
  let i = arr.length,
    temp,
    index;
  while (i--) {
    index = Math.floor((i + 1) * Math.random());
    temp = shuffled[index];
    shuffled[index] = shuffled[i];
    shuffled[i] = temp;
  }
  return shuffled.slice(0, size);
}

/**
 * Returns an array with the coordinates of a diamond (rhombus) with diagonal r.
 * Since we measure distances using the "manhattan distance", diamonds are the
 * actual "circumferences" (set of points equidistant from the center) in our geometry.
 * @param r Diamond diagonal.
 */
function getDiamondCoordinates(r: bigint): Coordinates {
  const coordinates = [];
  for (let i = 0n; i < r; i++) {
    coordinates.push({
      pos_x: r - i,
      pos_y: i,
    });
    coordinates.push({
      pos_x: -r + i,
      pos_y: -i,
    });
    coordinates.push({
      pos_x: -i,
      pos_y: r - i,
    });
    coordinates.push({
      pos_x: i,
      pos_y: -r + i,
    });
  }
  return coordinates;
}

/**
 * Returns an array with the coordinates of the points that lie in the
 * area between two diamonds with diagonals inner_r and outer_r respectively.
 * @param inner_r Inner diamond diagonal. Must be greater than or equal to 0.
 * @param outer_r Outer diamond diagonal. Must be greater than or equal to inner_r.
 */
function getDiamondAreaCoordinates(
  inner_r: bigint,
  outer_r: bigint
): Coordinates {
  if (inner_r < 0 || inner_r > outer_r) {
    throw Error(
      "inner_r must be a positive number less than or equal to outer_r"
    );
  }
  const coordinates = [];
  for (let r = inner_r; r <= outer_r; r++) {
    coordinates.push(getDiamondCoordinates(r));
  }
  return coordinates.flat();
}

/**
 * Returns an array with a random sample of pellet parameters over the area
 * between two diamonds with diagonals inner_r and outer_r respectively.
 * @param inner_r Inner diamond diagonal. Must be greater than or equal to 0.
 * @param outer_r Outer diamond diagonal. Must be greater than or equal to inner_r.
 * @param min_fuel Minimum fuel held by the sample pellets. Must be greater than or equal to 0.
 * @param max_fuel Maximum fuel held by the sample pellets. Must be greater than or equal to min_fuel.
 * @param density Density of the sample: equals 1 if every diamond point is taken. Must be in the range 0 - 1, inclusive.
 */
function getDiamondAreaSample(
  inner_r: bigint,
  outer_r: bigint,
  min_fuel: bigint,
  max_fuel: bigint,
  density: number
): PelletParams {
  if (density > 1 || density < 0) {
    throw Error("Density must be a number between 0 and 1.");
  }
  if (min_fuel < 0 || min_fuel > max_fuel) {
    throw Error(
      "min_fuel must be a positive number less than or equal to max_fuel"
    );
  }
  const coordinates = getDiamondAreaCoordinates(inner_r, outer_r);
  const sample_size = Math.floor(coordinates.length * density);
  const sample_coordinates = getRandomSubarray(coordinates, sample_size);
  const pellets = sample_coordinates.map((c) => ({
    fuel: Math.floor(
      Math.random() * Number(max_fuel - min_fuel) + Number(min_fuel)
    ),
    pos_x: c.pos_x,
    pos_y: c.pos_y,
  }));
  return pellets;
}

/**
 * Returns an array with the coordinates of the points that lie in the
 * area between two circles with radii inner_r and outer_r respectively.
 * @param inner_r Inner circle radius. Must be greater than or equal to 0.
 * @param outer_r Outer circle radius. Must be greater than or equal to inner_r.
 */
function getRingAreaCoordinates(inner_r: number, outer_r: number): Coordinates {
  if (inner_r < 0 || inner_r > outer_r) {
    throw Error(
      "inner_r must be a positive number less than or equal to outer_r"
    );
  }
  const x_bound = Math.floor(outer_r);
  const xs = Array.from({ length: 2 * x_bound + 1 }, (_, i) => i - x_bound);
  const coordinates = xs.map((x) => {
    const y_outer_bound = Math.floor(Math.sqrt(outer_r ** 2 - x ** 2));
    let ys = Array.from(
      { length: 2 * y_outer_bound + 1 },
      (_, i) => i - y_outer_bound
    );
    if (Math.abs(x) < Math.abs(inner_r)) {
      const y_inner_bound = Math.floor(Math.sqrt(inner_r ** 2 - x ** 2));
      ys = ys.filter((y) => Math.abs(y) > y_inner_bound);
    }
    return ys.map((y) => ({ pos_x: BigInt(x), pos_y: BigInt(y) }));
  });
  return coordinates.flat();
}

/**
 * Returns an array with a random sample of pellet parameters over the area
 * between two circles with radii inner_r and outer_r respectively.
 * @param inner_r Inner diamond diagonal. Must be greater than or equal to 0.
 * @param outer_r Outer diamond diagonal. Must be greater than or equal to inner_r.
 * @param min_fuel Minimum fuel held by the sample pellets. Must be greater than or equal to 0.
 * @param max_fuel Maximum fuel held by the sample pellets. Must be greater than or equal to min_fuel.
 * @param density Density of the sample: equals 1 if every diamond point is taken. Must be in the range 0 - 1, inclusive.
 */
function getRingAreaSample(
  inner_r: number,
  outer_r: number,
  min_fuel: bigint,
  max_fuel: bigint,
  density: number
): PelletParams {
  const coordinates = getRingAreaCoordinates(inner_r, outer_r);
  const sample_size = Math.floor(coordinates.length * density);
  const sample_coordinates = getRandomSubarray(coordinates, sample_size);
  const pellets = sample_coordinates.map((c) => ({
    fuel: Math.floor(
      Math.random() * Number(max_fuel - min_fuel) + Number(min_fuel)
    ),
    pos_x: c.pos_x,
    pos_y: c.pos_y,
  }));
  return pellets;
}

function writePelletsCSV(pellets: PelletParams, path: string) {
  const csv = stringify(pellets, {
    columns: ["fuel", "pos_x", "pos_y"],
  });
  Deno.writeTextFileSync(path, csv);
}

async function readPelletsCSV(path: string) {
  const text = await Deno.readTextFile(path);
  const data = parse(text, {
    skipFirstRow: true,
    columns: ["fuel", "pos_x", "pos_y"],
  });
  const params: { fuel: bigint; pos_x: bigint; pos_y: bigint }[] = data.map(
    (p) => ({
      fuel: BigInt(p.fuel),
      pos_x: BigInt(p.pos_x),
      pos_y: BigInt(p.pos_y),
    })
  );
  return params;
}

export {
  getDiamondAreaSample,
  getRingAreaSample,
  writePelletsCSV,
  readPelletsCSV,
};
