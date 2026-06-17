# @miradorlabs/plugins

Shared plugin system for the Mirador SDKs (`@miradorlabs/web-sdk` and `@miradorlabs/nodejs-sdk`). Plugins extend traces with additional methods and contribute data during flush — without any proto dependencies.

## Architecture

```
plugins/                    # This package (proto-free)
├── src/
│   ├── plugin.ts           # Core interfaces: MiradorPlugin, TraceContext, FlushBuilder
│   ├── hints.ts            # HintType constants + HintDataMap type registry
│   ├── types.ts            # Shared types: Chain, ChainInput, TxHashHint, Logger, etc.
│   ├── chains.ts           # toChain(), resolveChainInput() utilities
│   ├── web3-plugin.ts      # Web3Plugin — EVM/Solana/Safe/Relay/Canton hints, sendTransaction, provider mgmt
│   └── index.ts            # Public exports

web-sdk/src/ingest/
├── hint-serializers.ts     # Proto serializers (protobuf.js class API)
├── trace.ts                # createFlushBuilder() dispatches via HINT_SERIALIZERS
└── ...

nodejs-sdk/src/ingest/
├── hint-serializers.ts     # Proto serializers (ts-proto interface API)
├── trace.ts                # createFlushBuilder() dispatches via HINT_SERIALIZERS
└── ...
```

**Key design**: Plugins call `builder.addHint(type, data)` with plain JS objects. Each SDK's `hint-serializers.ts` maps hint types to proto-specific serialization. This keeps plugins proto-free while both SDKs serialize correctly.

## Using Existing Plugins

### Web3Plugin

Adds transaction tracing for EVM chains under `trace.web3.evm` and Solana under `trace.web3.solana`, Gnosis Safe multisig tracking under `trace.web3.safe`, Relay (relay.link) intent tracking under `trace.web3.relay`, and Canton (Daml Ledger API) tracking under `trace.web3.canton`.

```typescript
import { Client, Web3Plugin } from '@miradorlabs/web-sdk';
// or: import { Client, Web3Plugin } from '@miradorlabs/nodejs-sdk';

const client = new Client('your-api-key', {
  plugins: [Web3Plugin({ provider: window.ethereum })],
});

const trace = client.trace({ name: 'swap' });

// EVM methods (under web3.evm namespace):
trace.web3.evm.addTxHint('0x123...', 'ethereum');               // Record a tx hash
trace.web3.evm.addTxHint('0x456...', 'polygon', { input: '0x...' }); // With calldata
trace.web3.evm.addTx({ hash: '0x...', chainId: 1 });            // From a tx object
trace.web3.evm.addInputData('0xabcdef...');                      // Raw calldata
trace.web3.evm.resolveChain('ethereum');                         // Resolve chain name

// Provider management:
trace.web3.evm.setProvider(newProvider);                          // Switch provider
trace.web3.evm.getProviderChain();                               // Get detected chain

// Send a transaction (auto-captures tx hash + chain):
const txHash = await trace.web3.evm.sendTransaction(txParams);
// Or with an explicit provider:
const txHash2 = await trace.web3.evm.sendTransaction(txParams, otherProvider);

// Solana methods (under web3.solana namespace):
// Chain identity is implicit — emitted on the wire as chain_name = "solana".
trace.web3.solana.addTxHint('5xq7...signature');                 // Record a tx signature
trace.web3.solana.addTxHint('5xq7...signature', 'swap settled'); // With a note

// Safe methods (under web3.safe namespace):
trace.web3.safe.addMsgHint('0xmsg...', 'ethereum', 'Approval message');
trace.web3.safe.addTxHint('0xsafetx...', 'ethereum', 'Execution tx');

// Relay methods (under web3.relay namespace):
// Call once Relay has returned a requestId for the user's intent —
// before they deposit. The relayhint backend processor resolves the
// full quote server-side from the requestId and emits the lifecycle
// (deposit → solver-committed → fill, or refund / failed / not-found)
// as events on the trace. Optional second argument is a free-form
// note that rides on RelayHint.details.
trace.web3.relay.addQuoteHint('rly_request_123');
trace.web3.relay.addQuoteHint('rly_request_456', 'queued from swap modal');

// Canton methods (under web3.canton namespace):
// Tie a Canton (Daml Ledger API v2) ledger update to the trace by its
// updateId. party_id is optional — omit it when the participant only
// co-hosts the contract as an observer. Chain identity is implicit ("canton").
trace.web3.canton.addTxHint('1220...updateId');
trace.web3.canton.addTxHint('1220...updateId', 'Alice::1220...');         // scope to a party
trace.web3.canton.addTxHint('1220...updateId', 'Alice::1220...', 'mint'); // + a note
```

