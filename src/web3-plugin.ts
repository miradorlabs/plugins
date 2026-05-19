/**
 * Web3 plugin for blockchain transaction tracing.
 * Extracts all web3/blockchain methods from core Trace into a plugin.
 */
import type { MiradorPlugin, PluginSetupResult, TraceContext, FlushBuilder } from './plugin';
import { HintType } from './hints';
import {
  Chain,
  Severity,
  type ChainInput,
  type EIP1193Provider,
  type TxHintOptions,
  type TransactionLike,
  type TransactionRequest,
  type TxHashHint,
  type SafeMsgHintData,
  type SafeTxHintData,
  type RelayQuoteHintData,
} from './types';
import { toChain, resolveChainInput } from './chains';

/** Input shape for `trace.web3.relay.addRelayQuoteHint(...)` — everything in
 *  RelayQuoteHintData except the wire timestamp (which the plugin stamps
 *  when the call is made). Users pass this; the plugin handles the rest. */
export type RelayQuoteHintInput = Omit<RelayQuoteHintData, 'timestamp'> & {
  /** Optional override; defaults to current time when omitted. */
  timestamp?: Date;
};

/** Options for the Web3Plugin */
export interface Web3PluginOptions {
  /** EIP-1193 provider to use for transaction operations */
  provider?: EIP1193Provider;
}

/** The leaf methods that Web3Plugin exposes under web3.evm */
export interface EvmMethods {
  addTxHint(txHash: string, chain: ChainInput, options?: string | TxHintOptions): void;
  addInputData(inputData: string): void;
  addTx(tx: TransactionLike, chain?: ChainInput): void;
  setProvider(provider: EIP1193Provider): void;
  getProviderChain(): Chain | null;
  resolveChain(chain?: ChainInput, chainId?: number | bigint | string): Chain;
  sendTransaction(tx: TransactionRequest, provider?: EIP1193Provider): Promise<string>;
}

/** The leaf methods that Web3Plugin exposes under web3.safe */
export interface SafeNamespaceMethods {
  addMsgHint(msgHash: string, chain: ChainInput, details?: string): void;
  addTxHint(safeTxHash: string, chain: ChainInput, details?: string): void;
}

/** The leaf methods that Web3Plugin exposes under web3.relay. */
export interface RelayNamespaceMethods {
  /**
   * Record a Relay (relay.link) intent hint at quote time. Ties the Relay
   * `requestId` to this trace so the relayhint backend processor can pick
   * the intent up and emit the full lifecycle (deposit → solver-committed →
   * fill, or refund / failed / not-found) as events on the trace.
   *
   * Call this once you have a resolved quote from Relay — before the user
   * deposits. The backend uses `originChainId` and `destChainId` to seed
   * its state machine; the remaining fields are optional but populate the
   * trace detail view with chain names, amounts, currencies, and addresses.
   */
  addRelayQuoteHint(hint: RelayQuoteHintInput): void;
}

/** The namespaced methods that Web3Plugin adds to Trace */
export interface Web3Methods {
  web3: {
    evm: EvmMethods;
    safe: SafeNamespaceMethods;
    relay: RelayNamespaceMethods;
  };
}

/**
 * Serialize transaction params for EIP-1193, converting bigints to hex strings
 */
function serializeTxParams(tx: TransactionRequest): Record<string, string | undefined> {
  const toHex = (val: string | bigint | number | undefined): string | undefined => {
    if (val === undefined) return undefined;
    if (typeof val === 'bigint') return '0x' + val.toString(16);
    if (typeof val === 'number') return '0x' + val.toString(16);
    return String(val);
  };

  return {
    from: tx.from,
    to: tx.to,
    data: tx.data,
    value: toHex(tx.value),
    gas: toHex(tx.gas),
    gasPrice: toHex(tx.gasPrice),
    maxFeePerGas: toHex(tx.maxFeePerGas),
    maxPriorityFeePerGas: toHex(tx.maxPriorityFeePerGas),
    nonce: toHex(tx.nonce),
    chainId: toHex(tx.chainId),
  };
}

