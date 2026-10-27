/** Local presentation only. This never authorizes collection reads or writes. */
export function clubCollectionPresentationEnabled(input: {
  nodeEnv?: string; enabled?: string; host: string | null; plan: string | null;
}): boolean {
  return input.nodeEnv === "development" && input.enabled === "true"
    && (input.host === "localhost:3319" || input.host === "127.0.0.1:3319")
    && (input.plan === "beta" || input.plan === "standard" || input.plan === "master" || input.plan === "vip");
}
