/** Decorative motion only: never removes content or changes live-data cadence. */
export function observeVisibleDecorationMotion(root: Document = document) {
  const selector = '[data-touchline-card-neon-trace="true"], [data-touchline-club-perimeter-trace="true"], [data-club-owner-portrait-neon-trace="true"], [data-touchline-pitch-surface], [data-touchline-decoration-motion]';
  type Decoration = HTMLElement | SVGElement;
  const nodes = new Map<Decoration, boolean>();
  let disposed = false;
  const paint = (node: Decoration, visible: boolean) => {
    // Control animation objects without changing React-owned server markup.
    // Inline style writes here can race streamed hydration and reset the page.
    for (const animation of node.getAnimations({ subtree: true })) {
      if (!('animationName' in animation) || !/touchlineClubEdgeTravel|touchlinePitchBoundaryTrace|touchlineLedMarquee|touchline-card-perimeter-trace|club-owner-portrait-perimeter-trace|club-hub-stadium-breathe|club-hub-border-sweep/.test(String(animation.animationName))) continue;
      if (visible && !root.hidden) animation.play();
      else animation.pause();
    }
  };
  const observer = new IntersectionObserver((entries) => {
    if (disposed) return;
    for (const entry of entries) {
      const node = entry.target as Decoration;
      if (!nodes.has(node)) continue;
      nodes.set(node, entry.isIntersecting);
      paint(node, entry.isIntersecting);
    }
  });
  const discover = (parent: ParentNode) => {
    const candidates = [...parent.querySelectorAll<Decoration>(selector)];
    if (parent instanceof Element && parent.matches(selector)) candidates.push(parent as Decoration);
    for (const node of candidates) {
      if (nodes.has(node)) continue;
      nodes.set(node, false);
      paint(node, false);
      observer.observe(node);
    }
  };
  const mutations = new MutationObserver((records) => {
    if (disposed) return;
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element) discover(node);
    }
    for (const node of nodes.keys()) {
      if (node.isConnected) continue;
      observer.unobserve(node);
      paint(node, false);
      nodes.delete(node);
    }
  });
  const visibility = () => { for (const [node, visible] of nodes) paint(node, visible); };
  discover(root);
  mutations.observe(root.documentElement, { childList: true, subtree: true });
  root.addEventListener('visibilitychange', visibility);
  return () => {
    disposed = true;
    observer.disconnect();
    mutations.disconnect();
    root.removeEventListener('visibilitychange', visibility);
    for (const node of nodes.keys()) paint(node, false);
    nodes.clear();
  };
}