> The processor learns chain IDs and tx hashes from Relay's status feed (`GetRelayIntentStatus`) — the SDK doesn't need to ship the quote payload. Likewise, the canton-hint processor resolves the full transaction server-side from the `updateId` and emits its events onto the trace.

### Method Chaining

All void-returning plugin methods support chaining. Chained calls return the root Trace, so you can mix namespaces and core methods freely:

```typescript
trace
  .web3.evm.addTxHint('0x123...', 'ethereum')
  .web3.safe.addMsgHint('0xabc...', 'ethereum')
  .web3.relay.addQuoteHint('rly_request_123')
  .addAttribute('user', '0xdef...')
  .addTag('swap');
```

## Creating a New Plugin

### 1. Define Your Plugin

A plugin implements `MiradorPlugin<TMethods>`:

```typescript
import type {
  MiradorPlugin,
  PluginSetupResult,
  TraceContext,
  FlushBuilder,
} from '@miradorlabs/plugins';

// Define the methods your plugin adds to Trace
export interface MyMethods {
  trackAction(name: string, data: Record<string, unknown>): void;
  getActionCount(): number;
}

export function MyPlugin(): MiradorPlugin<MyMethods> {
  return {
    name: 'my-plugin', // Unique name

    setup(ctx: TraceContext): PluginSetupResult<MyMethods> {
      // Plugin-local state (closure-scoped, per-trace)
      const pendingActions: Array<{ name: string; data: Record<string, unknown>; timestamp: Date }> = [];

      // Method implementations
      function trackAction(name: string, data: Record<string, unknown>): void {
        if (ctx.isClosed()) {
          ctx.logger.warn('[MyPlugin] Trace is closed, ignoring trackAction');
          return;
        }
        pendingActions.push({ name, data, timestamp: new Date() });
        ctx.addEvent(`action:${name}`, data);   // Use core trace primitives
        ctx.addAttribute('last_action', name);
        ctx.scheduleFlush();                     // Trigger batched flush
      }

      function getActionCount(): number {
        return pendingActions.length;
      }

      // Lifecycle hooks
      function onFlush(builder: FlushBuilder): void {
        // Contribute data to the flush payload
        for (const action of pendingActions) {
          builder.addEvent({
            name: `plugin:${action.name}`,
            details: JSON.stringify(action.data),
            timestamp: action.timestamp,
          });
        }
        pendingActions.length = 0; // Clear after flush
      }

      function hasPendingData(): boolean {
        return pendingActions.length > 0;
      }

      function onClose(): void {
        pendingActions.length = 0; // Cleanup
      }

      return {
        methods: { trackAction, getActionCount },
        noopMethods: { getActionCount: () => 0 }, // For sampled-out traces
        onFlush,
        onClose,
        hasPendingData,
      };
    },
  };
}
```

### 2. Custom Namespaces

Plugins can nest their methods under namespaces by using nested objects in the `TMethods` type. The type system and runtime both handle arbitrary nesting automatically.

```typescript
// Define methods under a namespace
export interface AnalyticsMethods {
  analytics: {
    track(event: string, data?: Record<string, unknown>): void;
    identify(userId: string): void;
    getSessionId(): string;
  };
}

export function AnalyticsPlugin(): MiradorPlugin<AnalyticsMethods> {
  return {
    name: 'analytics',
    setup(ctx: TraceContext): PluginSetupResult<AnalyticsMethods> {
      const sessionId = crypto.randomUUID();

      return {
        methods: {
          analytics: {
            track(event, data) {
              ctx.addEvent(`analytics:${event}`, data);
              ctx.scheduleFlush();
            },
            identify(userId) {
              ctx.addAttribute('analytics.userId', userId);
            },
            getSessionId() {
              return sessionId;
            },
          },
        },
        noopMethods: {
          analytics: { getSessionId: () => '' },
        },
      };
    },
  };
}
```

Usage:

```typescript
const client = new Client('key', {
  plugins: [Web3Plugin(), AnalyticsPlugin()],
});

const trace = client.trace({ name: 'swap' });

// Namespaced access
trace.analytics.track('page_view', { page: '/swap' });
trace.analytics.identify('user123');
trace.analytics.getSessionId(); // Returns the session ID

// Chaining across namespaces — void methods return the root Trace
trace.analytics.track('click')
     .web3.evm.addTxHint('0x...', 'ethereum')
     .analytics.identify('user123')
     .addAttribute('key', 'value');
```

Multiple plugins can share a top-level namespace. TypeScript's intersection merges them automatically:

```typescript
// Plugin A: { myNs: { foo(): void } }
// Plugin B: { myNs: { bar(): void } }
// Result:   trace.myNs.foo() and trace.myNs.bar() both work
```

