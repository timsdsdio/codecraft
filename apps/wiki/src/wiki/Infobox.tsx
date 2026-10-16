// The right-hand infobox: title, a 3D render of the subject, then a table of facts.
import { ShapeSwatch, ToolIcon } from '@codecraft/visuals/2d';
import { BLOCKS, TOOLS } from '../data/catalog';
import { Viewport } from '../embeds/Embed';
import { SCENE_NAMES, type EmbedSpec, type SceneName } from '../embeds/spec';
import type { Frontmatter } from '../pages';
import { StatusChip, ZoneTag } from './bits';
import { WikiLink } from './WikiLink';

export function Infobox({ fm }: { fm: Frontmatter }) {
  const ib = fm.infobox;
  if (!ib) return null;
  const block = ib.block ? BLOCKS[ib.block] : undefined;
  const tool = ib.tool ? TOOLS[ib.tool] : undefined;
  let spec: EmbedSpec | null = null;
  if (block) spec = { type: 'block', id: block.id };
  else if (tool) spec = { type: 'tool', tool: tool.id };
  else if (ib.scene && (SCENE_NAMES as readonly string[]).includes(ib.scene)) spec = { type: 'scene', name: ib.scene as SceneName };

  const ins = block?.ports.filter((p) => p.side === 'in') ?? [];
  const outs = block?.ports.filter((p) => p.side === 'out') ?? [];
  return (
    <aside className="cc-infobox" aria-label={`${fm.title} infobox`}>
      <div className="cc-infobox-title">{fm.title}</div>
      {spec && <Viewport spec={spec} height={230} label={fm.title} />}
      {ib.caption && <div className="cc-infobox-caption">{ib.caption}</div>}
      <table>
        <tbody>
          {block && (
            <>
              <tr><th>Type</th><td><WikiLink to="block">Block</WikiLink></td></tr>
              <tr><th>Zone</th><td><ZoneTag zone={block.zone} /></td></tr>
              <tr><th>Block id</th><td><code>{block.id}</code></td></tr>
              {ins.length > 0 && (
                <tr>
                  <th>Inputs</th>
                  <td>{ins.map((p) => <div key={p.name} className="cc-port"><ShapeSwatch iface={p.iface} size={14} female /> <b>{p.name}</b>{p.many ? ' ×n' : ''}<br /><code>{p.iface}</code></div>)}</td>
                </tr>
              )}
              {outs.length > 0 && (
                <tr>
                  <th>Outputs</th>
                  <td>{outs.map((p) => <div key={p.name} className="cc-port"><ShapeSwatch iface={p.iface} size={14} /> <b>{p.name}</b><br /><code>{p.iface}</code></div>)}</td>
                </tr>
              )}
            </>
          )}
          {tool && (
            <>
              <tr><th>Type</th><td><WikiLink to="tools">Tool</WikiLink></td></tr>
              <tr><th>Icon</th><td><ToolIcon tool={tool.id} size={28} /></td></tr>
              <tr><th>Hotbar slot</th><td>{tool.slot} <span className="cc-key">{tool.slot}</span></td></tr>
            </>
          )}
          {Object.entries(ib.rows ?? {}).map(([k, v]) => (
            <tr key={k}><th>{k}</th><td>{v}</td></tr>
          ))}
          {fm.status && <tr><th>Design</th><td><StatusChip status={fm.status} /></td></tr>}
        </tbody>
      </table>
    </aside>
  );
}
