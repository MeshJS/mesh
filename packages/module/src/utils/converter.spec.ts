describe('converter', () => { 
  it('should convert decimal to fraction', () => {
    const { numerator, denominator } = fromDecimal('0.0000721');

    expect(numerator).toBe('721');
    expect(denominator).toBe('10000000');
  })
 });

function fromDecimal(decimal: string): { numerator: string, denominator: string } {
  let numerator = decimal.replace('.', '');
  let denominator = '1';

  while (numerator.startsWith('0')) {
    numerator = numerator.slice(1);
    denominator += '0';
  }

  return {
    numerator,
    denominator
  };
}
