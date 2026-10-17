// What the build-time instrumentation records about each component's JSX, keyed by component name in
// `globalThis.__CODECRAFT_SOURCE__`. Only source text is recorded; values come from React at runtime.

export interface StaticElement {
  /** `TodoItem#2`: the component and the element's index in its JSX; also its `data-cc` attribute */
  id: string;
  tag: string;
  /** attributes set by an expression, with the expression's source */
  attrs: { name: string; src: string }[];
  /** expression children, with their index in `props.children` and their source */
  children: { index: number; src: string }[];
  /** event attributes (`onClick`, …) */
  handlers: string[];
}

export interface StaticComponent {
  name: string;
  elements: StaticElement[];
}

export const SOURCE_GLOBAL = '__CODECRAFT_SOURCE__';
