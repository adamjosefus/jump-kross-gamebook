import { THEMES, type Theme } from '@gamebook/core';

import type { DraftSegment } from './draft';

/**
 * The segments of a node as one text, the way the segment editor holds them. Every segment starts
 * with a divider line, `===` followed by its theme (none for the default one), then its markdown:
 *
 * ```
 * ===
 * Voní to tu čerstvým chlebem.
 * === red
 * „Ven!“
 * ```
 *
 * The segments' notes are no part of the text; the editor keeps them by their dividers.
 */

/** A divider line: `===`, optionally followed by a theme. */
const DIVIDER = /^===(?:[ \t]+(\S+))?[ \t]*$/;

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

/** Blank lines at the start and the end are not part of the text. */
const trimLines = (lines: readonly string[]): string =>
  lines
    .join('\n')
    .replace(/^\s*\n/, '')
    .trimEnd();

/** The editor's text of these segments, without their notes. */
export const segmentsToDoc = (segments: readonly DraftSegment[]): string =>
  segments
    .map((segment) => {
      // An empty segment keeps an empty line to write in.
      return `${dividerLine(segment.theme)}\n${segment.text}`;
    })
    .join('\n');

/**
 * The segments of the editor's text, with `notes` in the order of the segments. Text before the
 * first divider is a segment of its own. A node always keeps at least one segment.
 */
export const docToSegments = (
  doc: string,
  notes: readonly (string | undefined)[] = [],
): readonly DraftSegment[] => {
  interface Open {
    readonly theme: Theme | undefined;
    readonly lines: string[];
  }

  const open: Open[] = [];
  for (const line of doc.split('\n')) {
    if (isDivider(line)) {
      open.push({ theme: dividerTheme(line), lines: [] });
      continue;
    }

    // Text before the first divider opens a segment in the default theme; blank lines do not.
    if (open.length === 0) {
      if (line.trim() === '') {
        continue;
      }

      open.push({ theme: undefined, lines: [] });
    }

    open.at(-1)!.lines.push(line);
  }

  if (open.length === 0) {
    const note = notes[0];
    return [{ text: '', ...(note === undefined || note.trim() === '' ? {} : { note }) }];
  }

  return open.map((segment, index) => {
    // Kept as written, a space at its end too, so a note being written is not cut under the pen.
    const note = notes[index] ?? '';
    return {
      ...(segment.theme === undefined ? {} : { theme: segment.theme }),
      text: trimLines(segment.lines),
      ...(note.trim() === '' ? {} : { note }),
    };
  });
};
