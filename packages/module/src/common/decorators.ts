/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const Trackable = <T extends { new (...args: any[]): Object }>(
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
    descriptor.value = function (...args: unknown[]) {
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
