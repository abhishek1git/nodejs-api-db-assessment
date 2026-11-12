import Card from "../components/Card";
import JsonBlock from "../components/JsonBlock";
import PageHeader from "../components/PageHeader";
import Pill from "../components/Pill";
import useTestRunner from "../hooks/useTestRunner";
import { allTestCases, testGroups } from "../test-cases";

const STATE_TONE = {
  idle: "neutral",
  running: "info",
  passed: "success",
  failed: "danger",
  cancelled: "warning",
};

const STATE_LABEL = {
  idle: "Not run",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  cancelled: "Skipped",
};

function TestCaseRow({ testCase, result, disabled, onRun }) {
  return (
    <li className={`test-case test-case-${result.state}`}>
      <div className="test-case-main">
        <Pill tone={STATE_TONE[result.state]}>{STATE_LABEL[result.state]}</Pill>
        <div className="test-case-text">
          <span className="test-case-name">{testCase.name}</span>
          <span className="test-case-description">{testCase.description}</span>
        </div>
        <span className="test-case-meta">
          {result.status ? `HTTP ${result.status}` : ""}
          {result.status && result.durationMs != null ? " · " : ""}
          {result.durationMs != null ? `${result.durationMs} ms` : ""}
        </span>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => onRun(testCase)}
          disabled={disabled}
        >
          Run
        </button>
      </div>

      {result.error && <p className="test-case-error">{result.error}</p>}

      {result.evidence != null && (
        <details className="test-evidence" open={result.state === "failed"}>
          <summary>Evidence</summary>
          <JsonBlock value={result.evidence} label="Captured data" />
        </details>
      )}
    </li>
  );
}

function GroupSummary({ cases, results }) {
  let passed = 0;
  let failed = 0;
  for (const testCase of cases) {
    const state = results[testCase.id]?.state;
    if (state === "passed") passed += 1;
    if (state === "failed") failed += 1;
  }
  return (
    <span className="group-count">
      {passed}/{cases.length} passed{failed ? ` · ${failed} failed` : ""}
    </span>
  );
}

export default function TestSuitePage() {
  const runner = useTestRunner(allTestCases);
  const { results, summary, activeRun, isRunning } = runner;

  return (
    <>
      <PageHeader
        title="Automated test suite"
        subtitle="Every HTTP-testable scenario from the backend suite, executed against the live API. Cases create their own customers and accounts, so the suite can be re-run safely."
        actions={
          <>
            <button
              type="button"
              className="button"
              onClick={runner.reset}
              disabled={isRunning || summary.idle === summary.total}
            >
              Reset
            </button>
            <button
              type="button"
              className="button"
              onClick={runner.cancel}
              disabled={!isRunning}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={runner.runAll}
              disabled={isRunning}
            >
              {activeRun === "all" ? "Running…" : `Run all ${summary.total} tests`}
            </button>
          </>
        }
      />

      <Card className="summary-card">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-value">{summary.total}</span>
            <span className="summary-label">Total</span>
          </div>
          <div className="summary-item summary-passed">
            <span className="summary-value">{summary.passed}</span>
            <span className="summary-label">Passed</span>
          </div>
          <div className="summary-item summary-failed">
            <span className="summary-value">{summary.failed}</span>
            <span className="summary-label">Failed</span>
          </div>
          <div className="summary-item summary-skipped">
            <span className="summary-value">{summary.cancelled}</span>
            <span className="summary-label">Skipped</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{summary.idle + summary.running}</span>
            <span className="summary-label">Remaining</span>
          </div>
        </div>
        {isRunning && (
          <p className="inline-status">
            <span className="spinner" aria-hidden="true" />
            {activeRun === "all"
              ? "Running the full suite…"
              : `Running ${testGroups.find((group) => group.id === activeRun)?.title ?? "case"}…`}
          </p>
        )}
        {!isRunning && summary.passed === summary.total && summary.total > 0 && (
          <p className="alert alert-success">
            All {summary.total} HTTP cases passed against the live API.
          </p>
        )}
      </Card>

      {testGroups.map((group) => (
        <Card
          key={group.id}
          title={group.title}
          subtitle={group.description}
          actions={
            <>
              <GroupSummary cases={group.cases} results={results} />
              <button
                type="button"
                className="button button-small"
                onClick={() => runner.runGroup(group)}
                disabled={isRunning}
              >
                {activeRun === group.id ? "Running…" : "Run group"}
              </button>
            </>
          }
        >
          <ul className="test-list">
            {group.cases.map((testCase) => (
              <TestCaseRow
                key={testCase.id}
                testCase={testCase}
                result={results[testCase.id]}
                disabled={isRunning}
                onRun={runner.runCase}
              />
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
