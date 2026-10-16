// Build-time JSX analysis (dev only). For each component it finds the host elements in its JSX and
// records which props/state paths feed each attribute and which prop functions or state setters
// each event handler calls. It tags every host element with `data-cc="Component#n"` so the runtime
// can match DOM nodes back to this analysis, and appends a registration of the results.
// The app's source files are never changed on disk.
import { parse } from '@babel/parser';
import { SOURCE_GLOBAL, type StaticComponent, type StaticElement } from './source.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

const isNode = (v: unknown): v is Node => !!v && typeof v === 'object' && typeof (v as Node).type === 'string';

function children(n: Node): Node[] {
  const out: Node[] = [];
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra' || k === 'leadingComments' || k === 'trailingComments') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => isNode(c) && out.push(c));
    else if (isNode(v)) out.push(v);
  }
  return out;
}

function walk(n: Node, visit: (n: Node) => boolean | void) {
  if (visit(n) === false) return;
  for (const c of children(n)) walk(c, visit);
}

const isFn = (n: Node) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(n.type);
const capital = (s: string) => /^[A-Z]/.test(s);

/** Top-level component functions: `function Foo()`, `const Foo = () => …`, exported or not. */
function components(program: Node): { name: string; fn: Node }[] {
  const out: { name: string; fn: Node }[] = [];
  for (let stmt of program.body) {
    if ((stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') && stmt.declaration) stmt = stmt.declaration;
    if (stmt.type === 'FunctionDeclaration' && stmt.id && capital(stmt.id.name)) out.push({ name: stmt.id.name, fn: stmt });
    if (stmt.type === 'VariableDeclaration')
      for (const d of stmt.declarations) if (d.id?.type === 'Identifier' && capital(d.id.name) && isFn(d.init)) out.push({ name: d.id.name, fn: d.init });
  }
  return out;
}

function analyseComponent(name: string, fn: Node, inserts: { at: number; text: string }[]): StaticComponent {
  // props: a destructured first parameter, or a `props` identifier
  const props = new Set<string>();
  let propsIdent: string | null = null;
  const p0 = fn.params[0];
  if (p0?.type === 'ObjectPattern') for (const prop of p0.properties) if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') props.add(prop.key.name);
  if (p0?.type === 'Identifier') propsIdent = p0.name;

  // state: const [x, setX] = useState(...)
  const state: { name: string; setter: string }[] = [];
  const localFns = new Map<string, Node>();
  walk(fn.body, (n) => {
    if (n !== fn.body && isFn(n) && n.type === 'FunctionDeclaration') {
      if (n.id) localFns.set(n.id.name, n);
      return false;
    }
    if (n.type === 'VariableDeclarator') {
      const callee = n.init?.type === 'CallExpression' ? n.init.callee : null;
      const hook = callee?.type === 'Identifier' ? callee.name : callee?.type === 'MemberExpression' ? callee.property?.name : null;
      if (n.id.type === 'ArrayPattern' && /^use(State|Reducer)$/.test(hook ?? '')) {
        const [a, b] = n.id.elements;
        if (a?.type === 'Identifier') state.push({ name: a.name, setter: b?.type === 'Identifier' ? b.name : '' });
      }
      if (n.id.type === 'Identifier' && isFn(n.init)) localFns.set(n.id.name, n.init);
    }
  });
  const stateNames = new Set(state.map((s) => s.name));
  const setters = new Set(state.map((s) => s.setter).filter(Boolean));
  const known = (root: string) => props.has(root) || stateNames.has(root);

  /** `todo.title` for a non-computed member chain rooted at a prop or state name. */
  const chain = (n: Node): string | null => {
    if (n.type === 'Identifier') return n.name;
    if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') && !n.computed && n.property.type === 'Identifier') {
      const left = chain(n.object);
      return left ? `${left}.${n.property.name}` : null;
    }
    return null;
  };
  const normalise = (path: string | null): string | null => {
    if (!path) return null;
    if (propsIdent && path.startsWith(`${propsIdent}.`)) path = path.slice(propsIdent.length + 1);
    return known(path.split('.')[0]) ? path : null;
  };

  const readsOf = (expr: Node): string[] => {
    const out = new Set<string>();
    const visit = (n: Node) => {
      if (!isNode(n)) return;
      if (isFn(n)) return; // reads inside nested functions run later, not during render
      if (n.type === 'CallExpression' || n.type === 'OptionalCallExpression') {
        // `title.trim()`: the read is `title`
        const c = n.callee;
        if (c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression') {
          const p = normalise(chain(c.object));
          if (p) out.add(p);
          else visit(c.object);
        }
        n.arguments.forEach(visit);
        return;
      }
      if (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression' || n.type === 'Identifier') {
        const p = normalise(chain(n));
        if (p) {
          out.add(p);
          return;
        }
      }
      children(n).forEach(visit);
    };
    visit(expr);
    return [...out];
  };

  const callsOf = (expr: Node, seen = new Set<Node>()): { fn: string; args: string[] }[] => {
    const out: { fn: string; args: string[] }[] = [];
    const target = (callee: Node): string | null => {
      if (callee.type === 'Identifier' && (props.has(callee.name) || setters.has(callee.name))) return callee.name;
      if (propsIdent && callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === propsIdent) return callee.property.name;
      return null;
    };
    // a handler passed directly: onChange={onToggle} / onClick={submit}
    if (expr.type === 'Identifier') {
      const direct = target(expr);
      if (direct) return [{ fn: direct, args: [] }];
      const local = localFns.get(expr.name);
      return local && !seen.has(local) ? (seen.add(local), callsOf(local.body, seen)) : [];
    }
    walk(expr, (n) => {
      if (n.type !== 'CallExpression') return;
      const fnName = target(n.callee);
      if (fnName) out.push({ fn: fnName, args: n.arguments.flatMap((a: Node) => readsOfLoose(a)) });
      else if (n.callee.type === 'Identifier' && localFns.has(n.callee.name) && !seen.has(localFns.get(n.callee.name))) {
        const local = localFns.get(n.callee.name);
        seen.add(local);
        out.push(...callsOf(local.body, seen));
      }
    });
    return out;
  };
  // inside handlers, arguments may read props/state even within the handler's own function
  const readsOfLoose = (a: Node): string[] => {
    const p = normalise(chain(a));
    if (p) return [p];
    if (a.type === 'CallExpression' && (a.callee.type === 'MemberExpression' || a.callee.type === 'OptionalMemberExpression')) {
      const q = normalise(chain(a.callee.object));
      if (q) return [q];
    }
    return [];
  };

  const elements: StaticElement[] = [];
  let index = 0;
  walk(fn.body, (n) => {
    if (n.type !== 'JSXElement') return;
    const open = n.openingElement;
    if (open.name.type !== 'JSXIdentifier' || capital(open.name.name)) return; // components get their own casings
    const id = `${name}#${index++}`;
    inserts.push({ at: open.name.end, text: ` data-cc=${JSON.stringify(id)}` });
    const el: StaticElement = { id, tag: open.name.name, slots: [], handlers: [] };
    for (const attr of open.attributes) {
      if (attr.type !== 'JSXAttribute' || attr.value?.type !== 'JSXExpressionContainer') continue;
      const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : `${attr.name.namespace.name}:${attr.name.name.name}`;
      const expr = attr.value.expression;
      if (/^on[A-Z]/.test(attrName)) {
        const calls = callsOf(expr);
        if (calls.length) el.handlers.push({ event: attrName, calls });
      } else {
        const reads = readsOf(expr);
        if (reads.length) el.slots.push({ name: attrName, reads });
      }
    }
    // expressions that produce JSX (a `.map` into components) are the piston's job, not a data slot
    const makesJsx = (e: Node) => {
      let found = false;
      walk(e, (m) => {
        if (m.type === 'JSXElement' || m.type === 'JSXFragment') found = true;
        return !found;
      });
      return found;
    };
    const text = n.children
      .filter((c: Node) => c.type === 'JSXExpressionContainer' && !makesJsx(c.expression))
      .flatMap((c: Node) => readsOf(c.expression));
    if (text.length) el.slots.push({ name: 'text', reads: [...new Set<string>(text)] });
    if (el.slots.length || el.handlers.length) elements.push(el);
  });

  return { name, state, elements };
}

/** Returns the transformed code, or null when the file has no components. */
export function analyse(code: string): string | null {
  let ast: Node;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch {
    return null;
  }
  const inserts: { at: number; text: string }[] = [];
  const found = components(ast.program).map((c) => analyseComponent(c.name, c.fn, inserts));
  if (!found.length || !inserts.length) return null;
  let out = code;
  for (const ins of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
  const registry = found.map((c) => `S[${JSON.stringify(c.name)}] = ${JSON.stringify(c)};`).join('\n');
  return `${out}\n;{ const S = (globalThis.${SOURCE_GLOBAL} ||= {});\n${registry}\n}\n`;
}
