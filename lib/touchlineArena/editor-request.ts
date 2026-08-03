/**
 * Local editor write access is deliberately opt-in.
 *
 * Do not infer local access from `Host`, `x-forwarded-host`, request URL, or
 * other request metadata: reverse proxies and visitors can control those
 * values. A developer who needs the local editor must set the server-only
 * `TOUCHLINE_ALLOW_LOCAL_EDITOR=1` in their private development environment.
 */
type EditorRequestEnvironment = {
  nodeEnv?: string;
  vercel?: string;
  allowLocalEditor?: string;
};

export function isLocalTouchlineEditorEnabled(
  environment: EditorRequestEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    allowLocalEditor: process.env.TOUCHLINE_ALLOW_LOCAL_EDITOR,
  },
) {
  return environment.nodeEnv !== "production"
    && environment.vercel !== "1"
    && environment.allowLocalEditor === "1";
}
