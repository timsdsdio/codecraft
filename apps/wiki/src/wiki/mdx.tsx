// Components available inside every .mdx page without importing them.
import type { MDXComponents } from 'mdx/types';
import { ToolIcon, ShapeSwatch } from '@codecraft/visuals/2d';
import { Figure } from '../embeds/Embed';
import type { SceneName } from '../embeds/spec';
import { WikiLink } from './WikiLink';
import { BlockTable, Hatnote, Iface, InterfaceTable, Question, ZoneTag } from './bits';
import { TOOLS } from '../data/catalog';

type FigProps = { caption?: string; float?: 'right' | 'left' | 'none' | 'wide'; width?: number; height?: number };

export const mdxComponents: MDXComponents = {
  WikiLink,
  Iface,
  ZoneTag,
  Hatnote,
  Question,
  InterfaceTable,
  BlockTable,
  ShapeSwatch,
  ToolIcon,
  /** <BlockFigure id="todo-service" caption="…" /> */
  BlockFigure: ({ id, labels = true, ...f }: FigProps & { id: string; labels?: boolean }) => <Figure spec={{ type: 'block', id, portLabels: labels, title: true }} {...f} />,
  /** <SceneFigure name="link" caption="…" float="wide" /> */
  SceneFigure: ({ name, ...f }: FigProps & { name: SceneName }) => <Figure spec={{ type: 'scene', name }} {...f} />,
  ToolFigure: ({ tool, ...f }: FigProps & { tool: keyof typeof TOOLS }) => <Figure spec={{ type: 'tool', tool }} {...f} />,
  /** Keyboard key cap */
  Key: ({ children }: { children: React.ReactNode }) => <kbd className="cc-key">{children}</kbd>,
  table: (p) => (
    <div className="cc-table-wrap">
      <table className="cc-table" {...p} />
    </div>
  ),
};
