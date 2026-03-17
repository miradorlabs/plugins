import { chainIdToName } from '../src/chains';

describe('chainIdToName', () => {
  it('should map ethereum chain ID', () => {
    expect(chainIdToName(1)).toBe('ethereum');
  });

  it('should map polygon chain ID', () => {
    expect(chainIdToName(137)).toBe('polygon');
  });

  it('should map arbitrum chain ID', () => {
    expect(chainIdToName(42161)).toBe('arbitrum');
  });

  it('should map base chain ID', () => {
    expect(chainIdToName(8453)).toBe('base');
  });

  it('should map optimism chain ID', () => {
    expect(chainIdToName(10)).toBe('optimism');
  });

  it('should map bsc chain ID', () => {
    expect(chainIdToName(56)).toBe('bsc');
  });

  it('should return undefined for unknown chain IDs', () => {
    expect(chainIdToName(999999)).toBeUndefined();
    expect(chainIdToName(0)).toBeUndefined();
  });

  it('should handle bigint input', () => {
    expect(chainIdToName(BigInt(1))).toBe('ethereum');
    expect(chainIdToName(BigInt(137))).toBe('polygon');
  });

  it('should handle string input', () => {
    expect(chainIdToName('1')).toBe('ethereum');
    expect(chainIdToName('137')).toBe('polygon');
  });

  it('should handle hex string input', () => {
    expect(chainIdToName('0x1')).toBe('ethereum');
    expect(chainIdToName('0x89')).toBe('polygon');
  });
});
