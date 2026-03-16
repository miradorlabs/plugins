/**
 * Safe plugin for Gnosis Safe multisig transaction and message tracking.
 */
import type { MiradorPlugin, PluginSetupResult, TraceContext, FlushBuilder } from './plugin';
import { HintType } from './hints';
import type { ChainName, SafeMsgHintData, SafeTxHintData } from './types';

/** The methods that SafePlugin adds to Trace */
export interface SafeMethods {
  addSafeMsgHint(msgHint: string, chain: ChainName, details?: string): void;
  addSafeTxHint(safeTxHash: string, chain: ChainName, details?: string): void;
}

/**
 * Safe plugin for Gnosis Safe multisig tracking.
 *
 * Usage:
 * ```typescript
 * const client = new Client('key', {
 *   plugins: [SafePlugin()],
 * });
 * const trace = client.trace({ name: 'multisig-op' });
 * trace.addSafeMsgHint('0x...', 'ethereum', 'approval');
 * trace.addSafeTxHint('0x...', 'ethereum', 'execution');
 * ```
 */
export function SafePlugin(): MiradorPlugin<SafeMethods> {
  return {
    name: 'safe',

    setup(ctx: TraceContext): PluginSetupResult<SafeMethods> {
      const pendingSafeMsgHints: SafeMsgHintData[] = [];
      const pendingSafeTxHints: SafeTxHintData[] = [];

      function addSafeMsgHint(msgHint: string, chain: ChainName, details?: string): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[SafePlugin] Trace is closed, ignoring addSafeMsgHint');
          return;
        }
        pendingSafeMsgHints.push({ messageHash: msgHint, chain, details, timestamp: new Date() });
        ctx.scheduleFlush();
      }

      function addSafeTxHint(safeTxHash: string, chain: ChainName, details?: string): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[SafePlugin] Trace is closed, ignoring addSafeTxHint');
          return;
        }
        pendingSafeTxHints.push({ safeTxHash, chain, details, timestamp: new Date() });
        ctx.scheduleFlush();
      }

      function onFlush(builder: FlushBuilder): void {
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
        return pendingSafeMsgHints.length > 0 || pendingSafeTxHints.length > 0;
      }

      function onClose(): void {
        pendingSafeMsgHints.length = 0;
        pendingSafeTxHints.length = 0;
      }

      return {
        methods: {
          addSafeMsgHint,
          addSafeTxHint,
        },
        onFlush,
        onClose,
        hasPendingData,
      };
    },
  };
}
