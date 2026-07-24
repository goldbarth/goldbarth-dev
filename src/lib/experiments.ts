import type { CollectionEntry } from 'astro:content';

export type Status = 'running' | 'partial answer' | 'concluded';
type Experiment = CollectionEntry<'experiments'>;
type Entry = CollectionEntry<'log'>;

/** Latest dated change in the log - the landing-page sort key (spec §3).
 *  Sorting by last change, not by creation, so revived experiments rise. */
export function lastChange(exp: Experiment): Date {
  return exp.data.log.reduce(
    (max, l) => (l.date > max ? l.date : max),
    new Date(0),
  );
}

/** Entries of one experiment, ascending by date - the experiment page reads
 *  front to back, and EntryNav walks the same thread. */
export function entriesOf(slug: string, entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.data.experiment === slug)
    .sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
}

/** Maps a status to the dot/block modifier suffix used across the styles. */
export function statusClass(status: Status): 'running' | 'partial' | 'concluded' {
  return status === 'partial answer' ? 'partial' : status;
}

/** The dated protocol as three fixed positions: started, then the two states
 *  beyond running (started already implies running). Unreached positions carry
 *  a null date, which the template renders as `open` in --dim-text (spec §3). */
export function fullLog(exp: Experiment): { label: string; date: Date | null }[] {
  const at = (state: string) =>
    exp.data.log.find((l) => l.state === state)?.date ?? null;
  return [
    { label: 'started', date: at('started') },
    { label: 'partial answer', date: at('partial answer') },
    { label: 'concluded', date: at('concluded') },
  ];
}

/** yyyy-mm-dd, the one date format used everywhere. */
export function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
