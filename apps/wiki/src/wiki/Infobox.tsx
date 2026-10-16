// The right-hand infobox: title, a 3D render of the subject, then a table of facts.
import { Viewport } from '../embeds/Embed';
import { SCENE_NAMES, type SceneName } from '../embeds/spec';
import type { Frontmatter } from '../pages';
import { StatusChip } from './bits';

export function Infobox({ fm }: { fm: Frontmatter }) {
  const ib = fm.infobox;
  if (!ib) return null;
  const scene = ib.scene && (SCENE_NAMES as readonly string[]).includes(ib.scene) ? (ib.scene as SceneName) : null;
  return (
    <aside className="cc-infobox" aria-label={`${fm.title} infobox`}>
      <div className="cc-infobox-title">{fm.title}</div>
      {scene && <Viewport spec={{ type: 'scene', name: scene }} height={230} label={fm.title} />}
      {ib.caption && <div className="cc-infobox-caption">{ib.caption}</div>}
      <table>
        <tbody>
          {Object.entries(ib.rows ?? {}).map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
          {fm.status && (
            <tr>
              <th>Design</th>
              <td>
                <StatusChip status={fm.status} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </aside>
  );
}
