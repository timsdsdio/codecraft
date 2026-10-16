// Components available inside every .mdx page without importing them.
import type { ReactNode } from 'react';
import type { MDXComponents } from 'mdx/types';
import { Figure } from '../embeds/Embed';
import type { SceneName } from '../embeds/spec';
import { TODO_SOURCE } from '../data/todoApp';
import { WikiLink } from './WikiLink';
import { ComponentTable, Hatnote, Kind, KindTable, Question } from './bits';

type FigProps = { caption?: string; float?: 'right' | 'left' | 'none' | 'wide'; width?: number; height?: number };

export const mdxComponents: MDXComponents = {
  WikiLink,
  Hatnote,
  Question,
  Kind,
  KindTable,
  ComponentTable,
  /** <SceneFigure name="overview" caption="…" float="wide" /> */
  SceneFigure: ({ name, ...f }: FigProps & { name: SceneName }) => <Figure spec={{ type: 'scene', name }} {...f} />,
  /** The reference app's full source. */
  TodoSource: () => (
    <pre>
      <code>{TODO_SOURCE}</code>
    </pre>
  ),
  /** Keyboard key cap */
  Key: ({ children }: { children: ReactNode }) => <kbd className="cc-key">{children}</kbd>,
  table: (p) => (
    <div className="cc-table-wrap">
      <table className="cc-table" {...p} />
    </div>
  ),
};