You can also nest arbitrarily deep: `{ a: { b: { c: { doThing(): void } } } }` works.

### 3. Use Your Plugin

```typescript
const client = new Client('key', {
  plugins: [Web3Plugin(), MyPlugin()],
});

const trace = client.trace({ name: 'test' });
trace.trackAction('click', { button: 'submit' }); // Your method
trace.web3.evm.addTxHint('0x...', 'ethereum');     // Web3Plugin still works
trace.getActionCount();                            // Returns 1
```

### 4. Plugin Lifecycle

```
client.trace({ name: 'test' })
  │
  ├── plugin.setup(ctx) called for each plugin
  │     └── Returns { methods, onFlush, onClose, hasPendingData }
  │     └── methods are recursively merged onto the Trace instance (supports nested namespaces)
  │
  ├── trace.trackAction(...)        ← Your plugin method
  │     └── Buffers data, calls ctx.scheduleFlush()
  │
  ├── [microtask] flush triggered
  │     ├── SDK builds FlushTraceData (events, attributes, tags)
  │     ├── SDK creates FlushBuilder wrapping FlushTraceData
  │     └── plugin.onFlush(builder) called for each plugin
  │           └── Plugin dumps buffered data via builder
  │
  └── trace.close()
        └── plugin.onClose() called for each plugin
```

### 5. TraceContext API

The `ctx` object provides these methods for plugins:

| Method | Description |
|--------|-------------|
| `ctx.addEvent(name, details?, options?)` | Record an event (options: `captureStackTrace`, `severity`) |
| `ctx.addAttribute(key, value)` | Set a trace attribute |
| `ctx.addAttributes(attrs)` | Set multiple attributes |
| `ctx.addTag(tag)` | Add a tag |
| `ctx.addTags(tags)` | Add multiple tags |
| `ctx.getTraceId()` | Get the trace ID |
| `ctx.isClosed()` | Check if trace is closed |
| `ctx.scheduleFlush()` | Trigger a batched flush |
| `ctx.logger` | Logger instance (`debug`, `warn`, `error`) |

### 6. FlushBuilder API

The `builder` object in `onFlush` provides:

| Method | Description |
|--------|-------------|
| `builder.addHint(type, data)` | Add a typed hint (see hint types below) |
| `builder.addEvent(event)` | Add an event (`{ name, details?, timestamp, severity? }`) |
| `builder.addAttribute(key, value)` | Add an attribute |
| `builder.addTag(tag)` | Add a tag |

## Adding a Custom Hint Type

If your plugin needs to contribute structured data beyond events/attributes (e.g., a new proto field on the backend), you need to register a hint type.

### 1. Add the hint type constant

In `plugins/src/hints.ts`:

```typescript
export const HintType = {
  TX_HASH: 'tx_hash',
  SAFE_MSG: 'safe_msg',
  SAFE_TX: 'safe_tx',
  MY_HINT: 'my_hint',  // Add your type
} as const;
```

### 2. Add the data shape to HintDataMap

In `plugins/src/hints.ts`:

```typescript
export interface HintDataMap {
  // ... existing entries
  [HintType.MY_HINT]: {
    field1: string;
    field2: number;
    chain: Chain;
    timestamp: Date;
  };
}
```

### 3. Add serializers in each SDK

In `web-sdk/src/ingest/hint-serializers.ts` and `nodejs-sdk/src/ingest/hint-serializers.ts`, add an entry to `HINT_SERIALIZERS` that maps your hint type to proto serialization.

### 4. Use in your plugin's onFlush

```typescript
function onFlush(builder: FlushBuilder): void {
  for (const item of pendingItems) {
    builder.addHint(HintType.MY_HINT, item); // Type-safe!
  }
  pendingItems.length = 0;
}
```

## Best Practices

- **Check `ctx.isClosed()`** before buffering data in plugin methods
- **Call `ctx.scheduleFlush()`** after adding data — this batches flushes via microtask
- **Clear buffers in `onFlush`** — set `.length = 0` after iterating
- **Clear buffers in `onClose`** — prevent memory leaks
- **Implement `hasPendingData()`** — the SDK uses this to decide whether to flush
- **Provide `noopMethods`** for methods that return values — these are used for sampled-out traces
- **Use unique plugin names** — duplicate names will log a warning

## Building

```bash
pnpm build   # Outputs to dist/ (ESM + CJS + type declarations)
```

Both SDKs depend on this package via `"@miradorlabs/plugins": "file:../plugins"` and inline it into their bundles via Rollup's `node-resolve` plugin. Consumers of the SDKs don't need to install this package separately.
