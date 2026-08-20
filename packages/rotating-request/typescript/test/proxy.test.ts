import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ProxyConfigError,
  ProxyRotationError,
  QingGuoRotator,
  proxyFromEnv,
} from "../src/index.js";

interface ContractCase {
  name: string;
  baseProxy: string;
  channelPrefix: string;
  tag: string;
  expected: string;
}

const contract = JSON.parse(
  readFileSync(new URL("../../contract/qingguo-cases.json", import.meta.url), "utf8"),
) as ContractCase[];

describe("QingGuoRotator", () => {
  for (const testCase of contract) {
    it(`follows shared contract: ${testCase.name}`, () => {
      const rotator = new QingGuoRotator({
        channelPrefix: testCase.channelPrefix,
        tagFactory: () => testCase.tag,
      });

      const result = rotator.rotate(testCase.baseProxy, testCase.baseProxy, { attempt: 1 });

      assert.equal(result, testCase.expected);
    });
  }

  it("rewrites the immutable base proxy so retry tags do not stack", () => {
    const rotator = new QingGuoRotator({ tagFactory: ({ attempt }) => `retry-${attempt}` });
    const base = "http://alice:secret:channel-default:60@proxy.example:1234";
    const first = rotator.rotate(base, base, { attempt: 1 });

    const second = rotator.rotate(base, first, { attempt: 2 });

    assert.equal(second, "http://alice:secret:channel-retry-2-default:60@proxy.example:1234");
  });

  it("rejects a proxy without the configured channel marker", () => {
    const rotator = new QingGuoRotator({ tagFactory: () => "retry-1" });

    assert.throws(
      () => rotator.rotate(
        "http://alice:secret@proxy.example:1234",
        "http://alice:secret@proxy.example:1234",
        { attempt: 1 },
      ),
      ProxyRotationError,
    );
  });
});

describe("proxyFromEnv", () => {
  it("returns undefined when proxy use is disabled", () => {
    assert.equal(proxyFromEnv({ USE_PROXY: "false" }), undefined);
  });

  it("builds tagged QingGuo proxy configuration", () => {
    assert.equal(proxyFromEnv({
      USE_PROXY: "true",
      TUNNEL_HOST: "proxy.example",
      TUNNEL_PORT: "1234",
      TUNNEL_USER: "alice",
      TUNNEL_PASS: "secret",
      TUNNEL_PROXY_FORMAT: "tagged",
      TUNNEL_CHANNEL_PREFIX: "session",
      TUNNEL_TTL: "90",
    }), "http://alice:secret:session-default:90@proxy.example:1234");
  });

  it("builds plain proxy configuration", () => {
    assert.equal(proxyFromEnv({
      USE_PROXY: "true",
      TUNNEL_HOST: "proxy.example",
      TUNNEL_PORT: "1234",
      TUNNEL_USER: "alice",
      TUNNEL_PASS: "secret",
    }), "http://alice:secret@proxy.example:1234");
  });

  it("rejects incomplete enabled configuration", () => {
    assert.throws(
      () => proxyFromEnv({ USE_PROXY: "true", TUNNEL_HOST: "proxy.example" }),
      ProxyConfigError,
    );
  });
});
