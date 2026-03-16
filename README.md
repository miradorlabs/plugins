# @miradorlabs/plugins

Shared plugin system for the Mirador SDKs (`@miradorlabs/web-sdk` and `@miradorlabs/nodejs-sdk`). Plugins extend traces with additional methods and contribute data during flush — without any proto dependencies.

## Architecture

```
plugins/                    # This package (proto-free)
├── src/
│   ├── plugin.ts           # Core interfaces: MiradorPlugin, TraceContext, FlushBuilder
│   ├── hints.ts            # HintType constants + HintDataMap type registry
│   ├── types.ts            # Shared types: ChainName, TxHashHint, Logger, etc.
│   ├── chains.ts           # chainIdToName() utility
│   ├── web3-plugin.ts      # Web3Plugin — tx hints, sendTransaction, provider mgmt
│   ├── safe-plugin.ts      # SafePlugin — Safe message + tx hints
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

Adds blockchain transaction tracing methods to traces.

```typescript
import { Client, Web3Plugin, SafePlugin } from '@miradorlabs/web-sdk';
// or: import { Client, Web3Plugin, SafePlugin } from '@miradorlabs/nodejs-sdk';

const client = new Client('your-api-key', {
  plugins: [Web3Plugin({ provider: window.ethereum }), SafePlugin()],
});

const trace = client.trace({ name: 'swap' });

// Methods added by Web3Plugin:
trace.addTxHint('0x123...', 'ethereum');               // Record a tx hash
trace.addTxHint('0x456...', 'polygon', { input: '0x...' }); // With calldata
trace.addTx({ hash: '0x...', chainId: 1 });            // From a tx object
trace.addTxInputData('0xabcdef...');                    // Raw calldata
const txHash = await trace.sendTransaction(txParams);   // Send + auto-track
trace.setProvider(newProvider);                          // Change provider
trace.getProviderChain();                               // Get detected chain
trace.resolveChain('ethereum');                          // Resolve chain name
```

### SafePlugin

Adds Gnosis Safe multisig tracking methods.

```typescript
// Methods added by SafePlugin:
trace.addSafeMsgHint('0xmsg...', 'ethereum', 'Approval message');
trace.addSafeTxHint('0xsafetx...', 'ethereum', 'Execution tx');
```

### Method Chaining

All void-returning plugin methods support chaining:

```typescript
trace
  .addTxHint('0x123...', 'ethereum')
  .addSafeMsgHint('0xabc...', 'ethereum')
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

### 2. Use Your Plugin

```typescript
const client = new Client('key', {
  plugins: [Web3Plugin(), SafePlugin(), MyPlugin()],
});

const trace = client.trace({ name: 'test' });
trace.trackAction('click', { button: 'submit' }); // Your method
trace.addTxHint('0x...', 'ethereum');              // Web3Plugin still works
trace.getActionCount();                            // Returns 1
```

### 3. Plugin Lifecycle

```
client.trace({ name: 'test' })
  │
  ├── plugin.setup(ctx) called for each plugin
  │     └── Returns { methods, onFlush, onClose, hasPendingData }
  │     └── methods are merged onto the Trace instance
  │
  ├── trace.trackAction(...)        ← Your plugin method
  │     └── Buffers data, calls ctx.scheduleFlush()
  │
  ├── [microtask] flush triggered
  │     ├── SDK builds TraceData (events, attributes, tags)
  │     ├── SDK creates FlushBuilder wrapping TraceData
  │     └── plugin.onFlush(builder) called for each plugin
  │           └── Plugin dumps buffered data via builder
  │
  └── trace.close()
        └── plugin.onClose() called for each plugin
```

### 4. TraceContext API

The `ctx` object provides these methods for plugins:

| Method | Description |
|--------|-------------|
| `ctx.addEvent(name, details?, options?)` | Record an event |
| `ctx.addAttribute(key, value)` | Set a trace attribute |
| `ctx.addAttributes(attrs)` | Set multiple attributes |
| `ctx.addTag(tag)` | Add a tag |
| `ctx.addTags(tags)` | Add multiple tags |
| `ctx.getTraceId()` | Get the trace ID |
| `ctx.isClosed()` | Check if trace is closed |
| `ctx.scheduleFlush()` | Trigger a batched flush |
| `ctx.logger` | Logger instance (`debug`, `warn`, `error`) |

### 5. FlushBuilder API

The `builder` object in `onFlush` provides:

| Method | Description |
|--------|-------------|
| `builder.addHint(type, data)` | Add a typed hint (see hint types below) |
| `builder.addEvent(event)` | Add an event to the flush payload |
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
    chain: ChainName;
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
npm run build   # Outputs to dist/ (ESM + CJS + type declarations)
```

Both SDKs depend on this package via `"@miradorlabs/plugins": "file:../plugins"` and inline it into their bundles via Rollup's `node-resolve` plugin. Consumers of the SDKs don't need to install this package separately.
