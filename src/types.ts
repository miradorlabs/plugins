/**
 * Shared types for Mirador plugins
 */

/** EIP-1193 compatible provider interface */
export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/** Options for addTxHint (extends current string details) */
export interface TxHintOptions {
  /** Transaction input data / calldata */
  input?: string;
  /** Additional details string */
  details?: string;
}

/** A transaction-like object (matches ethers/viem/raw RPC response shapes) */
export interface TransactionLike {
  hash: string;
  data?: string;
  input?: string;
  chainId?: number | bigint | string;
}

/** Transaction parameters for sendTransaction (EIP-1193 style) */
export interface TransactionRequest {
  from: string;
  to?: string;
  data?: string;
  value?: string | bigint;
  gas?: string | bigint;
  gasPrice?: string | bigint;
  maxFeePerGas?: string | bigint;
  maxPriorityFeePerGas?: string | bigint;
  nonce?: number | string;
  chainId?: number | string;
}

/**
 * Logger interface for configurable SDK logging.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Supported chain names (maps to Chain enum in proto)
 */
export type ChainName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc';

/**
 * Transaction hash hint for blockchain correlation
 */
export interface TxHashHint {
  txHash: string;
  chain: ChainName;
  details?: string;
  timestamp: Date;
}

/**
 * Safe message hint for Safe multisig message tracking
 */
export interface SafeMsgHintData {
  messageHash: string;
  chain: ChainName;
  details?: string;
  timestamp: Date;
}

/**
 * Safe transaction hint for Safe multisig transaction tracking
 */
export interface SafeTxHintData {
  safeTxHash: string;
  chain: ChainName;
  details?: string;
  timestamp: Date;
}

/**
 * Options for adding an event
 */
export interface AddEventOptions {
  /** Capture stack trace at the point where addEvent is called */
  captureStackTrace?: boolean;
}
