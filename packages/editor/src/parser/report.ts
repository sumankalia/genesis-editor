import { VISUAL_PROPERTIES } from "./rules/styles";
import type { CleanupSummary, DropReason, FidelityReport, ParseMode } from "./types";

/** Reasons that are intended clean-up and don't lower the score. */
const EXPECTED_DROPS = new Set<DropReason>(["content", "noise", "hidden", "tracking", "unsafe"]);

export class ReportBuilder {
  private dropped = new Map<string, { tag: string; reason: DropReason; count: number; preview?: string }>();
  private unwrapped = new Map<string, number>();
  private styles = new Map<string, number>();
  private styledElements = new Set<object>();
  private downgrades = new Map<string, { from: string; to: string; count: number }>();
  readonly images = { total: 0, resolved: 0, unresolved: 0, failed: 0, rehosted: 0, rehostFailed: 0 };
  readonly embeds = { provider: 0, generic: 0, blocked: 0 };
  private warnings: string[] = [];
  /** Source elements mapped to an editor block or mark. */
  mapped = 0;

  readonly colors = { palette: 0, hex: 0 };
  readonly headings = { promoted: 0, dropped: 0 };
  readonly fontSizes = { sized: 0, clamped: 0 };
  cleanup: CleanupSummary = { sections: 0, labels: [] };

  drop(tag: string, reason: DropReason, text?: string | null) {
    const key = `${tag}\u0000${reason}`;
    const entry = this.dropped.get(key);
    if (entry) entry.count++;
    else {
      const preview = text?.replace(/\s+/g, " ").trim().slice(0, 80);
      this.dropped.set(key, { tag, reason, count: 1, ...(preview ? { preview } : {}) });
    }
  }

  unwrap(tag: string) {
    this.unwrapped.set(tag, (this.unwrapped.get(tag) ?? 0) + 1);
  }

  unsupportedStyle(prop: string, element: object) {
    this.styles.set(prop, (this.styles.get(prop) ?? 0) + 1);
    if (VISUAL_PROPERTIES.has(prop)) this.styledElements.add(element);
  }

  downgrade(from: string, to: string) {
    const key = `${from}\u0000${to}`;
    const entry = this.downgrades.get(key);
    if (entry) entry.count++;
    else this.downgrades.set(key, { from, to, count: 1 });
  }

  warn(message: string) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  build(mode: ParseMode, blocks: number): FidelityReport {
    const downgraded = sum(this.downgrades.values());
    const lost = sum([...this.dropped.values()].filter((d) => !EXPECTED_DROPS.has(d.reason))) + this.images.failed;
    const styleLoss = this.styledElements.size * 0.1;
    const total = this.mapped + downgraded + lost + styleLoss;
    const score = total === 0 ? 1 : (this.mapped + downgraded * 0.5) / total;
    const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
    return {
      mode,
      score: Math.round(score * 1000) / 1000,
      blocks,
      dropped: [...this.dropped.values()].sort(byCount),
      unwrapped: [...this.unwrapped].map(([tag, count]) => ({ tag, count })).sort(byCount),
      unsupportedStyles: [...this.styles]
        .map(([prop, count]) => ({ prop, count, visual: VISUAL_PROPERTIES.has(prop) }))
        .sort(byCount),
      downgrades: [...this.downgrades.values()].sort(byCount),
      colors: { ...this.colors },
      headings: { ...this.headings },
      fontSizes: { ...this.fontSizes },
      images: { ...this.images },
      embeds: { ...this.embeds },
      cleanup: { ...this.cleanup, labels: [...this.cleanup.labels] },
      warnings: [...this.warnings],
    };
  }
}

function sum(entries: Iterable<{ count: number }>) {
  let total = 0;
  for (const entry of entries) total += entry.count;
  return total;
}
