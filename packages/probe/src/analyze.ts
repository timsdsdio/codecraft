// Build-time instrumentation (dev only). Two jobs, both done on the code as it's served; files on
// disk are never changed:
//
//   1. Tag every host element in each component's JSX with `data-cc="Component#n"` and register,
//      per element, the source text of each expression attribute and expression child. The probe
//      reads the matching *values* from React's own host fiber props at runtime, so any expression
//      works: nothing here needs to understand what the expression means.
//
//   2. Rewrite every function call in the file into a recorded call: `f(a)` → `__cc.c("f", f, a)`,
//      `o.m(a)` → `__cc.m("o.m", o, "m", a)`. The runtime only records while an event is being
//      handled (otherwise it just calls through), which is how the game learns exactly which
//      functions an event handler called, with which arguments, through any number of helpers.
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

function walk(n: Node, visit: (n: Node, parents: Node[]) => boolean | void, parents: Node[] = []) {
  if (visit(n, parents) === false) return;
  parents.push(n);
  for (const c of children(n)) walk(c, visit, parents);
  parents.pop();
}

const isFn = (n: Node) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(n.type);
const capital = (s: string) => /^[A-Z]/.test(s);

/** `memo(fn)`, `React.memo(fn)`, `forwardRef(fn)`: the function inside, or the node itself. */
function unwrap(n: Node): Node {
  if (n?.type !== 'CallExpression') return n;
  const c = n.callee;
  const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' ? c.property?.name : null;
  return name === 'memo' || name === 'forwardRef' ? unwrap(n.arguments[0]) : n;
}

/** Top-level component functions: `function Foo()`, `const Foo = () => …`, `const Foo = memo(…)`, exported or not. */
function components(program: Node): { name: string; fn: Node }[] {
  const out: { name: string; fn: Node }[] = [];
  for (let stmt of program.body) {
    if ((stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') && stmt.declaration) stmt = stmt.declaration;
    if (stmt.type === 'FunctionDeclaration' && stmt.id && capital(stmt.id.name)) out.push({ name: stmt.id.name, fn: stmt });
    if (stmt.type === 'VariableDeclaration')
      for (const d of stmt.declarations) {
        const fn = unwrap(d.init);
        if (d.id?.type === 'Identifier' && capital(d.id.name) && isFn(fn)) out.push({ name: fn.id?.name ?? d.id.name, fn });
      }
  }
  return out;
}

/** React's rule for JSX text children: trim around line breaks, drop lines that end up empty. */
function cleanJsxText(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);
  let out = '';
  lines.forEach((line, i) => {
    let s = line.replace(/\t/g, ' ');
    if (i !== 0) s = s.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) s = s.replace(/[ ]+$/, '');
    if (s) out += (out ? ' ' : '') + s;
  });
  return out;
}

const makesJsx = (e: Node) => {
  let found = false;
  walk(e, (m) => {
    if (m.type === 'JSXElement' || m.type === 'JSXFragment') found = true;
    return !found;
  });
  return found;
};

interface Edit {
  start: number;
  end: number;
  text: string;
  /** nesting depth: at equal positions, inner edits apply first so outer text ends up in front */
  depth: number;
}

function tagElements(name: string, fn: Node, code: string, edits: Edit[]): StaticComponent {
  const elements: StaticElement[] = [];
  let index = 0;
  walk(fn.body, (n) => {
    if (n.type !== 'JSXElement') return;
    const open = n.openingElement;
    if (open.name.type !== 'JSXIdentifier' || capital(open.name.name)) return; // components get their own casings
    const id = `${name}#${index++}`;
    edits.push({ start: open.name.end, end: open.name.end, text: ` data-cc=${JSON.stringify(id)}`, depth: 0 });
    const el: StaticElement = { id, tag: open.name.name, attrs: [], children: [], handlers: [] };
    for (const attr of open.attributes) {
      if (attr.type !== 'JSXAttribute' || attr.value?.type !== 'JSXExpressionContainer') continue;
      const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : `${attr.name.namespace.name}:${attr.name.name.name}`;
      const expr = attr.value.expression;
      if (/^on[A-Z]/.test(attrName)) el.handlers.push(attrName);
      else if (attrName !== 'key' && attrName !== 'ref') el.attrs.push({ name: attrName, src: code.slice(expr.start, expr.end) });
    }
    // children, numbered the way React numbers them in props.children
    let child = 0;
    for (const c of n.children) {
      if (c.type === 'JSXText') {
        if (cleanJsxText(c.value)) child++;
      } else if (c.type === 'JSXExpressionContainer') {
        if (c.expression.type === 'JSXEmptyExpression') continue;
        // an expression that produces JSX (a `.map` into components) is the piston's job, not a slot
        if (!makesJsx(c.expression)) el.children.push({ index: child, src: code.slice(c.expression.start, c.expression.end) });
        child++;
      } else child++;
    }
    if (el.attrs.length || el.children.length || el.handlers.length) elements.push(el);
  });
  return { name, elements };
}

