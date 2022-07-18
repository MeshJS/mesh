class SerializationLib {
  private _wasm;

  importNodeOrSSR = async () => {
    try {
      return await import(
        /* webpackIgnore: true */
        '@emurgo/cardano-serialization-lib-nodejs'
      );
    } catch (e) {
      return null;
    }
  };

  async load() {
    if (this._wasm) return;

    try {
      this._wasm = (typeof window !== 'undefined'
      ? await import(
          '@emurgo/cardano-serialization-lib-browser'
        )
      : await this.importNodeOrSSR())!

    } catch (error) {
      throw error;
    }
  }

  get Instance() {
    return this._wasm;
  }
}

export default new SerializationLib();