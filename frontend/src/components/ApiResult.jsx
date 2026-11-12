import JsonBlock from "./JsonBlock";
import Pill from "./Pill";

function toneForStatus(status) {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "warning";
  return "danger";
}

export default function ApiResult({ result, error, busy, label = "Response" }) {
  if (busy) {
    return (
      <p className="inline-status">
        <span className="spinner" aria-hidden="true" /> Calling API…
      </p>
    );
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  if (!result) {
    return <p className="muted">No request sent yet.</p>;
  }

  return (
    <div className="api-result">
      <Pill tone={toneForStatus(result.status)}>HTTP {result.status}</Pill>
      <JsonBlock value={result.data} label={label} />
    </div>
  );
}
