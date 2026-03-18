import { Web3Plugin } from '../src/web3-plugin';
import { HintType } from '../src/hints';
import { Chain } from '../src/types';
import type { TraceContext, FlushBuilder } from '../src/plugin';
import type { EIP1193Provider, TxHashHint, SafeMsgHintData, SafeTxHintData } from '../src/types';

// --- Test helpers ---

function createMockCtx(overrides?: Partial<TraceContext>): TraceContext {
  return {
    addEvent: jest.fn(),
    addAttribute: jest.fn(),
    addAttributes: jest.fn(),
    addTag: jest.fn(),
    addTags: jest.fn(),
    getTraceId: jest.fn().mockReturnValue('test-trace-id'),
    isClosed: jest.fn().mockReturnValue(false),
    scheduleFlush: jest.fn(),
    logger: {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    ...overrides,
  };
}

function createMockBuilder(): FlushBuilder & { hints: Array<{ type: string; data: unknown }> } {
  const hints: Array<{ type: string; data: unknown }> = [];
  return {
    hints,
    addHint: jest.fn((type: string, data: unknown) => { hints.push({ type, data }); }),
    addEvent: jest.fn(),
    addAttribute: jest.fn(),
    addTag: jest.fn(),
  };
}

function createMockProvider(chainId = '0x1'): jest.Mocked<EIP1193Provider> {
  return {
    request: jest.fn().mockImplementation(async (args: { method: string }) => {
      if (args.method === 'eth_chainId') return chainId;
      if (args.method === 'eth_sendTransaction') return '0xtxhash123';
      return null;
    }),
  };
}

describe('Web3Plugin', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('setup', () => {
    it('should return correct plugin name', () => {
      const plugin = Web3Plugin();
      expect(plugin.name).toBe('web3');
    });

    it('should return methods in correct namespace structure', () => {
      const plugin = Web3Plugin();
      const ctx = createMockCtx();
      const result = plugin.setup(ctx);

      expect(result.methods.web3).toBeDefined();
      expect(result.methods.web3.evm).toBeDefined();
      expect(result.methods.web3.safe).toBeDefined();
      expect(typeof result.methods.web3.evm.addTxHint).toBe('function');
      expect(typeof result.methods.web3.evm.addInputData).toBe('function');
      expect(typeof result.methods.web3.evm.addTx).toBe('function');
      expect(typeof result.methods.web3.evm.setProvider).toBe('function');
      expect(typeof result.methods.web3.evm.getProviderChain).toBe('function');
      expect(typeof result.methods.web3.evm.resolveChain).toBe('function');
      expect(typeof result.methods.web3.evm.sendTransaction).toBe('function');
      expect(typeof result.methods.web3.safe.addMsgHint).toBe('function');
      expect(typeof result.methods.web3.safe.addTxHint).toBe('function');
    });

    it('should return lifecycle hooks', () => {
      const plugin = Web3Plugin();
      const result = plugin.setup(createMockCtx());

      expect(typeof result.onFlush).toBe('function');
      expect(typeof result.onClose).toBe('function');
      expect(typeof result.hasPendingData).toBe('function');
    });

    it('should return noopMethods for getProviderChain and sendTransaction', () => {
      const plugin = Web3Plugin();
      const result = plugin.setup(createMockCtx());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noop = result.noopMethods as any;

      expect(noop.web3.evm.getProviderChain()).toBeNull();
      expect(noop.web3.evm.sendTransaction()).resolves.toBe('');
    });
  });

  describe('web3.evm.addTxHint', () => {
    it('should add a tx hint and schedule flush', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.evm.addTxHint('0xabc', Chain.Ethereum);
      expect(ctx.scheduleFlush).toHaveBeenCalled();

      onFlush!(builder);
      expect(builder.addHint).toHaveBeenCalledWith(
        HintType.TX_HASH,
        expect.objectContaining({ txHash: '0xabc', chain: Chain.Ethereum }),
      );
    });

    it('should accept string details', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.evm.addTxHint('0xabc', Chain.Polygon, 'swap tx');
      onFlush!(builder);

      const hint = builder.hints[0].data as TxHashHint;
      expect(hint.details).toBe('swap tx');
    });

    it('should accept TxHintOptions with input', () => {
      const ctx = createMockCtx();
      const { methods } = Web3Plugin().setup(ctx);

      methods.web3.evm.addTxHint('0xabc', Chain.Ethereum, { input: '0xdeadbeef' });
      expect(ctx.addEvent).toHaveBeenCalledWith('Tx input data', '0xdeadbeef');
    });

    it('should accept TxHintOptions with input and details', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.evm.addTxHint('0xabc', Chain.Ethereum, { input: '0xdeadbeef', details: 'swap' });
      onFlush!(builder);

      expect(ctx.addEvent).toHaveBeenCalledWith('Tx input data', '0xdeadbeef');
      const hint = builder.hints[0].data as TxHashHint;
      expect(hint.details).toBe('swap');
    });

    it('should be ignored when trace is closed', () => {
      const ctx = createMockCtx({ isClosed: jest.fn().mockReturnValue(true) });
      const { methods, hasPendingData } = Web3Plugin().setup(ctx);

      methods.web3.evm.addTxHint('0xabc', Chain.Ethereum);
      expect(ctx.logger.warn).toHaveBeenCalledWith('[Web3Plugin] Trace is closed, ignoring addTxHint');
      expect(hasPendingData!()).toBe(false);
    });
  });

  describe('web3.evm.addInputData', () => {
    it('should add event with input data', () => {
      const ctx = createMockCtx();
      const { methods } = Web3Plugin().setup(ctx);

      methods.web3.evm.addInputData('0xdeadbeef');
      expect(ctx.addEvent).toHaveBeenCalledWith('Tx input data', '0xdeadbeef');
    });

    it('should skip empty string', () => {
      const ctx = createMockCtx();
      const { methods } = Web3Plugin().setup(ctx);

      methods.web3.evm.addInputData('');
      expect(ctx.addEvent).not.toHaveBeenCalled();
    });

    it('should skip "0x"', () => {
      const ctx = createMockCtx();
      const { methods } = Web3Plugin().setup(ctx);

      methods.web3.evm.addInputData('0x');
      expect(ctx.addEvent).not.toHaveBeenCalled();
    });
  });

  describe('web3.evm.addTx', () => {
    it('should extract hash and chain from TransactionLike', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.evm.addTx({ hash: '0xtxhash', chainId: 1 });
      onFlush!(builder);

      const hint = builder.hints[0].data as TxHashHint;
      expect(hint.txHash).toBe('0xtxhash');
      expect(hint.chain).toBe(Chain.Ethereum);
    });

    it('should extract input data from tx.data', () => {
      const ctx = createMockCtx();
      const { methods } = Web3Plugin().setup(ctx);

      methods.web3.evm.addTx({ hash: '0xtxhash', data: '0xcalldata', chainId: 1 });
      expect(ctx.addEvent).toHaveBeenCalledWith('Tx input data', '0xcalldata');
    });

    it('should extract input data from tx.input', () => {
      const ctx = createMockCtx();
      const { methods } = Web3Plugin().setup(ctx);

      methods.web3.evm.addTx({ hash: '0xtxhash', input: '0xcalldata', chainId: 1 });
      expect(ctx.addEvent).toHaveBeenCalledWith('Tx input data', '0xcalldata');
    });

    it('should prefer explicit chain over chainId', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.evm.addTx({ hash: '0xtxhash', chainId: 137 }, Chain.Arbitrum);
      onFlush!(builder);

      const hint = builder.hints[0].data as TxHashHint;
      expect(hint.chain).toBe(Chain.Arbitrum);
    });

    it('should be ignored when trace is closed', () => {
      const ctx = createMockCtx({ isClosed: jest.fn().mockReturnValue(true) });
      const { methods, hasPendingData } = Web3Plugin().setup(ctx);

      methods.web3.evm.addTx({ hash: '0xtxhash', chainId: 1 });
      expect(ctx.logger.warn).toHaveBeenCalledWith('[Web3Plugin] Trace is closed, ignoring addTx');
      expect(hasPendingData!()).toBe(false);
    });
  });

  describe('web3.evm.setProvider and getProviderChain', () => {
    it('should return null when no provider is set', () => {
      const { methods } = Web3Plugin().setup(createMockCtx());
      expect(methods.web3.evm.getProviderChain()).toBeNull();
    });

    it('should detect chain from provider on setup', async () => {
      const provider = createMockProvider('0x1');
      const { methods } = Web3Plugin({ provider }).setup(createMockCtx());

      // Allow async chain detection to complete
      await jest.advanceTimersByTimeAsync(0);

      expect(methods.web3.evm.getProviderChain()).toBe(Chain.Ethereum);
    });

    it('should detect chain when provider is set via setProvider', async () => {
      const provider = createMockProvider('0x89'); // polygon = 137 = 0x89
      const { methods } = Web3Plugin().setup(createMockCtx());

      methods.web3.evm.setProvider(provider);
      await jest.advanceTimersByTimeAsync(0);

      expect(methods.web3.evm.getProviderChain()).toBe(Chain.Polygon);
    });
  });

  describe('web3.evm.resolveChain', () => {
    it('should return explicit chain if given', () => {
      const { methods } = Web3Plugin().setup(createMockCtx());
      expect(methods.web3.evm.resolveChain(Chain.Polygon)).toBe(Chain.Polygon);
    });

    it('should fall back to chainId', () => {
      const { methods } = Web3Plugin().setup(createMockCtx());
      expect(methods.web3.evm.resolveChain(undefined, 137)).toBe(Chain.Polygon);
    });

    it('should fall back to provider chain', async () => {
      const provider = createMockProvider('0x1');
      const { methods } = Web3Plugin({ provider }).setup(createMockCtx());
      await jest.advanceTimersByTimeAsync(0);

      expect(methods.web3.evm.resolveChain()).toBe(Chain.Ethereum);
    });

    it('should throw if no chain can be determined', () => {
      const { methods } = Web3Plugin().setup(createMockCtx());
      expect(() => methods.web3.evm.resolveChain()).toThrow(
        '[Web3Plugin] Cannot determine chain',
      );
    });
  });

  describe('web3.evm.sendTransaction', () => {
    it('should send tx via provider and return hash', async () => {
      const provider = createMockProvider('0x1');
      const { methods } = Web3Plugin({ provider }).setup(createMockCtx());
      await jest.advanceTimersByTimeAsync(0);

      const hash = await methods.web3.evm.sendTransaction({
        from: '0xsender',
        to: '0xrecipient',
        value: '0x1',
        chainId: 1,
      });

      expect(hash).toBe('0xtxhash123');
      expect(provider.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'eth_sendTransaction' }),
      );
    });

    it('should add tx hint and events after sending', async () => {
      const ctx = createMockCtx();
      const provider = createMockProvider('0x1');
      const { methods, onFlush } = Web3Plugin({ provider }).setup(ctx);
      await jest.advanceTimersByTimeAsync(0);

      await methods.web3.evm.sendTransaction({
        from: '0xsender',
        to: '0xrecipient',
        chainId: 1,
      });

      // Should have tx:send and tx:sent events
      expect(ctx.addEvent).toHaveBeenCalledWith('tx:send', expect.any(Object));
      expect(ctx.addEvent).toHaveBeenCalledWith('tx:sent', { txHash: '0xtxhash123' });

      // Should have added tx hint
      const builder = createMockBuilder();
      onFlush!(builder);
      expect(builder.hints).toHaveLength(1);
      expect(builder.hints[0].type).toBe(HintType.TX_HASH);
    });

    it('should capture tx:error on failure and re-throw', async () => {
      const ctx = createMockCtx();
      const provider = createMockProvider();
      const txError = Object.assign(new Error('user rejected'), { code: 4001, data: 'rejected' });
      provider.request.mockImplementation(async (args: { method: string }) => {
        if (args.method === 'eth_chainId') return '0x1';
        throw txError;
      });
      const { methods } = Web3Plugin({ provider }).setup(ctx);
      await jest.advanceTimersByTimeAsync(0);

      await expect(
        methods.web3.evm.sendTransaction({ from: '0xsender', chainId: 1 }),
      ).rejects.toThrow('user rejected');

      expect(ctx.addEvent).toHaveBeenCalledWith('tx:error', expect.objectContaining({
        message: 'user rejected',
        code: 4001,
        data: 'rejected',
      }));
    });

    it('should throw if no provider configured', async () => {
      const { methods } = Web3Plugin().setup(createMockCtx());

      await expect(
        methods.web3.evm.sendTransaction({ from: '0xsender' }),
      ).rejects.toThrow('[Web3Plugin] No provider configured');
    });

    it('should accept provider override', async () => {
      const override = createMockProvider('0x1');
      const { methods } = Web3Plugin().setup(createMockCtx());

      const hash = await methods.web3.evm.sendTransaction(
        { from: '0xsender', chainId: 1 },
        override,
      );

      expect(hash).toBe('0xtxhash123');
      expect(override.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'eth_sendTransaction' }),
      );
    });
  });

  describe('web3.safe.addMsgHint', () => {
    it('should add a safe msg hint', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.safe.addMsgHint('0xmsghash', Chain.Ethereum);
      expect(ctx.scheduleFlush).toHaveBeenCalled();

      onFlush!(builder);
      expect(builder.addHint).toHaveBeenCalledWith(
        HintType.SAFE_MSG,
        expect.objectContaining({ messageHash: '0xmsghash', chain: Chain.Ethereum }),
      );
    });

    it('should include details when provided', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.safe.addMsgHint('0xmsghash', Chain.Polygon, 'approval msg');
      onFlush!(builder);

      const hint = builder.hints[0].data as SafeMsgHintData;
      expect(hint.details).toBe('approval msg');
    });

    it('should be ignored when trace is closed', () => {
      const ctx = createMockCtx({ isClosed: jest.fn().mockReturnValue(true) });
      const { methods, hasPendingData } = Web3Plugin().setup(ctx);

      methods.web3.safe.addMsgHint('0xmsghash', Chain.Ethereum);
      expect(ctx.logger.warn).toHaveBeenCalledWith('[Web3Plugin] Trace is closed, ignoring addMsgHint');
      expect(hasPendingData!()).toBe(false);
    });
  });

  describe('web3.safe.addTxHint', () => {
    it('should add a safe tx hint', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.safe.addTxHint('0xsafetxhash', Chain.Ethereum);
      expect(ctx.scheduleFlush).toHaveBeenCalled();

      onFlush!(builder);
      expect(builder.addHint).toHaveBeenCalledWith(
        HintType.SAFE_TX,
        expect.objectContaining({ safeTxHash: '0xsafetxhash', chain: Chain.Ethereum }),
      );
    });

    it('should include details when provided', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.safe.addTxHint('0xsafetxhash', Chain.Base, 'execution tx');
      onFlush!(builder);

      const hint = builder.hints[0].data as SafeTxHintData;
      expect(hint.details).toBe('execution tx');
    });

    it('should be ignored when trace is closed', () => {
      const ctx = createMockCtx({ isClosed: jest.fn().mockReturnValue(true) });
      const { methods, hasPendingData } = Web3Plugin().setup(ctx);

      methods.web3.safe.addTxHint('0xsafetxhash', Chain.Ethereum);
      expect(ctx.logger.warn).toHaveBeenCalledWith('[Web3Plugin] Trace is closed, ignoring addTxHint');
      expect(hasPendingData!()).toBe(false);
    });
  });

  describe('lifecycle: onFlush', () => {
    it('should flush all pending hint types', () => {
      const ctx = createMockCtx();
      const { methods, onFlush } = Web3Plugin().setup(ctx);
      const builder = createMockBuilder();

      methods.web3.evm.addTxHint('0xtx1', Chain.Ethereum);
      methods.web3.evm.addTxHint('0xtx2', Chain.Polygon);
      methods.web3.safe.addMsgHint('0xmsg1', Chain.Arbitrum);
      methods.web3.safe.addTxHint('0xsafetx1', Chain.Base);

      onFlush!(builder);

      expect(builder.hints).toHaveLength(4);
      expect(builder.hints[0].type).toBe(HintType.TX_HASH);
      expect(builder.hints[1].type).toBe(HintType.TX_HASH);
      expect(builder.hints[2].type).toBe(HintType.SAFE_MSG);
      expect(builder.hints[3].type).toBe(HintType.SAFE_TX);
    });

    it('should clear pending data after flush', () => {
      const ctx = createMockCtx();
      const { methods, onFlush, hasPendingData } = Web3Plugin().setup(ctx);

      methods.web3.evm.addTxHint('0xtx', Chain.Ethereum);
      methods.web3.safe.addMsgHint('0xmsg', Chain.Ethereum);
      expect(hasPendingData!()).toBe(true);

      onFlush!(createMockBuilder());
      expect(hasPendingData!()).toBe(false);

      // Second flush should have nothing
      const builder2 = createMockBuilder();
      onFlush!(builder2);
      expect(builder2.hints).toHaveLength(0);
    });
  });

  describe('lifecycle: hasPendingData', () => {
    it('should return false when no data', () => {
      const { hasPendingData } = Web3Plugin().setup(createMockCtx());
      expect(hasPendingData!()).toBe(false);
    });

    it('should return true when tx hints pending', () => {
      const { methods, hasPendingData } = Web3Plugin().setup(createMockCtx());
      methods.web3.evm.addTxHint('0xtx', Chain.Ethereum);
      expect(hasPendingData!()).toBe(true);
    });

    it('should return true when safe msg hints pending', () => {
      const { methods, hasPendingData } = Web3Plugin().setup(createMockCtx());
      methods.web3.safe.addMsgHint('0xmsg', Chain.Ethereum);
      expect(hasPendingData!()).toBe(true);
    });

    it('should return true when safe tx hints pending', () => {
      const { methods, hasPendingData } = Web3Plugin().setup(createMockCtx());
      methods.web3.safe.addTxHint('0xsafetx', Chain.Ethereum);
      expect(hasPendingData!()).toBe(true);
    });
  });

  describe('lifecycle: onClose', () => {
    it('should clear all pending data', () => {
      const ctx = createMockCtx();
      const { methods, onClose, hasPendingData } = Web3Plugin().setup(ctx);

      methods.web3.evm.addTxHint('0xtx', Chain.Ethereum);
      methods.web3.safe.addMsgHint('0xmsg', Chain.Ethereum);
      methods.web3.safe.addTxHint('0xsafetx', Chain.Ethereum);
      expect(hasPendingData!()).toBe(true);

      onClose!();
      expect(hasPendingData!()).toBe(false);
    });

    it('should nullify provider (getProviderChain returns null after close)', async () => {
      const provider = createMockProvider('0x1');
      const { methods, onClose } = Web3Plugin({ provider }).setup(createMockCtx());
      await jest.advanceTimersByTimeAsync(0);

      expect(methods.web3.evm.getProviderChain()).toBe(Chain.Ethereum);

      onClose!();
      expect(methods.web3.evm.getProviderChain()).toBeNull();
    });
  });
});
