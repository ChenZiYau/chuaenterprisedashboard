// Minimal hook runner for exercising real handlers without a browser renderer.
function hookHost() {
  let slots = [], cursor = 0, effects = [], changed = false, tree;
  const differs = (before, next) => !before || !next || next.some((dep, i) => !Object.is(dep, before[i]));
  const react = {
    useState(seed) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof seed === 'function' ? seed() : seed;
      return [slots[i], (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; changed = true; }
      }];
    },
    useRef(value) { const i = cursor++; return slots[i] ?? (slots[i] = { current: value }); },
    useMemo(fn, deps) {
      const i = cursor++;
      if (differs(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (differs(slots[i]?.deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
    createContext: () => ({ Provider() {} }),
  };
  return {
    react,
    render(fn) {
      for (let i = 0; i < 12; i++) {
        cursor = 0; effects = []; changed = false;
        tree = fn();
        effects.forEach((effect) => effect());
        if (!changed) return tree;
      }
      throw new Error('Component did not settle');
    },
    reset() { slots = []; },
    find(predicate) { return find(tree, predicate); },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean) ?? null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
module.exports = { hookHost, find };
