import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Request, type Dispatcher } from "undici";

import { QingGuoRotator, RotatingClient } from "../src/index.js";


const BASE_PROXY = "http://alice:secret:channel-default:60@proxy.example:1234";

function fakeDispatcher(proxy: string, closed: string[]): Dispatcher {
  return {
    proxy,
    async close() {
      closed.push(proxy);
    },
  } as unknown as Dispatcher;
}

function makeClient(statuses: number[], options: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; proxy?: string }> = [];
  const sleeps: number[] = [];
  const closed: string[] = [];
  const queue = [...statuses];
  const client = new RotatingClient({
    proxy: BASE_PROXY,
    rotator: new QingGuoRotator({ tagFactory: ({ attempt }) => `retry-${attempt}` }),
    fetch: async (_input, init) => {
      calls.push({
        method: init?.method ?? "GET",
        proxy: (init?.dispatcher as unknown as { proxy?: string } | undefined)?.proxy,
      });
      return new Response("", { status: queue.shift() });
    },
    dispatcherFactory: (proxy) => fakeDispatcher(proxy, closed),
    sleeper: async (delay) => { sleeps.push(delay); },
    ...options,
  });
  return { client, calls, sleeps, closed };
}

describe("RotatingClient HTTP retries", () => {
  it("rotates proxy and retries GET after 429", async () => {
    const { client, calls, sleeps } = makeClient([429, 200]);

    const response = await client.get("https://example.com/data");

    assert.equal(response.status, 200);
    assert.deepEqual(sleeps, [2]);
    assert.deepEqual(calls.map(({ proxy }) => proxy), [
      BASE_PROXY,
      "http://alice:secret:channel-retry-1-default:60@proxy.example:1234",
    ]);
  });

  it("does not replay POST after 429", async () => {
    const { client, calls, sleeps } = makeClient([429, 200]);

    const response = await client.request("https://example.com/data", {
      method: "POST",
      body: JSON.stringify({ value: 1 }),
    });

    assert.equal(response.status, 429);
    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
  });

  it("does not replay a POST supplied as a Request object", async () => {
    const { client, calls, sleeps } = makeClient([429, 200]);
    const request = new Request("https://example.com/data", {
      method: "POST",
      body: JSON.stringify({ value: 1 }),
    });

    const response = await client.request(request);

    assert.equal(response.status, 429);
    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
  });

  it("uses Retry-After before the fallback delay", async () => {
    const sleeps: number[] = [];
    const client = new RotatingClient({
      proxy: BASE_PROXY,
      rotator: new QingGuoRotator({ tagFactory: () => "retry-1" }),
      fetch: async () => {
        const call = sleeps.length;
        return call === 0
          ? new Response("", { status: 429, headers: { "Retry-After": "7" } })
          : new Response("", { status: 200 });
      },
      dispatcherFactory: (proxy) => fakeDispatcher(proxy, []),
      sleeper: async (delay) => { sleeps.push(delay); },
    });

    await client.get("https://example.com/data");

    assert.deepEqual(sleeps, [7]);
  });

  it("returns the final 429 after exhausting attempts", async () => {
    const { client, calls, sleeps } = makeClient([429, 429, 429], { maxAttempts: 3 });

    const response = await client.get("https://example.com/data");

    assert.equal(response.status, 429);
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [2, 4]);
  });

  it("passes through 429 when no proxy is configured", async () => {
    let calls = 0;
    const client = new RotatingClient({
      fetch: async () => {
        calls += 1;
        return new Response("", { status: 429 });
      },
      sleeper: async () => undefined,
    });

    const response = await client.get("https://example.com/data");

    assert.equal(response.status, 429);
    assert.equal(calls, 1);
  });

  it("closes every cached proxy dispatcher", async () => {
    const { client, closed } = makeClient([429, 200]);
    await client.get("https://example.com/data");

    await client.close();

    assert.deepEqual(closed, [
      BASE_PROXY,
      "http://alice:secret:channel-retry-1-default:60@proxy.example:1234",
    ]);
  });

  it("keeps rotated proxies isolated between concurrent requests", async () => {
    const calls = new Map<string, string[]>();
    let sleeping = 0;
    let releaseSleepers!: () => void;
    const bothSleeping = new Promise<void>((resolve) => { releaseSleepers = resolve; });
    const client = new RotatingClient({
      proxy: BASE_PROXY,
      rotator: {
        rotate(baseProxy, _currentProxy, context) {
          const requestName = context.url?.endsWith("/a") ? "a" : "b";
          return baseProxy.replace("channel-", `channel-${requestName}-`);
        },
      },
      fetch: async (input, init) => {
        const url = input.toString();
        const proxy = (init?.dispatcher as unknown as { proxy: string }).proxy;
        const requestCalls = calls.get(url) ?? [];
        requestCalls.push(proxy);
        calls.set(url, requestCalls);
        return new Response("", { status: requestCalls.length === 1 ? 429 : 200 });
      },
      dispatcherFactory: (proxy) => fakeDispatcher(proxy, []),
      sleeper: async () => {
        sleeping += 1;
        if (sleeping === 2) releaseSleepers();
        await bothSleeping;
      },
    });

    await Promise.all([
      client.get("https://example.com/a"),
      client.get("https://example.com/b"),
    ]);

    assert.deepEqual(calls.get("https://example.com/a"), [
      BASE_PROXY,
      "http://alice:secret:channel-a-default:60@proxy.example:1234",
    ]);
    assert.deepEqual(calls.get("https://example.com/b"), [
      BASE_PROXY,
      "http://alice:secret:channel-b-default:60@proxy.example:1234",
    ]);
  });

  it("creates a configured client from environment variables", () => {
    const client = RotatingClient.fromEnv({
      env: {
        USE_PROXY: "true",
        TUNNEL_HOST: "proxy.example",
        TUNNEL_PORT: "1234",
        TUNNEL_USER: "alice",
        TUNNEL_PASS: "secret",
        TUNNEL_PROXY_FORMAT: "tagged",
      },
      fetch: async () => new Response("", { status: 200 }),
    });

    assert.equal(client.currentProxy, BASE_PROXY);
  });
});

