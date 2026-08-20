import {
  fetch as undiciFetch,
  ProxyAgent,
  type Dispatcher,
  type RequestInfo,
  type RequestInit,
  type Response,
} from "undici";

import { QingGuoRotator, proxyFromEnv } from "./proxy.js";
import type { Environment, ProxyRotator, RotationContext } from "./proxy.js";

const DEFAULT_RETRY_METHODS = ["GET", "HEAD", "OPTIONS"];

export type FetchLike = (input: RequestInfo, init?: RequestInit) => Promise<Response>;
export type Sleeper = (delaySeconds: number) => void | Promise<void>;
export type DispatcherFactory = (proxy: string) => Dispatcher;

export interface RotatingClientOptions {
  proxy?: string;
  rotator?: ProxyRotator;
  maxAttempts?: number;
  retryMethods?: Iterable<string>;
  fetch?: FetchLike;
  sleeper?: Sleeper;
  dispatcherFactory?: DispatcherFactory;
}

export interface RotatingClientFromEnvOptions extends Omit<RotatingClientOptions, "proxy"> {
  env?: Environment;
  proxy?: string;
}

export interface RunOptions {
  rotateOn: (error: unknown) => boolean;
  maxAttempts?: number;
}

export class RotatingClient {
  readonly baseProxy?: string;
  currentProxy?: string;
  readonly maxAttempts: number;
  private readonly rotator?: ProxyRotator;
  private readonly retryMethods: ReadonlySet<string>;
  private readonly fetchImpl: FetchLike;
  private readonly sleeper: Sleeper;
  private readonly dispatcherFactory: DispatcherFactory;
  private readonly dispatchers = new Map<string, Dispatcher>();

  constructor(options: RotatingClientOptions = {}) {
    const maxAttempts = options.maxAttempts ?? 5;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new TypeError("maxAttempts must be a positive integer");
    }
    this.baseProxy = options.proxy;
    this.currentProxy = options.proxy;
    this.rotator = options.rotator ?? (options.proxy ? new QingGuoRotator() : undefined);
    this.maxAttempts = maxAttempts;
    this.retryMethods = new Set(
      [...(options.retryMethods ?? DEFAULT_RETRY_METHODS)].map((method) => method.toUpperCase()),
    );
    this.fetchImpl = options.fetch ?? undiciFetch;
    this.sleeper = options.sleeper ?? ((delay) => new Promise((resolve) => {
      setTimeout(resolve, delay * 1_000);
    }));
    this.dispatcherFactory = options.dispatcherFactory ?? ((proxy) => new ProxyAgent(proxy));
  }

  static fromEnv(options: RotatingClientFromEnvOptions = {}): RotatingClient {
    const { env = process.env, proxy: explicitProxy, ...clientOptions } = options;
    const proxy = explicitProxy ?? proxyFromEnv(env);
    const rotator = clientOptions.rotator ?? (
      proxy ? new QingGuoRotator({ channelPrefix: env.TUNNEL_CHANNEL_PREFIX ?? "channel" }) : undefined
    );
    return new RotatingClient({ ...clientOptions, proxy, rotator });
  }

  private dispatcherFor(proxy: string): Dispatcher {
    const cached = this.dispatchers.get(proxy);
    if (cached) return cached;
    const dispatcher = this.dispatcherFactory(proxy);
    this.dispatchers.set(proxy, dispatcher);
    return dispatcher;
  }

  private rotateProxy(currentProxy: string, context: RotationContext): string {
    if (!this.baseProxy || !this.rotator) return currentProxy;
    return this.rotator.rotate(this.baseProxy, currentProxy, context);
  }

  private static retryDelay(retryAfter: string | null, retryNumber: number): number {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return Math.max(0, seconds);
      const retryAt = Date.parse(retryAfter);
      if (!Number.isNaN(retryAt)) return Math.max(0, (retryAt - Date.now()) / 1_000);
    }
    return retryNumber * 2;
  }

  async request(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    const inputMethod = typeof input === "object" && "method" in input
      ? input.method
      : undefined;
    const method = (init.method ?? inputMethod ?? "GET").toUpperCase();
    const url = typeof input === "string"
      ? input
      : ("url" in input ? input.url : input.toString());
    let requestProxy = this.currentProxy;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const requestInit: RequestInit = { ...init };
      if (requestProxy) {
        requestInit.dispatcher = this.dispatcherFor(requestProxy);
      }
      const response = await this.fetchImpl(input, requestInit);
      if (response.status !== 429
        || !this.retryMethods.has(method)
        || requestProxy === undefined
        || this.rotator === undefined
        || attempt >= this.maxAttempts) {
        return response;
      }

      const delay = RotatingClient.retryDelay(response.headers.get("Retry-After"), attempt);
      try {
        await response.body?.cancel();
      } catch {
        // The response is being discarded regardless; cancellation is best effort.
      }
      requestProxy = this.rotateProxy(requestProxy, { attempt, method, url, statusCode: 429 });
      this.currentProxy = requestProxy;
      await this.sleeper(delay);
    }
    throw new Error("unreachable");
  }

  get(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    return this.request(input, { ...init, method: "GET" });
  }

  head(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    return this.request(input, { ...init, method: "HEAD" });
  }

  options(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    return this.request(input, { ...init, method: "OPTIONS" });
  }

  async run<T>(operation: () => T | Promise<T>, options: RunOptions): Promise<T> {
    const attempts = options.maxAttempts ?? this.maxAttempts;
    if (!Number.isInteger(attempts) || attempts < 1) {
      throw new TypeError("maxAttempts must be a positive integer");
    }
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!options.rotateOn(error)
          || attempt >= attempts
          || !this.baseProxy
          || !this.currentProxy
          || !this.rotator) {
          throw error;
        }
        this.currentProxy = this.rotateProxy(this.currentProxy, { attempt, error });
        await this.sleeper(attempt * 2);
      }
    }
    throw new Error("unreachable");
  }

  async close(): Promise<void> {
    const dispatchers = [...this.dispatchers.values()];
    this.dispatchers.clear();
    await Promise.all(dispatchers.map((dispatcher) => dispatcher.close()));
  }
}
