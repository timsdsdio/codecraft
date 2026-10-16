// The wiki's model of the game's content: interfaces and block types. Infoboxes and 3D embeds both
// read from here, so a block looks the same on every page. Seeded from the Socketworld prototype.
import type { BlockSpec, PortKind } from '@codecraft/visuals/2d';

export interface IfaceInfo {
  id: string;
  kind: PortKind;
  /** TypeScript signature shown in tooltips / infoboxes */
  sig: string;
}

const i = (id: string, sig: string, kind: PortKind = 'value'): IfaceInfo => ({ id, kind, sig });

export const IFACES: Record<string, IfaceInfo> = Object.fromEntries(
  [
    i('core.Clock@1', 'interface Clock { now(): number }'),
    i('core.IdGen@1', 'interface IdGen { next(): string }'),
    i('todo.TodoRepo@1', 'interface TodoRepo { list(); add(title); toggle(id); remove(id) } // all async'),
    i('todo.TodoApi@1:handler', 'Handler<TodoApi>  // server half of the TodoApi cable', 'cable'),
    i('todo.TodoApi@1:remote', 'Remote<TodoApi>  // client half of the TodoApi cable', 'cable'),
    i('todo.TodosModel@1', 'interface TodosModel { useTodos(); add(title); toggle(id); remove(id) }'),
    i('todo.FilterModel@1', "interface FilterModel { useFilter(): 'all' | 'active' | 'done'; set(f) }"),
    i('ui.View@1', 'type View = ComponentType<{}>', 'view'),
    i('todo.ItemView@1', 'type ItemView = ComponentType<{ todo: Todo }>', 'view'),
    i('ui.Root@1', 'type Root = ComponentType<{}>', 'view'),
  ].map((x) => [x.id, x]),
);

export interface BlockInfo extends BlockSpec {
  summary: string;
}

type P = BlockSpec['ports'][number];
const out = (name: string, iface: string): P => ({ name, iface, side: 'out', kind: IFACES[iface]?.kind });
const inp = (name: string, iface: string, extra: Partial<P> = {}): P => ({ name, iface, side: 'in', kind: IFACES[iface]?.kind, ...extra });

const b = (id: string, title: string, zone: BlockSpec['zone'], summary: string, ports: P[]): BlockInfo => ({ id, title, zone, summary, ports });

export const BLOCKS: Record<string, BlockInfo> = Object.fromEntries(
  [
    b('system-clock', 'System Clock', 'server', 'Provides the current time.', [out('clock', 'core.Clock@1')]),
    b('id-gen', 'ID Generator', 'server', 'Provides unique ids.', [out('ids', 'core.IdGen@1')]),
    b('memory-todo-repo', 'Memory Repo', 'server', 'Stores todos in memory.', [
      inp('clock', 'core.Clock@1'),
      inp('ids', 'core.IdGen@1'),
      out('repo', 'todo.TodoRepo@1'),
    ]),
    b('todo-service', 'Todo Service', 'server', 'Validates and trims titles; serves the TodoApi.', [
      inp('repo', 'todo.TodoRepo@1'),
      out('api', 'todo.TodoApi@1:handler'),
    ]),
    b('mock-link', 'Mock Link', 'link', 'Carries the TodoApi cable through the network wall, with fake latency.', [
      inp('handler', 'todo.TodoApi@1:handler'),
      out('remote', 'todo.TodoApi@1:remote'),
    ]),
    b('todos-model', 'Todos Model', 'client', 'Client-side state for the todo list.', [
      inp('api', 'todo.TodoApi@1:remote'),
      out('model', 'todo.TodosModel@1'),
    ]),
    b('filter-model', 'Filter Model', 'client', 'Which todos are shown.', [out('model', 'todo.FilterModel@1')]),
    b('todo-list', 'Todo List', 'client', 'Renders the filtered list; the row view plugs in on top.', [
      inp('todos', 'todo.TodosModel@1'),
      inp('filter', 'todo.FilterModel@1'),
      inp('item', 'todo.ItemView@1'),
      out('view', 'ui.View@1'),
    ]),
    b('todo-item', 'Todo Item', 'client', 'One row of the list.', [inp('todos', 'todo.TodosModel@1'), out('view', 'todo.ItemView@1')]),
    b('neon-todo-item', 'Neon Item', 'client', 'An alternative row look.', [inp('todos', 'todo.TodosModel@1'), out('view', 'todo.ItemView@1')]),
    b('stats', 'Stats', 'client', 'Counts of open and done todos.', [inp('todos', 'todo.TodosModel@1'), out('view', 'ui.View@1')]),
    b('app-shell', 'App Shell', 'client', 'Lays out header, main and footer views.', [
      inp('header', 'ui.View@1', { many: true }),
      inp('main', 'ui.View@1', { many: true }),
      inp('footer', 'ui.View@1', { many: true }),
      out('root', 'ui.Root@1'),
    ]),
  ].map((x) => [x.id, x]),
);

export function blockOrThrow(id: string): BlockInfo {
  const x = BLOCKS[id];
  if (!x) throw new Error(`unknown block "${id}" (see src/data/catalog.ts)`);
  return x;
}

export interface ToolInfo {
  id: 'probe' | 'wire' | 'cutter' | 'wrench';
  name: string;
  slot: number;
  hint: string;
}

export const TOOLS: Record<ToolInfo['id'], ToolInfo> = {
  probe: { id: 'probe', name: 'Probe', slot: 1, hint: 'Inspect a block, socket or cable; open the app on a screen.' },
  wire: { id: 'wire', name: 'Wire Coil', slot: 2, hint: 'Run a cable from a socket to a matching socket.' },
  cutter: { id: 'cutter', name: 'Wire Cutters', slot: 3, hint: 'Cut a cable, or every cable on a socket.' },
  wrench: { id: 'wrench', name: 'Wrench', slot: 4, hint: 'Pick a block up and set it down elsewhere.' },
};
