import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { DraftSegment } from './draft';
import { SAMPLE_DRAFT } from './sample-draft';
import { segmentsToDoc } from './segment-doc';
import { SegmentEditor } from './segment-editor';

/** The editor beside the text it holds, so what the keys do to the segments can be seen. */
const WithText = ({ initial }: { readonly initial: readonly DraftSegment[] }) => {
  const [segments, setSegments] = useState(initial);
  return (
    <div className='grid max-w-5xl grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8'>
      <SegmentEditor value={segments} onChange={setSegments} autoFocus />
      <pre className='overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground'>
        {segmentsToDoc(segments)}
        {'\n\n'}
        {JSON.stringify(segments, null, 2)}
      </pre>
    </div>
  );
};

const meta = {
  title: 'Editor/Segment editor',
  component: WithText,
  parameters: {
    docs: {
      description: {
        component:
          '`===` a Enter rozdělí segment, `/` na začátku řádku nabídne příkazy, `//` je poznámka, Backspace na začátku segmentu ho spojí s předchozím.',
      },
    },
  },
} satisfies Meta<typeof WithText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { initial: [{ text: '' }] } };

export const Node: Story = { args: { initial: SAMPLE_DRAFT.nodes[0].segments } };

export const ManyThemes: Story = {
  args: {
    initial: [
      { theme: 'intro', text: '# Poklad starého mlýna' },
      { text: 'Hledá se ztracený poklad mlynáře Matěje. **Kdo ho najde dřív?**' },
      { theme: 'green', text: '_V lese je ticho._', note: 'Ráno, mlha.' },
      { theme: 'red', text: '„Stůjte!“ ozve se za vámi.' },
      { theme: 'letter', text: 'Milý Matěji,\n\npoklad je tam, kde voda nepadá.' },
      { theme: 'description', text: 'Dopis najdete u mlýnského kola.' },
    ],
  },
};
