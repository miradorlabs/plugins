/**
 * Plugin system types for the Mirador SDK.
 * Plugins extend Trace with additional methods via flat merge.
 */
import type { Logger, AddEventOptions, Severity } from './types';
import type { HintDataMap, HintTypeName } from './hints';

/**
 * Context provided to plugins during setup.
 * Exposes a controlled subset of Trace functionality.
 */
export interface TraceContext {
  addEvent(name: string, details?: string | object, options?: AddEventOptions): void;
  addAttribute(key: string, value: string | number | boolean | object): void;
  addAttributes(attrs: Record<string, string | number | boolean | object>): void;
  addTag(tag: string): void;
  addTags(tags: string[]): void;
  getTraceId(): string;
  isClosed(): boolean;
  scheduleFlush(): void;
  logger: Logger;
}

/**
 * Abstract builder for contributing data during flush.
 * Decouples plugins from SDK-specific proto serialization.
 */
export interface FlushBuilder {
  /** Add a hint of the given type. Type-safe for known HintType constants. */
  addHint<T extends HintTypeName>(type: T, data: HintDataMap[T]): void;
  /** Add a hint with a custom/unknown type (extensibility fallback). */
  addHint(type: string, data: Record<string, unknown>): void;
  addEvent(event: {
    name: string;
    details?: string;
    timestamp: Date;
    severity?: Severity;
  }): void;
  addAttribute(key: string, value: string): void;
  addTag(tag: string): void;
}

/** Recursive partial — allows partially specifying nested namespace objects. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/**
 * The result of plugin setup — methods to merge onto Trace,
 * plus optional lifecycle hooks.
 */
export interface PluginSetupResult<TMethods> {
  /** Methods to merge onto the Trace instance */
  methods: TMethods;
  /** No-op versions of methods for NoopTrace (sampled-out traces).
   *  If not provided, methods default to returning `this` for chaining. */
  noopMethods?: DeepPartial<TMethods>;
  /** Called during flush to contribute data to the TraceData payload */
  onFlush?(builder: FlushBuilder): void;
  /** Called when the trace is being closed */
  onClose?(): void;
  /** Return true if this plugin has unflushed data */
  hasPendingData?(): boolean;
}

/**
 * A Mirador plugin definition.
 * @template TMethods The methods this plugin adds to Trace
 *
 * **Important:** `setup()` is called for every trace, including sampled-out
 * traces (NoopTrace). Plugins **must** check `ctx.isClosed()` before starting
 * timers, intervals, or listeners to avoid resource leaks on sampled-out traces.
 */
export interface MiradorPlugin<TMethods = Record<string, never>> {
  /** Unique plugin name (used for error messages and deduplication) */
  name: string;
  /**
   * Called once per trace creation. Returns methods and lifecycle hooks.
   * Check `ctx.isClosed()` before starting async work — sampled-out traces
   * pass a closed context.
   */
  setup(ctx: TraceContext): PluginSetupResult<TMethods>;
}

// --- Type utilities for generic inference ---

/** Extract the methods type from a plugin */
export type PluginMethods<P> = P extends MiradorPlugin<infer M> ? M : never;

/** Helper: Convert union to intersection */
type UnionToIntersection<U> =
  (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/**
 * Transform plugin methods so void-returning methods return the full chain type.
 * Recursively handles nested namespace objects.
 *
 * @template TRoot  The full merged methods (used as chain return after void calls)
 * @template TCurrent  The current nesting level being transformed
 * @template TBase  Base type (e.g. Trace) merged into chain return
 */
type WithChaining<TRoot, TCurrent, TBase> = {
  [K in keyof TCurrent]:
    TCurrent[K] extends (...args: infer A) => void
      ? (...args: A) => TBase & WithChaining<TRoot, TRoot, TBase>  // void fn → return root
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : TCurrent[K] extends (...args: any[]) => any
        ? TCurrent[K]                                               // non-void fn → keep as-is
        : TCurrent[K] extends object
          ? WithChaining<TRoot, TCurrent[K], TBase>                 // namespace → recurse
          : TCurrent[K];
};

/**
 * Merge methods from an array of plugins into a single intersection type.
 * Supports nested namespace objects (e.g. `{ web3: { evm: { addTxHint() } } }`).
 * TypeScript's intersection naturally deep-merges shared namespaces.
 *
 * @template P Array of plugin types
 * @template TBase Base type (e.g. Trace) used as return type for void-returning methods to enable chaining
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MergedPluginMethods<P extends readonly MiradorPlugin<any>[], TBase = unknown> =
  WithChaining<
    UnionToIntersection<PluginMethods<P[number]>>,
    UnionToIntersection<PluginMethods<P[number]>>,
    TBase
  >;
