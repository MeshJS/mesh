import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";

/**
 * Thin wrappers over Hono and `@hono/node-server`, so x402 servers (facilitator, resource server,
 * dashboards) need no direct Hono dependency. Node-only: import from `@meshsdk/x402/http`.
 */

/** The HTTP app type returned by `createFacilitatorApp` and `createMeshHttpApp`. */
export type MeshHttpApp = Hono;

/** Handler context passed to routes on a {@link MeshHttpApp}. */
export type MeshHttpContext = Context;

export type MeshHttpServeOptions = {
  port?: number;
  hostname?: string;
};

export type MeshHttpServer = ReturnType<typeof serve>;

/** Creates an empty HTTP app. Add routes with `app.get/post/use/route`. */
export const createMeshHttpApp = (): MeshHttpApp => new Hono();

/** Starts `app` on Node. `onListen` receives the bound address. Returns the underlying server. */
export const serveMeshHttp = (
  app: MeshHttpApp,
  options: MeshHttpServeOptions = {},
  onListen?: (info: { address: string; port: number }) => void,
): MeshHttpServer =>
  serve(
    { fetch: app.fetch, port: options.port, hostname: options.hostname },
    onListen,
  );

/** Middleware serving files from `root` (a directory relative to the working directory). */
export const meshServeStatic = (root: string) => serveStatic({ root });

/** Opens a server-sent-events response; `handler` writes events with `stream.writeSSE`. */
export const meshStreamSSE = (
  c: MeshHttpContext,
  handler: Parameters<typeof streamSSE>[1],
): Response => streamSSE(c, handler);
