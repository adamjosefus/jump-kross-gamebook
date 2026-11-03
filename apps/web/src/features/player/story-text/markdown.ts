import type { BlockContent, DefinitionContent, PhrasingContent, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

/** How a piece of inline text looks. */
export type Mark = 'strong' | 'em' | 'code';

export interface Run {
  readonly text: string;
  readonly marks: readonly Mark[];
}

export type ParagraphKind = 'h1' | 'h2' | 'h3' | 'p' | 'quote';

/** One paragraph laid out by Pretext: a run of inline text in one width. */
export interface Paragraph {
  readonly kind: ParagraphKind;
  readonly runs: readonly Run[];
  /** List nesting depth; 0 outside lists. */
  readonly depth: number;
  /** Bullet or number in front of a list item's first paragraph. */
  readonly marker?: string;
  /** Continues the previous paragraph after a hard line break, without a gap. */
  readonly continued?: true;
}

const inline = (
  nodes: readonly PhrasingContent[],
  marks: readonly Mark[],
): readonly (Run | 'break')[] =>
  nodes.flatMap((node): readonly (Run | 'break')[] => {
    switch (node.type) {
      case 'text':
        return [{ text: node.value, marks }];
      case 'inlineCode':
        return [{ text: node.value, marks: [...marks, 'code'] }];
      case 'strong':
        return inline(node.children, [...marks, 'strong']);
      case 'emphasis':
        return inline(node.children, [...marks, 'em']);
      case 'delete':
      case 'link':
      case 'linkReference':
        return inline(node.children, marks);
      case 'break':
        return ['break'];
      default:
        return [];
    }
  });

/** Splits a paragraph's inline content at hard line breaks. */
const lines = (
  nodes: readonly PhrasingContent[],
  kind: ParagraphKind,
  depth: number,
): readonly Paragraph[] =>
  inline(nodes, [])
    // A break starts a new group; a run joins the last one.
    .reduce<readonly (readonly Run[])[]>(
      (groups, item) =>
        item === 'break'
          ? [...groups, []]
          : [...groups.slice(0, -1), [...(groups.at(-1) ?? []), item]],
      [[]],
    )
    .filter((runs) => runs.some((run) => run.text.trim() !== ''))
    .map((runs, index) => ({ kind, runs, depth, ...(index === 0 ? {} : { continued: true }) }));

const blocks = (
  nodes: readonly (RootContent | BlockContent | DefinitionContent)[],
  depth: number,
  quote: boolean,
): readonly Paragraph[] =>
  nodes.flatMap((node): readonly Paragraph[] => {
    switch (node.type) {
      case 'heading':
        return lines(
          node.children,
          node.depth === 1 ? 'h1' : node.depth === 2 ? 'h2' : 'h3',
          depth,
        );
      case 'paragraph':
        return lines(node.children, quote ? 'quote' : 'p', depth);
      case 'blockquote':
        return blocks(node.children, depth, true);
      case 'list':
        return node.children.flatMap((item, index) => {
          const marker = node.ordered === true ? `${(node.start ?? 1) + index}.` : '•';
          const [first, ...rest] = blocks(item.children, depth + 1, quote);
          return first === undefined ? [] : [{ ...first, marker }, ...rest];
        });
      default:
        return [];
    }
  });

/**
 * The Markdown of one screen as paragraphs for Pretext: headings, paragraphs, quotes and list
 * items with bold, italic and code. Links keep only their text; images and tables are left out.
 */
export const paragraphsOf = (markdown: string): readonly Paragraph[] =>
  blocks(fromMarkdown(markdown).children, 0, false);
