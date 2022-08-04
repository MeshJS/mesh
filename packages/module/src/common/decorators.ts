export const Trackable = <T extends { new (...args: any[]): {} }>(
  constructor: T
) => {
  return class extends constructor {
    __visits = [];
  };
};

export const Checkpoint = () => {
  return function (
    _target: Object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const result = method.call(this, ...args);

      if ((this as TrackableObject).__visits)
        (this as TrackableObject).__visits.push(propertyKey);

      return result;
    };
  };
};

export interface TrackableObject {
  __visits: unknown[];
}
