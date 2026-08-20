import { randomBytes } from "node:crypto";

import { ProxyConfigError, ProxyRotationError } from "./errors.js";

export interface RotationContext {
  attempt: number;
  method?: string;
  url?: string;
  statusCode?: number;
  error?: unknown;
}

export interface ProxyRotator {
  rotate(baseProxy: string, currentProxy: string, context: RotationContext): string;
}

export interface QingGuoRotatorOptions {
  channelPrefix?: string;
  tagFactory?: (context: RotationContext) => string;
}

export class QingGuoRotator implements ProxyRotator {
  readonly channelPrefix: string;
  private readonly tagFactory: (context: RotationContext) => string;

  constructor(options: QingGuoRotatorOptions = {}) {
    this.channelPrefix = options.channelPrefix ?? "channel";
    this.tagFactory = options.tagFactory ?? ((context) => (
      `rr-${context.attempt}-${randomBytes(4).toString("hex")}`
    ));
  }

  rotate(baseProxy: string, _currentProxy: string, context: RotationContext): string {
    const marker = `:${this.channelPrefix}-`;
    const separatorIndex = baseProxy.lastIndexOf("@");
    const userInfo = separatorIndex >= 0 ? baseProxy.slice(0, separatorIndex) : "";
    if (!userInfo.includes(marker)) {
      throw new ProxyRotationError(
        `proxy URL does not contain QingGuo marker ${this.channelPrefix}-`,
      );
    }
    const tag = this.tagFactory(context);
    if (!tag || tag.includes(":") || tag.includes("@")) {
      throw new ProxyRotationError("rotation tag must be non-empty and cannot contain ':' or '@'");
    }
    const rotatedUserInfo = userInfo.replace(marker, `${marker}${tag}-`);
    return `${rotatedUserInfo}${baseProxy.slice(separatorIndex)}`;
  }
}

export type Environment = Readonly<Record<string, string | undefined>>;

export function proxyFromEnv(env: Environment = process.env): string | undefined {
  if ((env.USE_PROXY ?? "false").toLowerCase() !== "true") {
    return undefined;
  }

  const required = ["TUNNEL_HOST", "TUNNEL_PORT", "TUNNEL_USER", "TUNNEL_PASS"] as const;
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new ProxyConfigError(
      `proxy is enabled but required variables are missing: ${missing.join(", ")}`,
    );
  }

  const host = env.TUNNEL_HOST as string;
  const port = env.TUNNEL_PORT as string;
  const user = env.TUNNEL_USER as string;
  const password = env.TUNNEL_PASS as string;
  if ((env.TUNNEL_PROXY_FORMAT ?? "plain").toLowerCase() === "tagged") {
    const prefix = env.TUNNEL_CHANNEL_PREFIX ?? "channel";
    const ttl = env.TUNNEL_TTL ?? "60";
    return `http://${user}:${password}:${prefix}-default:${ttl}@${host}:${port}`;
  }
  return `http://${user}:${password}@${host}:${port}`;
}
