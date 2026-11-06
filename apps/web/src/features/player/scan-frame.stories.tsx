import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState, type ReactNode } from 'react';

import { QrCode } from '@/components/qr/qr-code';

import { ScanFrame, type ScanFrameState, type ScanPoint } from './scan-frame';

/** Turn of the code in the picture, as its `-rotate-6`. */
const TURN = (-6 * Math.PI) / 180;
/** Half the side of the code's dark modules: the card is 52 % wide, the modules about 80 % of it. */
const HALF = 0.52 * 0.8 * 0.5;
/** Where the scanner would find the code's corners, clockwise from its top left. */
const CODE: readonly ScanPoint[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
].map(([across = 0, down = 0]) => ({
  x: 0.5 + HALF * (across * Math.cos(TURN) - down * Math.sin(TURN)),
  y: 0.5 + HALF * (across * Math.sin(TURN) + down * Math.cos(TURN)),
}));

/** A stand-in for the black and white camera picture with a code in it, laid out as in the scanner. */
const Camera = ({ children }: { readonly children: ReactNode }) => (
  <div className='mx-auto max-w-md'>
    <div className='relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-muted'>
      <div
        className='absolute inset-0'
        style={{ background: 'radial-gradient(circle at 30% 20%, #d4d4d4, #3a3a3a 70%)' }}
      />
      <div className='relative w-[52%] -rotate-6 rounded-md bg-white p-2 shadow-lg'>
        <QrCode value='L-32-9FZM' />
      </div>
      {children}
    </div>
  </div>
);

/** The aim over a stand-in for the black and white camera picture, laid out as in the scanner. */
const meta = {
  title: 'Player/ScanFrame',
  component: ScanFrame,
  args: { state: 'aiming', armMs: 3000 },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['aiming', 'arming', 'busy', 'accepted', 'rejected'],
    },
  },
  render: (args) => (
    <Camera>
      <ScanFrame {...args} corners={args.state === 'aiming' ? undefined : CODE} />
    </Camera>
  ),
} satisfies Meta<typeof ScanFrame>;

export default meta;

export const Aiming: StoryObj<typeof meta> = {};

/** A code is in view: the gaps close, and once they do the code is sent. */
export const Arming: StoryObj<typeof meta> = { args: { state: 'arming' } };

/** The code was held long enough and is being sent: the outline stops and stays closed. */
export const Busy: StoryObj<typeof meta> = { args: { state: 'busy' } };

/** The game took the code: a check mark, then the game moves on. */
export const Accepted: StoryObj<typeof meta> = { args: { state: 'accepted' } };

/** The code was read but does not work here: an exclamation mark, then aiming again. */
export const Rejected: StoryObj<typeof meta> = { args: { state: 'rejected' } };

/** The steps of the scanner, over and over: a code taken, one refused, one looked away from. */
type Step = {
  readonly state: ScanFrameState;
  readonly ms: number;
  readonly label: string;
};
const START: Step = { state: 'aiming', ms: 2000, label: 'Míření' };
const SEQUENCE: readonly Step[] = [
  START,
  { state: 'arming', ms: 3000, label: 'Kód v záběru, odpočet' },
  { state: 'busy', ms: 500, label: 'Odesílání' },
  { state: 'accepted', ms: 2000, label: 'Kód přijat' },
  { state: 'aiming', ms: 2000, label: 'Míření' },
  { state: 'arming', ms: 3000, label: 'Kód v záběru, odpočet' },
  { state: 'busy', ms: 500, label: 'Odesílání' },
  { state: 'rejected', ms: 1600, label: 'Kód tady nefunguje' },
  { state: 'aiming', ms: 2000, label: 'Míření' },
  { state: 'arming', ms: 1600, label: 'Kód v záběru, odpočet' },
  { state: 'aiming', ms: 2500, label: 'Hráč se odvrátil, odpočet zrušen' },
];

const Sequence = () => {
  const [index, setIndex] = useState(0);
  const step = SEQUENCE[index] ?? START;
  useEffect(() => {
    const timer = setTimeout(() => setIndex((current) => (current + 1) % SEQUENCE.length), step.ms);
    return () => clearTimeout(timer);
  }, [step]);
  return (
    <div className='flex flex-col gap-4'>
      <Camera>
        <ScanFrame
          state={step.state}
          armMs={3000}
          corners={step.state === 'aiming' ? undefined : CODE}
        />
      </Camera>
      <p className='text-center text-sm text-muted-foreground'>{step.label}</p>
    </div>
  );
};

/** The whole course from the white aim: a code taken, one refused and one looked away from. */
export const Course: StoryObj<typeof meta> = { render: () => <Sequence /> };
