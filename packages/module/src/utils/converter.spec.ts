describe('converter', () => { 
  it('should convert decimal to fraction', () => {
    const { numerator, denominator } = fromFloat('0.0000721');

    expect(numerator).toBe('721');
    expect(denominator).toBe('10000000');
  })
 });

const fromFloat = (float: string): { numerator: string, denominator: string } => {
  const parts = float.split('.');
  
  const numerator = `${parseInt(parts[1], 10)}`;
  const denominator = '1' + '0'.repeat(parts[1].length);
  
  return { numerator, denominator };
}
