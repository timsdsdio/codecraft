// The reference app: a small todo list. `todoSnapshot` is what the probe would report for it
// (component tree, DOM rects, props, state), so the wiki's diagrams run through the same
// layoutFactory() the game will use.
import type { CompNode, Snapshot, ValueInfo } from '@codecraft/visuals/2d';

export const VIEWPORT = { w: 400, h: 720 };
const ROW = 56;
const LIST = { x: 16, y: 156, w: 368, h: 472 };

export const TITLES = [
  'Buy milk',
  'Walk the dog',
  'Write the wiki',
  'Fix the bike',
  'Call mum',
  'Water the plants',
  'Book flights',
  'Pay rent',
  'Read a chapter',
  'Clean the desk',
  'Plan the week',
  'Back up photos',
];
const DONE = new Set([1, 4, 7]);

const fn = (name: string): ValueInfo => ({ name, kind: 'function', preview: 'ƒ' });

export function todoSnapshot({ items = 10, scrollTop = 40 }: { items?: number; scrollTop?: number } = {}): Snapshot {
  const n = Math.min(items, TITLES.length);
  const remaining = [...Array(n).keys()].filter((i) => !DONE.has(i)).length;
  const nodes: CompNode[] = [
    {
      id: 'app',
      name: 'App',
      parent: null,
      rect: { x: 0, y: 0, ...VIEWPORT },
      props: [],
      state: [
        { name: 'todos', kind: 'array', preview: `Array(${n})` },
        { name: 'filter', kind: 'string', preview: '"all"' },
      ],
      paints: false,
    },
    { id: 'header', name: 'Header', parent: 'app', rect: { x: 0, y: 0, w: 400, h: 84 }, props: [{ name: 'remaining', kind: 'number', preview: String(remaining) }], state: [] },
    {
      id: 'add',
      name: 'AddTodo',
      parent: 'app',
      rect: { x: 16, y: 92, w: 368, h: 52 },
      props: [fn('onAdd')],
      state: [{ name: 'title', kind: 'string', preview: '""' }],
    },
    {
      id: 'list',
      name: 'TodoList',
      parent: 'app',
      rect: LIST,
      props: [{ name: 'todos', kind: 'array', preview: `Array(${n})` }, fn('onToggle'), fn('onRemove')],
      state: [],
    },
    ...[...Array(n).keys()].map(
      (i): CompNode => ({
        id: `item${i}`,
        name: 'TodoItem',
        parent: 'list',
        key: `t${i}`,
        rect: { x: LIST.x, y: LIST.y + i * ROW - scrollTop + 2, w: LIST.w, h: ROW - 4 },
        clip: LIST,
        props: [{ name: 'todo', kind: 'object', preview: `{ title: "${TITLES[i]}" }` }, fn('onToggle'), fn('onRemove')],
        state: [],
      }),
    ),
    {
      id: 'filters',
      name: 'FilterBar',
      parent: 'app',
      rect: { x: 16, y: 640, w: 368, h: 64 },
      props: [{ name: 'filter', kind: 'string', preview: '"all"' }, fn('onChange')],
      state: [],
    },
  ];
  return { viewport: VIEWPORT, nodes, scrolls: [{ owner: 'list', viewport: LIST, scrollTop, scrollHeight: n * ROW }] };
}

