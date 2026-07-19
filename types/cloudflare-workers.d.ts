interface D1Database {
  batch<T = unknown>(statements: unknown[]): Promise<T[]>;
  dump(): Promise<ArrayBuffer>;
  exec(query: string): Promise<unknown>;
  prepare(query: string): unknown;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
