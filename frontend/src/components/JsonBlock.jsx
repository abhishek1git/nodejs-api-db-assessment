export default function JsonBlock({ value, label = "Response", empty = "Nothing yet." }) {
  const hasValue = value !== undefined && value !== null;

  return (
    <div className="json-block">
      <div className="json-label">{label}</div>
      {hasValue ? (
        <pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </div>
  );
}
