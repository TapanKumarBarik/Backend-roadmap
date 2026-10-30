// The thin done / in-progress bar used on the dashboard, in paths and in the tree. Styled by `.bar` in global.css.
export default function ProgressBar({ done, wip = 0, total }) {
  return (
    <span className="bar">
      <i className="d" style={{ width: total ? (done / total) * 100 + '%' : 0 }} />
      <i className="w" style={{ width: total ? (wip / total) * 100 + '%' : 0 }} />
    </span>
  );
}
