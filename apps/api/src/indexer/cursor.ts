/**
 * Indexer cursor primitives, kept in a leaf file so consumers outside
 * `indexer/` (the `/demo` director's reset) can share them without importing
 * `IndexerService` and its whole dependency tree for a string helper.
 */

/** One row per watched wallet's log stream, per context/backend-roadmap.md §3. */
export function cursorKeyFor(walletAddress: string): string {
  return `wallet:${walletAddress.toLowerCase()}`;
}

/** Transaction budget for a cursor-advancing write. Shared by the indexer's
 * own tick and by `DemoService.reset()`, which rewinds the same rows — a
 * long-running wallet's feed can be a few thousand rows. */
export const CURSOR_TRANSACTION_OPTIONS = { timeout: 15_000 };
