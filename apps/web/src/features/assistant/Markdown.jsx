// Minimal markdown for assistant answers: paragraphs, lists, tables, headings, **bold**,
// *italic*, `code`. Builds React elements only (never innerHTML), so database text that
// ends up in an answer can never become HTML.

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;

function renderInline(text) {
  return text.split(INLINE_RE).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const LIST_RE = /^\s*([-*•]|\d+[.)])\s+/;
const HEADING_RE = /^#{1,6}\s/;
const isTableLine = (line) => line.trim().startsWith("|");
const isSeparatorRow = (line) => /^\s*\|?\s*:?-{2,}/.test(line);
const splitRow = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export default function Markdown({ text }) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (isTableLine(line)) {
      const rows = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isSeparatorRow(lines[i])) rows.push(splitRow(lines[i]));
        i++;
      }
      const [head = [], ...body] = rows;
      blocks.push(
        <div className="md-table-wrap" key={blocks.length}>
          <table className="md-table">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{renderInline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (LIST_RE.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) items.push(lines[i++].replace(LIST_RE, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </List>
      );
    } else if (HEADING_RE.test(line)) {
      blocks.push(
        <p className="md-heading" key={blocks.length}>
          {renderInline(line.replace(HEADING_RE, ""))}
        </p>
      );
      i++;
    } else {
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !isTableLine(lines[i]) &&
        !LIST_RE.test(lines[i]) &&
        !HEADING_RE.test(lines[i])
      ) {
        para.push(lines[i++]);
      }
      blocks.push(
        <p key={blocks.length}>
          {para.map((l, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {renderInline(l)}
            </span>
          ))}
        </p>
      );
    }
  }
  return <div className="md">{blocks}</div>;
}
