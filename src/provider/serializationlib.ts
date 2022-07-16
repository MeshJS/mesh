class SerializationLib {
  private _wasm;
  async load() {
    if (this._wasm) return;

    try {
      if (typeof process === 'object')
        this._wasm = await import("@emurgo/cardano-serialization-lib-nodejs");
      else
        this._wasm = await import("@emurgo/cardano-serialization-lib-browser");
    } catch (error) {
      throw error;
    }
  }

  get Instance() {
    return this._wasm;
  }
}

export default new SerializationLib();
