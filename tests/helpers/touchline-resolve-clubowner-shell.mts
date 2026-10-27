import React from "react";

/** Resolve only the route's deferred Server Component for existing prop-contract
 * tests. Never invoke client leaves, authenticate, or start a browser. */
export async function resolveClubOwnerShell(node: React.ReactNode): Promise<React.ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveClubOwnerShell));
  if (!React.isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function" && node.type.name === "ClubOwnerDeferredContent") {
    return resolveClubOwnerShell(await (node.type as (props: unknown) => Promise<React.ReactNode>)(node.props));
  }
  if (node.type === React.Suspense || (node.type as unknown) === "leadership-boundary") {
    return resolveClubOwnerShell(node.props.children as React.ReactNode);
  }
  if (!("children" in node.props)) return node;
  return React.cloneElement(node, {}, await resolveClubOwnerShell(node.props.children as React.ReactNode));
}