/** Paints the todo app as it would look at this snapshot (light theme, like a typical app). */
export function drawTodoApp(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { items?: number; scrollTop?: number } = {}) {
  const n = Math.min(opts.items ?? 10, TITLES.length);
  const scrollTop = opts.scrollTop ?? 40;
  const font = (wt: number, px: number) => `${wt} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = '#f5f3ee';
  ctx.fillRect(0, 0, w, h);
  // header
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, 84);
  ctx.fillStyle = '#e6e2d8';
  ctx.fillRect(0, 83, w, 1);
  ctx.fillStyle = '#2b2f36';
  ctx.font = font(800, 34);
  ctx.textBaseline = 'middle';
  ctx.fillText('todos', 20, 44);
  const remaining = [...Array(n).keys()].filter((i) => !DONE.has(i)).length;
  ctx.fillStyle = '#e8f1ff';
  roundRect(ctx, w - 104, 28, 84, 32, 16);
  ctx.fill();
  ctx.fillStyle = '#2f6fdb';
  ctx.font = font(600, 15);
  ctx.textAlign = 'center';
  ctx.fillText(`${remaining} left`, w - 62, 44);
  ctx.textAlign = 'left';
  // add form
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d9d4c8';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 16, 92, 288, 52, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#a19c90';
  ctx.font = font(400, 16);
  ctx.fillText('What needs doing?', 32, 118);
  ctx.fillStyle = '#2f6fdb';
  roundRect(ctx, 312, 92, 72, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = font(700, 16);
  ctx.fillText('Add', 332, 118);
  // list (clipped to its scroll viewport)
  ctx.save();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, LIST.x, LIST.y, LIST.w, LIST.h, 12);
  ctx.fill();
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const y = LIST.y + i * ROW - scrollTop;
    const done = DONE.has(i);
    ctx.fillStyle = '#ece8df';
    ctx.fillRect(LIST.x + 12, y + ROW - 1, LIST.w - 24, 1);
    ctx.beginPath();
    ctx.arc(LIST.x + 28, y + ROW / 2, 11, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = done ? '#3aa86b' : '#b9b3a6';
    ctx.stroke();
    if (done) {
      ctx.fillStyle = '#3aa86b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(LIST.x + 22, y + ROW / 2);
      ctx.lineTo(LIST.x + 27, y + ROW / 2 + 5);
      ctx.lineTo(LIST.x + 35, y + ROW / 2 - 5);
      ctx.stroke();
    }
    ctx.fillStyle = done ? '#a7a296' : '#2b2f36';
    ctx.font = font(500, 17);
    ctx.fillText(TITLES[i], LIST.x + 50, y + ROW / 2);
    if (done) {
      const tw = ctx.measureText(TITLES[i]).width;
      ctx.fillRect(LIST.x + 50, y + ROW / 2, tw, 1.5);
    }
    ctx.fillStyle = '#c9c3b6';
    ctx.font = font(400, 20);
    ctx.fillText('×', LIST.x + LIST.w - 30, y + ROW / 2);
  }
  // scrollbar
  const content = n * ROW;
  if (content > LIST.h) {
    const th = (LIST.h / content) * LIST.h;
    const ty = LIST.y + (scrollTop / content) * LIST.h;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(ctx, LIST.x + LIST.w - 7, ty + 4, 4, th - 8, 2);
    ctx.fill();
  }
  ctx.restore();
  // filters
  const labels = ['All', 'Active', 'Done'];
  labels.forEach((l, i) => {
    const bw = 112;
    const x = 16 + i * (bw + 16);
    const sel = i === 0;
    ctx.fillStyle = sel ? '#2b2f36' : '#ffffff';
    ctx.strokeStyle = '#d9d4c8';
    roundRect(ctx, x, 648, bw, 48, 24);
    ctx.fill();
    if (!sel) ctx.stroke();
    ctx.fillStyle = sel ? '#ffffff' : '#2b2f36';
    ctx.font = font(600, 16);
    ctx.textAlign = 'center';
    ctx.fillText(l, x + bw / 2, 672);
    ctx.textAlign = 'left';
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export const TODO_SOURCE = `function App() {
  const [todos, setTodos] = useState<Todo[]>(seed);
  const [filter, setFilter] = useState<Filter>('all');
  const remaining = todos.filter((t) => !t.done).length;
  const shown = todos.filter((t) => filter === 'all' || t.done === (filter === 'done'));
  const add = (title: string) => setTodos([...todos, { id: uid(), title, done: false }]);
  const toggle = (id: string) => setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id: string) => setTodos(todos.filter((t) => t.id !== id));
  return (
    <main className="app">
      <Header remaining={remaining} />
      <AddTodo onAdd={add} />
      <TodoList todos={shown} onToggle={toggle} onRemove={remove} />
      <FilterBar filter={filter} onChange={setFilter} />
    </main>
  );
}

function Header({ remaining }: { remaining: number }) {
  return (
    <header>
      <h1>todos</h1>
      <span className="pill">{remaining} left</span>
    </header>
  );
}

function AddTodo({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) onAdd(title.trim());
    setTitle('');
  };
  return (
    <form onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
      <button>Add</button>
    </form>
  );
}

function TodoList({ todos, onToggle, onRemove }: ListProps) {
  return (
    <ul className="list">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function TodoItem({ todo, onToggle, onRemove }: ItemProps) {
  return (
    <li className={todo.done ? 'done' : ''}>
      <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo.id)} />
      <span>{todo.title}</span>
      <button onClick={() => onRemove(todo.id)}>×</button>
    </li>
  );
}

function FilterBar({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  return (
    <nav>
      {(['all', 'active', 'done'] as const).map((f) => (
        <button key={f} aria-pressed={f === filter} onClick={() => onChange(f)}>{f}</button>
      ))}
    </nav>
  );
}`;
