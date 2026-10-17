// The same todo app as App.tsx, written with the usual render optimisations: handlers keep their
// identity across renders (useCallback + functional state updates), and the leaf components are
// memoized, so a change only re-renders what it touches.
import { memo, useCallback, useState, type FormEvent } from 'react';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}
type Filter = 'all' | 'active' | 'done';

const seed: Todo[] = [
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
].map((title, i) => ({ id: `t${i}`, title, done: i === 1 || i === 4 || i === 7 }));

let next = seed.length;
const uid = () => `t${next++}`;

export function App() {
  const [todos, setTodos] = useState<Todo[]>(seed);
  const [filter, setFilter] = useState<Filter>('all');
  const remaining = todos.filter((t) => !t.done).length;
  const shown = todos.filter((t) => filter === 'all' || t.done === (filter === 'done'));
  const add = useCallback((title: string) => setTodos((ts) => [...ts, { id: uid(), title, done: false }]), []);
  const toggle = useCallback((id: string) => setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t))), []);
  const remove = useCallback((id: string) => setTodos((ts) => ts.filter((t) => t.id !== id)), []);
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

const AddTodo = memo(function AddTodo({ onAdd }: { onAdd: (title: string) => void }) {
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
});

interface ListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
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

const TodoItem = memo(function TodoItem({ todo, onToggle, onRemove }: { todo: Todo } & Omit<ListProps, 'todos'>) {
  return (
    <li className={todo.done ? 'done' : ''}>
      <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo.id)} />
      <span>{todo.title}</span>
      <button aria-label={`Remove ${todo.title}`} onClick={() => onRemove(todo.id)}>
        ×
      </button>
    </li>
  );
});

const FilterBar = memo(function FilterBar({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  return (
    <nav>
      {(['all', 'active', 'done'] as const).map((f) => (
        <button key={f} aria-pressed={f === filter} onClick={() => onChange(f)}>
          {f}
        </button>
      ))}
    </nav>
  );
});
