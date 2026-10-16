// What the build-time analysis records about each component's JSX, keyed by component name in
// `globalThis.__CODECRAFT_SOURCE__`. The runtime evaluates the paths against live props and state.

export interface StaticElement {
  /** `TodoItem#2`: the component and the element's index in its JSX; also its `data-cc` attribute */
  id: string;
  tag: string;
  /** attributes (or `text`) fed by expressions, and the prop/state paths they read */
  slots: { name: string; reads: string[] }[];
  /** event attributes and the prop functions / state setters their handlers call */
  handlers: { event: string; calls: { fn: string; args: string[] }[] }[];
}

export interface StaticComponent {
  name: string;
  /** state variable names in hook order, and their setters */
  state: { name: string; setter: string }[];
  elements: StaticElement[];
}

export const SOURCE_GLOBAL = '__CODECRAFT_SOURCE__';
