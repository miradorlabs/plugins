import { toChain } from '../src/chains';
import { Chain } from '../src/types';

describe('toChain', () => {
  it('should map ethereum chain ID', () => {
    expect(toChain(1)).toBe(Chain.Ethereum);
  });

  it('should map polygon chain ID', () => {
    expect(toChain(137)).toBe(Chain.Polygon);
  });

  it('should map arbitrum chain ID', () => {
    expect(toChain(42161)).toBe(Chain.Arbitrum);
  });

  it('should map base chain ID', () => {
    expect(toChain(8453)).toBe(Chain.Base);
  });

  it('should map optimism chain ID', () => {
    expect(toChain(10)).toBe(Chain.Optimism);
  });

  it('should map bsc chain ID', () => {
    expect(toChain(56)).toBe(Chain.BSC);
  });

  it('should map hyperevm chain ID', () => {
    expect(toChain(999)).toBe(Chain.HyperEVM);
  });

  it('should return undefined for unknown chain IDs', () => {
    expect(toChain(999999)).toBeUndefined();
    expect(toChain(0)).toBeUndefined();
  });

  it('should handle bigint input', () => {
    expect(toChain(BigInt(1))).toBe(Chain.Ethereum);
    expect(toChain(BigInt(137))).toBe(Chain.Polygon);
  });

  it('should handle string input', () => {
    expect(toChain('1')).toBe(Chain.Ethereum);
    expect(toChain('137')).toBe(Chain.Polygon);
  });

  it('should handle hex string input', () => {
    expect(toChain('0x1')).toBe(Chain.Ethereum);
    expect(toChain('0x89')).toBe(Chain.Polygon);
  });
});