/** Every call outside of hooks, `require`, `super` and optional chains becomes a recorded call. */
function instrumentCalls(program: Node, code: string, edits: Edit[]) {
  walk(program, (n, parents) => {
    if (n.type !== 'CallExpression' || n.optional) return;
    const c = n.callee;
    const depth = parents.filter((p) => p.type === 'CallExpression').length + 1;
    const typeEnd = (n.typeArguments ?? n.typeParameters)?.end ?? c.end;
    const paren = code.indexOf('(', typeEnd);
    if (paren < 0) return;
    const hasArgs = n.arguments.length > 0;
    if (c.type === 'Identifier') {
      if (/^use[A-Z0-9]/.test(c.name) || c.name === 'require' || c.name === '__cc') return;
      const start = Math.min(c.start, c.extra?.parenStart ?? c.start);
      edits.push({ start, end: start, text: `__cc.c(${JSON.stringify(c.name)}, `, depth });
      edits.push({ start: paren, end: paren + 1, text: hasArgs ? ', ' : '', depth });
    } else if (c.type === 'MemberExpression' && !c.optional && c.object.type !== 'Super') {
      const objectSrc = code.slice(c.object.start, c.object.end).replace(/\s+/g, ' ');
      const prop = c.computed ? `[${code.slice(c.property.start, c.property.end)}]` : `.${c.property.name}`;
      const label = (objectSrc.length > 24 ? '…' : objectSrc) + prop;
      if (/^React\.use[A-Z]/.test(label)) return;
      // node ranges exclude parentheses: `(xs as const).map(…)` must keep its `)`
      const start = Math.min(c.start, c.object.extra?.parenStart ?? c.start);
      edits.push({ start, end: start, text: `__cc.m(${JSON.stringify(label)}, `, depth });
      if (c.computed) {
        // obj[key]( → obj, key,
        const open = code.lastIndexOf('[', c.property.start);
        const close = code.indexOf(']', c.property.end);
        edits.push({ start: open, end: open + 1, text: ', ', depth });
        edits.push({ start: close, end: paren + 1, text: hasArgs ? ', ' : '', depth });
      } else {
        // obj.method( → obj, "method",
        const dot = code.lastIndexOf('.', c.property.start);
        edits.push({ start: dot, end: c.property.end, text: `, ${JSON.stringify(c.property.name)}`, depth });
        edits.push({ start: paren, end: paren + 1, text: hasArgs ? ', ' : '', depth });
      }
    }
  });
}

/** Returns the transformed code, or null when there's nothing to do. */
export function analyse(code: string): string | null {
  let ast: Node;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch {
    return null;
  }
  const edits: Edit[] = [];
  const found = components(ast.program).map((c) => tagElements(c.name, c.fn, code, edits));
  instrumentCalls(ast.program, code, edits);
  if (!edits.length) return null;
  edits.sort((a, b) => b.start - a.start || b.depth - a.depth);
  let out = code;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!found.length) return out;
  const registry = found.map((c) => `S[${JSON.stringify(c.name)}] = ${JSON.stringify(c)};`).join('\n');
  return `${out}\n;{ const S = (globalThis.${SOURCE_GLOBAL} ||= {});\n${registry}\n}\n`;
}
