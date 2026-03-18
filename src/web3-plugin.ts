/**
 * Web3 plugin for blockchain transaction tracing.
 * Extracts all web3/blockchain methods from core Trace into a plugin.
 */
import type { MiradorPlugin, PluginSetupResult, TraceContext, FlushBuilder } from './plugin';
import { HintType } from './hints';
import type {
  ChainName,
  EIP1193Provider,
  TxHintOptions,
  TransactionLike,
  TransactionRequest,
  TxHashHint,
  SafeMsgHintData,
  SafeTxHintData,
} from './types';
import { chainIdToName } from './chains';

/** Options for the Web3Plugin */
export interface Web3PluginOptions {
  /** EIP-1193 provider to use for transaction operations */
  provider?: EIP1193Provider;
}

/** The leaf methods that Web3Plugin exposes under web3.evm */
export interface EvmMethods {
  addTxHint(txHash: string, chain: ChainName, options?: string | TxHintOptions): void;
  addInputData(inputData: string): void;
  addTx(tx: TransactionLike, chain?: ChainName): void;
  setProvider(provider: EIP1193Provider): void;
  getProviderChain(): ChainName | null;
  resolveChain(chain?: ChainName, chainId?: number | bigint | string): ChainName;
  sendTransaction(tx: TransactionRequest, provider?: EIP1193Provider): Promise<string>;
}

/** The leaf methods that Web3Plugin exposes under web3.safe */
export interface SafeNamespaceMethods {
  addMsgHint(msgHash: string, chain: ChainName, details?: string): void;
  addTxHint(safeTxHash: string, chain: ChainName, details?: string): void;
}

/** The namespaced methods that Web3Plugin adds to Trace */
export interface Web3Methods {
  web3: { evm: EvmMethods; safe: SafeNamespaceMethods };
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
 * trace.web3.evm.addTxHint('0x...', 'ethereum');
 * ```
 */
export function Web3Plugin(options?: Web3PluginOptions): MiradorPlugin<Web3Methods> {
  return {
    name: 'web3',

    setup(ctx: TraceContext): PluginSetupResult<Web3Methods> {
      // Plugin-local state (closure)
      let provider: EIP1193Provider | null = options?.provider ?? null;
      let providerChainName: ChainName | null = null;

      // Pending data managed by this plugin
      const pendingTxHashHints: TxHashHint[] = [];
      const pendingSafeMsgHints: SafeMsgHintData[] = [];
      const pendingSafeTxHints: SafeTxHintData[] = [];

      // Initiate async chain detection if provider was given
      if (provider) {
        provider.request({ method: 'eth_chainId' }).then((chainId) => {
          providerChainName = chainIdToName(Number(chainId as string)) ?? null;
        }).catch(() => { /* ignore */ });
      }

      // --- Method implementations ---

      function addTxHint(txHash: string, chain: ChainName, opts?: string | TxHintOptions): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addTxHint');
          return;
        }
        let details: string | undefined;
        if (typeof opts === 'string') {
          details = opts;
        } else if (opts) {
          if (opts.input) { addInputData(opts.input); }
          details = opts.details;
        }
        pendingTxHashHints.push({ txHash, chain, details, timestamp: new Date() });
        ctx.scheduleFlush();
      }

      function addInputData(inputData: string): void {
        if (!inputData || inputData === '0x') return;
        ctx.addEvent('Tx input data', inputData);
      }

      function addTx(tx: TransactionLike, chain?: ChainName): void {
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
          providerChainName = chainIdToName(Number(chainId as string)) ?? null;
        }).catch(() => { /* ignore */ });
      }

      function getProviderChain(): ChainName | null {
        return providerChainName;
      }

      function resolveChain(chain?: ChainName, chainId?: number | bigint | string): ChainName {
        if (chain) return chain;
        if (chainId !== undefined) {
          const resolved = chainIdToName(chainId);
          if (resolved) return resolved;
        }
        if (providerChainName) return providerChainName;
        throw new Error('[Web3Plugin] Cannot determine chain. Provide chain parameter, chainId, or set a provider.');
      }

      async function sendTransaction(tx: TransactionRequest, providerOverride?: EIP1193Provider): Promise<string> {
        const p = providerOverride ?? provider;
        if (!p) throw new Error('[Web3Plugin] No provider configured. Use setProvider() or pass a provider.');

        ctx.addEvent('tx:send', {
          to: tx.to,
          value: tx.value?.toString(),
          data: tx.data ? `${tx.data.slice(0, 10)}...` : undefined,
        });

        try {
          const txHash = await p.request({
            method: 'eth_sendTransaction',
            params: [serializeTxParams(tx)],
          }) as string;

          const chain = resolveChain(undefined, tx.chainId);
          if (tx.data) { addInputData(tx.data); }
          addTxHint(txHash, chain);
          ctx.addEvent('tx:sent', { txHash });
          return txHash;
        } catch (err) {
          const error = err as Error & { code?: unknown; data?: unknown };
          ctx.addEvent('tx:error', {
            message: error.message,
            code: error.code,
            data: error.data,
          });
          throw err;
        }
      }

      // --- Safe methods ---

      function safeAddMsgHint(msgHash: string, chain: ChainName, details?: string): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addMsgHint');
          return;
        }
        pendingSafeMsgHints.push({ messageHash: msgHash, chain, details, timestamp: new Date() });
        ctx.scheduleFlush();
      }

      function safeAddTxHint(safeTxHash: string, chain: ChainName, details?: string): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[Web3Plugin] Trace is closed, ignoring addTxHint');
          return;
        }
        pendingSafeTxHints.push({ safeTxHash, chain, details, timestamp: new Date() });
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
      }

      function hasPendingData(): boolean {
        return pendingTxHashHints.length > 0 || pendingSafeMsgHints.length > 0 || pendingSafeTxHints.length > 0;
      }

      function onClose(): void {
        pendingTxHashHints.length = 0;
        pendingSafeMsgHints.length = 0;
        pendingSafeTxHints.length = 0;
        provider = null;
        providerChainName = null;
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