describe("RotatingClient.run", () => {
  it("rotates after a selected operation error", async () => {
    const { client, sleeps } = makeClient([]);
    const seenProxies: Array<string | undefined> = [];

    const result = await client.run(async () => {
      seenProxies.push(client.currentProxy);
      if (seenProxies.length === 1) throw new Error("RequestBlocked");
      return "transcript";
    }, { rotateOn: (error) => String(error).includes("RequestBlocked") });

    assert.equal(result, "transcript");
    assert.deepEqual(sleeps, [2]);
    assert.deepEqual(seenProxies, [
      BASE_PROXY,
      "http://alice:secret:channel-retry-1-default:60@proxy.example:1234",
    ]);
  });

  it("does not catch unselected operation errors", async () => {
    const { client } = makeClient([]);

    await assert.rejects(
      client.run(async () => { throw new Error("programming bug"); }, {
        rotateOn: (error) => String(error).includes("RequestBlocked"),
      }),
      /programming bug/,
    );
  });

  it("reraises a selected error after exhausting operation attempts", async () => {
    const { client, sleeps } = makeClient([]);

    await assert.rejects(
      client.run(async () => { throw new Error("RequestBlocked"); }, {
        rotateOn: () => true,
        maxAttempts: 3,
      }),
      /RequestBlocked/,
    );
    assert.deepEqual(sleeps, [2, 4]);
  });

  it("reraises without retrying when no proxy is configured", async () => {
    let calls = 0;
    const client = new RotatingClient({ sleeper: async () => undefined });

    await assert.rejects(
      client.run(async () => {
        calls += 1;
        throw new Error("RequestBlocked");
      }, { rotateOn: () => true }),
      /RequestBlocked/,
    );
    assert.equal(calls, 1);
  });
});
