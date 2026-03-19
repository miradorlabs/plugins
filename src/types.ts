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
 * Supported EVM chains, keyed by chain ID.
 */
export enum Chain {
  Ethereum = 1,
  Polygon = 137,
  Arbitrum = 42161,
  Base = 8453,
  Optimism = 10,
  BSC = 56,
}

/**
 * Chain name strings (legacy / convenience).
 */
export type ChainName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc';

/**
 * Accepted chain input — callers can pass either a Chain enum value or a chain name string.
 */
export type ChainInput = Chain | ChainName;

/**
 * Transaction hash hint for blockchain correlation
 */
export interface TxHashHint {
  txHash: string;
  chain: Chain;
  details?: string;
  timestamp: Date;
}

/**
 * Safe message hint for Safe multisig message tracking
 */
export interface SafeMsgHintData {
  messageHash: string;
  chain: Chain;
  details?: string;
  timestamp: Date;
}

/**
 * Safe transaction hint for Safe multisig transaction tracking
 */
export interface SafeTxHintData {
  safeTxHash: string;
  chain: Chain;
  details?: string;
  timestamp: Date;
}

/**
 * Event severity levels.
 */
export enum Severity {
  Info = 1,
  Warn = 2,
  Error = 3,
}

/**
 * Options for adding an event
 */
export interface AddEventOptions {
  /** Capture stack trace at the point where addEvent is called */
  captureStackTrace?: boolean;
  /** Event severity (defaults to Info) */
  severity?: Severity;
  /** Timestamp for the event (defaults to current date) */
  timestamp?: Date;
}
