export class Emitter<T extends Record<string, (...args: any) => void>> {
  private listeners: { [K in keyof T]?: Set<T[K]> } = {};

  on<K extends keyof T>(event: K, callback: T[K]) {
    (this.listeners[event] ??= new Set()).add(callback);
    return () => this.off(event, callback);
  }

  once<K extends keyof T>(event: K, callback: T[K]) {
    const onceFn = (...args: any) => {
      this.off(event, onceFn as T[K]);
      callback(...args);
    };
    this.on(event, onceFn as T[K]);
  }

  off<K extends keyof T>(event: K, callback: T[K]) {
    this.listeners[event]?.delete(callback);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>) {
    this.listeners[event]?.forEach((cb) => cb(...args));
  }
}
