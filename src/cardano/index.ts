class Cardano {
  private _wasm;

  async load() {
    if (this._wasm) return;

    try {
      this._wasm = await import("@emurgo/cardano-serialization-lib-browser");
    } catch (error) {
      throw error;
    }
  }

  get Instance() {
    return this._wasm;
  }
}

export default new Cardano();

// class Loader {
//   private _wasm;

//   async load() {
//     if (this._wasm) {
//       return;
//     }
//     this._wasm = await import("@emurgo/cardano-serialization-lib-browser");
//   }

//   get Cardano() {
//     return this._wasm;
//   }
// }

// export default async function Cardano() {
//   const loader = new Loader();
//   console.log("loader", loader)
//   await loader.load();
//   console.log("loader 2",  loader.Cardano)
//   return loader.Cardano;
// }
