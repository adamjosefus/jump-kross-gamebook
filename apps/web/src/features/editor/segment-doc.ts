import { THEMES, type Theme } from '@gamebook/core';

import type { DraftSegment } from './draft';

/**
 * The segments of a node as one text, the way the segment editor holds them. Every segment starts
 * with a divider line, `===` followed by its theme (none for the default one), then its notes as
 * lines starting with `//`, then its markdown:
 *
 * ```
 * ===
 * Voní to tu čerstvým chlebem.
 * === red
 * // the baker is angry here
 * „Ven!“
 * ```
 */

/** A divider line: `===`, optionally followed by a theme. */
const DIVIDER = /^===(?:[ \t]+(\S+))?[ \t]*$/;

/** A line of a segment's note. */
const NOTE = /^\/\/ ?(.*)$/;

const THEME_NAMES: ReadonlySet<string> = new Set(THEMES);

const isTheme = (name: string): name is Theme => THEME_NAMES.has(name);

/** The divider line opening a segment in this theme. */
export const dividerLine = (theme: Theme | undefined): string => {
  if (theme === undefined || theme === 'default') {
    return '===';
  }

  return `=== ${theme}`;
};

/** Whether a line divides segments; an unknown theme still divides, in the default theme. */
export const isDivider = (line: string): boolean => DIVIDER.test(line);

/** The theme a divider line sets; `undefined` for the default theme or a line that is no divider. */
export const dividerTheme = (line: string): Theme | undefined => {
  const name = DIVIDER.exec(line)?.[1];
  if (name === undefined || name === 'default' || !isTheme(name)) {
    return undefined;
  }

  return name;
};

/** Whether a line is a note of its segment. */
export const isNoteLine = (line: string): boolean => NOTE.test(line);

/** Blank lines at the start and the end are not part of the text. */
const trimLines = (lines: readonly string[]): string =>
  lines
    .join('\n')
    .replace(/^\s*\n/, '')
    .trimEnd();

/** The editor's text of these segments. */
export const segmentsToDoc = (segments: readonly DraftSegment[]): string =>
  segments
    .map((segment) => {
      const notes = (segment.note ?? '')
        .split('\n')
        .filter((line) => {
          return line !== '';
        })
        .map((line) => {
          return `// ${line}`;
        });
      return [
        dividerLine(segment.theme),
        ...notes,
        ...(segment.text === '' ? [] : [segment.text]),
      ].join('\n');
    })
    .join('\n');

/**
 * The segments of the editor's text. Text before the first divider is a segment of its own; notes
 * are gathered wherever in the segment they are. A node always keeps at least one segment.
 */
export const docToSegments = (doc: string): readonly DraftSegment[] => {
  interface Open {
    readonly theme: Theme | undefined;
    readonly lines: string[];
    readonly notes: string[];
  }

  const open: Open[] = [];
  for (const line of doc.split('\n')) {
    if (isDivider(line)) {
      open.push({ theme: dividerTheme(line), lines: [], notes: [] });
      continue;
    }

    // Text before the first divider opens a segment in the default theme; blank lines do not.
    if (open.length === 0) {
      if (line.trim() === '') {
        continue;
      }

      open.push({ theme: undefined, lines: [], notes: [] });
    }

    const segment = open.at(-1)!;
    const note = NOTE.exec(line);
    if (note === null) {
      segment.lines.push(line);
    } else {
      segment.notes.push(note[1]!);
    }
  }

  if (open.length === 0) {
    return [{ text: '' }];
  }

  return open.map((segment) => {
    const note = trimLines(segment.notes);
    return {
      ...(segment.theme === undefined ? {} : { theme: segment.theme }),
      text: trimLines(segment.lines),
      ...(note === '' ? {} : { note }),
    };
  });
};
