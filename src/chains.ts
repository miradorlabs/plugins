/**
 * Chain ID / name conversion utilities
 */
import { Chain } from './types';
import type { ChainName, ChainInput } from './types';

/**
 * Set of valid Chain enum values for O(1) lookup
 */
const VALID_CHAIN_IDS = new Set<number>(Object.values(Chain).filter((v): v is number => typeof v === 'number'));

/**
 * Maps chain name strings to Chain enum values.
 */
const CHAIN_NAME_MAP: Record<ChainName, Chain> = {
  ethereum: Chain.Ethereum,
  polygon: Chain.Polygon,
  arbitrum: Chain.Arbitrum,
  base: Chain.Base,
  optimism: Chain.Optimism,
  bsc: Chain.BSC,
};

/**
 * Convert a raw chain ID (number, bigint, or hex string) to a Chain enum value.
 * @returns The Chain value or undefined if not recognized
 */
export function toChain(chainId: number | bigint | string): Chain | undefined {
  const id = Number(chainId);
  return VALID_CHAIN_IDS.has(id) ? (id as Chain) : undefined;
}

/**
 * Resolve a ChainInput (Chain enum or chain name string) to a Chain enum value.
 * @throws if the input is an unrecognized string
 */
export function resolveChainInput(input: ChainInput): Chain {
  if (typeof input === 'number') return input;
  const chain = CHAIN_NAME_MAP[input];
  if (chain === undefined) throw new Error(`[Web3Plugin] Unknown chain name: "${input}"`);
  return chain;
}