/**
 * Web3 plugin for blockchain transaction tracing.
 *
 * Usage:
 * ```typescript
 * const client = new Client('key', {
 *   plugins: [Web3Plugin({ provider: window.ethereum })],
 * });
 * const trace = client.trace({ name: 'swap' });
 * trace.web3.evm.addTxHint('0x...', Chain.Ethereum);
 * // or with chain name string:
 * trace.web3.evm.addTxHint('0x...', 'ethereum');
 * ```
 */
export function Web3Plugin(options?: Web3PluginOptions): MiradorPlugin<Web3Methods> {
  return {
    name: 'web3',

    setup(ctx: TraceContext): PluginSetupResult<Web3Methods> {
      // Plugin-local state (closure)
      let provider: EIP1193Provider | null = options?.provider ?? null;
      let providerChain: Chain | null = null;

      // Pending data managed by this plugin
      const pendingTxHashHints: TxHashHint[] = [];
      const pendingSafeMsgHints: SafeMsgHintData[] = [];
      const pendingSafeTxHints: SafeTxHintData[] = [];
      const pendingRelayQuoteHints: RelayQuoteHintData[] = [];

      // Initiate async chain detection if provider was given
      if (provider) {
        provider.request({ method: 'eth_chainId' }).then((chainId) => {
          providerChain = toChain(Number(chainId as string)) ?? null;
        }).catch(() => { /* ignore */ });
      }

      // --- Method implementations ---

      function addTxHint(txHash: string, chain: ChainInput, opts?: string | TxHintOptions): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addTxHint');
          return;
        }
        const resolved = resolveChainInput(chain);
        let details: string | undefined;
        if (typeof opts === 'string') {
          details = opts;
        } else if (opts) {
          if (opts.input) { addInputData(opts.input); }
          details = opts.details;
        }
        pendingTxHashHints.push({ txHash, chain: resolved, details, timestamp: new Date() });
        ctx.scheduleFlush();
      }

      function addInputData(inputData: string): void {
        if (!inputData || inputData === '0x') return;
        ctx.addEvent('Tx input data', inputData);
      }

      function addTx(tx: TransactionLike, chain?: ChainInput): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addTx');
          return;
        }
        const resolvedChain = resolveChain(chain, tx.chainId);
        const input = tx.data ?? tx.input;
        if (input) { addInputData(input); }
        addTxHint(tx.hash, resolvedChain);
      }

      function setProviderFn(p: EIP1193Provider): void {
        provider = p;
        p.request({ method: 'eth_chainId' }).then((chainId) => {
          providerChain = toChain(Number(chainId as string)) ?? null;
        }).catch(() => { /* ignore */ });
      }

      function getProviderChain(): Chain | null {
        return providerChain;
      }

      function resolveChain(chain?: ChainInput, chainId?: number | bigint | string): Chain {
        if (chain !== undefined) return resolveChainInput(chain);
        if (chainId !== undefined) {
          const resolved = toChain(chainId);
          if (resolved) return resolved;
        }
        if (providerChain) return providerChain;
        throw new Error('[Web3Plugin] Cannot determine chain. Provide chain parameter, chainId, or set a provider.');
      }

      async function sendTransaction(tx: TransactionRequest, providerOverride?: EIP1193Provider): Promise<string> {
        const p = providerOverride ?? provider;
        if (!p) throw new Error('[Web3Plugin] No provider configured. Use setProvider() or pass a provider.');

        ctx.addEvent('tx:send', {
          to: tx.to,
          value: tx.value?.toString(),
          data: tx.data ? `${tx.data.slice(0, 10)}...` : undefined,
        }, { severity: Severity.Info });

        const chain = resolveChain(undefined, tx.chainId);

        try {
          const txHash = await p.request({
            method: 'eth_sendTransaction',
            params: [serializeTxParams(tx)],
          }) as string;

          if (tx.data) { addInputData(tx.data); }
          addTxHint(txHash, chain);
          ctx.addEvent('tx:sent', { txHash }, { severity: Severity.Info });
          return txHash;
        } catch (err) {
          const error = err as Error & { code?: unknown; data?: unknown };
          ctx.addEvent('tx:error', {
            message: error.message,
            code: error.code,
            data: error.data,
          }, { severity: Severity.Error });
          throw err;
        }
      }

      // --- Safe methods ---

      function safeAddMsgHint(msgHash: string, chain: ChainInput, details?: string): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addMsgHint');
          return;
        }
        const resolved = resolveChainInput(chain);
        pendingSafeMsgHints.push({ messageHash: msgHash, chain: resolved, details, timestamp: new Date() });
        ctx.scheduleFlush();
      }

      function safeAddTxHint(safeTxHash: string, chain: ChainInput, details?: string): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addTxHint');
          return;
        }
        const resolved = resolveChainInput(chain);
        pendingSafeTxHints.push({ safeTxHash, chain: resolved, details, timestamp: new Date() });
        ctx.scheduleFlush();
      }

      // --- Relay methods ---

      function relayAddQuoteHint(input: RelayQuoteHintInput): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addRelayQuoteHint');
          return;
        }
        if (!input?.requestId) {
          throw new Error('[Web3Plugin] addRelayQuoteHint: requestId is required');
        }
        // Backend requires non-zero origin and destination chain IDs to seed
        // its state machine. Fail loudly here rather than silently dropping
        // the hint server-side.
        const originChainId = Number(input.originChainId);
        const destChainId = Number(input.destChainId);
        if (!Number.isFinite(originChainId) || originChainId <= 0) {
          throw new Error('[Web3Plugin] addRelayQuoteHint: originChainId must be a positive integer');
        }
        if (!Number.isFinite(destChainId) || destChainId <= 0) {
          throw new Error('[Web3Plugin] addRelayQuoteHint: destChainId must be a positive integer');
        }
        pendingRelayQuoteHints.push({
          ...input,
          originChainId,
          destChainId,
          timestamp: input.timestamp ?? new Date(),
        });
        ctx.scheduleFlush();
      }

      // --- Lifecycle hooks ---

      function onFlush(builder: FlushBuilder): void {
        for (const hint of pendingTxHashHints) {
          builder.addHint(HintType.TX_HASH, hint);
        }
        pendingTxHashHints.length = 0;

        for (const hint of pendingSafeMsgHints) {
          builder.addHint(HintType.SAFE_MSG, hint);
        }
        pendingSafeMsgHints.length = 0;

        for (const hint of pendingSafeTxHints) {
          builder.addHint(HintType.SAFE_TX, hint);
        }
        pendingSafeTxHints.length = 0;

        for (const hint of pendingRelayQuoteHints) {
          builder.addHint(HintType.RELAY_QUOTE, hint);
        }
        pendingRelayQuoteHints.length = 0;
      }

      function hasPendingData(): boolean {
        return (
          pendingTxHashHints.length > 0 ||
          pendingSafeMsgHints.length > 0 ||
          pendingSafeTxHints.length > 0 ||
          pendingRelayQuoteHints.length > 0
        );
      }

      function onClose(): void {
        pendingTxHashHints.length = 0;
        pendingSafeMsgHints.length = 0;
        pendingSafeTxHints.length = 0;
        pendingRelayQuoteHints.length = 0;
        provider = null;
        providerChain = null;
      }

      return {
        methods: {
          web3: {
            evm: {
              addTxHint,
              addInputData,
              addTx,
              setProvider: setProviderFn,
              getProviderChain,
              resolveChain,
              sendTransaction,
            },
            safe: {
              addMsgHint: safeAddMsgHint,
              addTxHint: safeAddTxHint,
            },
            relay: {
              addRelayQuoteHint: relayAddQuoteHint,
            },
          },
        },
        noopMethods: {
          web3: {
            evm: {
              getProviderChain: () => null,
              sendTransaction: () => Promise.resolve(''),
            },
          },
        },
        onFlush,
        onClose,
        hasPendingData,
      };
    },
  };
}
