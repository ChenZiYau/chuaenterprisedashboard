function mockDb(initial = {}, { fail = () => false, cap = Infinity } = {}) {
  const state = structuredClone(initial);
  const calls = [];
  let sequence = 0;
  const supabaseAdmin = {
    from(table) {
      const query = { table, action: 'select', filters: [], orders: [] };
      const builder = {
        select() { return builder; },
        insert(rows) { query.action = 'insert'; query.rows = Array.isArray(rows) ? rows : [rows]; return builder; },
        update(row) { query.action = 'update'; query.row = row; return builder; },
        delete() { query.action = 'delete'; return builder; },
        eq(key, value) { query.filters.push((row) => row[key] === value); return builder; },
        neq(key, value) { query.filters.push((row) => row[key] !== value); return builder; },
        in(key, values) { query.filters.push((row) => values.includes(row[key])); return builder; },
        ilike(key, value) { query.filters.push((row) => String(row[key]).toLowerCase() === value.toLowerCase()); return builder; },
        order(key, options = {}) { query.orders.push([key, options.ascending !== false]); return builder; },
        limit(count) { query.limit = count; return builder; },
        range(from, to) { query.range = [from, to]; return builder; },
        single() { query.single = true; return builder; },
        maybeSingle() { query.single = true; return builder; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push(query);
            if (fail(query)) return { data: null, error: new Error('Simulated database failure') };
            state[table] ??= [];
            const matches = (row) => query.filters.every((fn) => fn(row));
            let rows = state[table].filter(matches);
            if (query.action === 'insert') {
              rows = query.rows.map((row) => ({ id: `saved-${++sequence}`, ...row }));
              state[table].push(...rows);
            } else if (query.action === 'update') {
              rows.forEach((row) => Object.assign(row, query.row));
            } else if (query.action === 'delete') {
              state[table] = state[table].filter((row) => !matches(row));
            }
            rows.sort((a, b) => {
              for (const [key, asc] of query.orders) {
                const n = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
                if (n) return asc ? n : -n;
              }
              return 0;
            });
            if (query.range) rows = rows.slice(query.range[0], query.range[1] + 1);
            rows = rows.slice(0, Math.min(query.limit ?? Infinity, cap));
            return { data: structuredClone(query.single ? rows[0] ?? null : rows), error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { state, calls, supabaseAdmin, mocks: { '@/lib/supabaseServer': { supabaseAdmin } } };
}

module.exports = { mockDb };
