import { fromFloat } from "./converter";

describe('converter', () => { 
  it('should convert decimal to fraction', () => {
    const { numerator, denominator } = fromFloat('0.0000721');

    expect(numerator).toBe('721');
    expect(denominator).toBe('10000000');
  })
 });
 