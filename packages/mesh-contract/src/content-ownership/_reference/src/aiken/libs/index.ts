import * as C from "./pkg/mesh_rust_utils.js";

async function unsafeInstantiate(module: any, url: string) {
  try {
    await module.instantiate({
      url: new URL(url),
    });
  } catch (_e) {
    // This only ever happens during SSR rendering
  }
}

await Promise.all([unsafeInstantiate(C, `pkg/mesh_rust_utils_bg.wasm`)]);

export { C };
