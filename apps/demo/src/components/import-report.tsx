import type { FidelityReport } from "genesis-editor";

/** Fidelity breakdown after `setHTML` or `importFile`. */
export function ImportReport({ report, testId }: { report: FidelityReport; testId: string }) {
  const removed = report.dropped.map((d) => `${d.count}× <${d.tag}> (${d.reason})`);
  const unwrapped = report.unwrapped.map((u) => `${u.count}× <${u.tag}>`);
  const cleanup = report.cleanup.sections
    ? `${report.cleanup.sections} sections (${report.cleanup.labels.join(", ")})`
    : report.cleanup.skipped === "small"
      ? "skipped (small paste)"
      : report.cleanup.skipped === "off"
        ? "off"
        : "nothing removed";
  return (
    <div className="grid gap-3" data-testid={`${testId}-report`}>
      {report.blocks === 0 && (
        <p className="text-destructive">No blocks came out of this file. Is it only scripts, styles or comments?</p>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs [&_dd]:break-words">
        <dt className="text-muted-foreground">Fidelity</dt>
        <dd data-testid={`${testId}-score`}>{Math.round(report.score * 100)}%</dd>
        <dt className="text-muted-foreground">Mode</dt>
        <dd>{report.mode}</dd>
        <dt className="text-muted-foreground">Blocks</dt>
        <dd data-testid={`${testId}-blocks`}>{report.blocks}</dd>
        <dt className="text-muted-foreground">Removed</dt>
        <dd data-testid={`${testId}-removed`}>{removed.length ? removed.join(", ") : "nothing"}</dd>
        <dt className="text-muted-foreground">Unwrapped</dt>
        <dd>{unwrapped.length ? unwrapped.join(", ") : "nothing"}</dd>
        <dt className="text-muted-foreground">Cleanup</dt>
        <dd data-testid={`${testId}-cleanup`}>{cleanup}</dd>
      </dl>
      {report.warnings.length > 0 && (
        <ul className="grid list-disc gap-1 pl-4 text-xs text-amber-700 dark:text-amber-400" data-testid={`${testId}-warnings`}>
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
