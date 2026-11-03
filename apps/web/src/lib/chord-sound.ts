/**
 * Plays a chord on a sampled cello, one note after another, as a slide button is dragged: the
 * first note sounds, very softly, when the drag starts, the others join as the thumb passes their
 * share of the track, the whole swells with the thumb, and the full chord rings at the end, where a
 * chime marks the confirmed choice. Everything runs on the Web Audio API with a few
 * cello samples (see `public/audio/cello/ATTRIBUTION.md`), pitched to the notes the story asks for
 * and looped while the thumb is held.
 */

/** Note names the story may use; sharps only, so a name maps to exactly one pitch. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * The samples shipped, about a minor third apart, so a note is never pitched by more than a tone
 * and keeps the cello's timbre. File names write a sharp as `s`.
 */
const SAMPLES = [
  'C2',
  'D#2',
  'F2',
  'G#2',
  'B2',
  'D3',
  'F3',
  'G#3',
  'B3',
  'D4',
  'F4',
  'G#4',
  'B4',
] as const;
type Sample = (typeof SAMPLES)[number];

/** Where the samples settle after the bow's attack and where they begin to fade. */
const LOOP_START_SECONDS = 0.9;
const LOOP_END_SECONDS = 2.2;
/** Blended across the loop point, so the jump back is inaudible. */
const LOOP_CROSSFADE_SECONDS = 0.4;
/** Every note blooms in slowly, so no entry is a surprise. */
const ATTACK_SECONDS = 0.35;
/**
 * How loud the chord is where the slide starts, as a share of its full level; it swells from there
 * to the end of the track in steps of loudness (decibels), like a bow pressing harder.
 */
const QUIET_LEVEL = 0.03;
/** Above 1 the swell lingers in the quiet and gathers most of its loudness near the end. */
const SWELL_CURVE = 1.7;
/** How quickly the loudness follows the thumb. */
const SWELL_SECONDS = 0.12;
/** How long the chord rings after a confirmed slide, and after a slide given up halfway. */
const CONFIRM_RELEASE_SECONDS = 1.8;
const CANCEL_RELEASE_SECONDS = 0.3;
/**
 * The chime of a confirmed slide: a struck bar, like a glockenspiel, two octaves above the chord's
 * top note. Partials of a bar are inharmonic, which is what makes it ring like metal.
 */
const CHIME_PARTIALS = [
  { ratio: 1, level: 1, decaySeconds: 1.4 },
  { ratio: 2.756, level: 0.3, decaySeconds: 0.5 },
  { ratio: 5.404, level: 0.12, decaySeconds: 0.2 },
] as const;
const CHIME_LEVEL = 0.32;
const CHIME_MAX_HZ = 2200;

/** MIDI number of a note like `C#3`; undefined for anything that is not a note. */
const midiOf = (note: string): number | undefined => {
  const match = /^([A-G]#?)(-?\d)$/.exec(note);
  if (match === null) return undefined;
  const nameIndex = (NOTE_NAMES as readonly string[]).indexOf(match[1] ?? '');
  return nameIndex === -1 ? undefined : (Number(match[2]) + 1) * 12 + nameIndex;
};

const SAMPLE_MIDI: ReadonlyMap<Sample, number> = new Map(
  SAMPLES.map((sample) => [sample, midiOf(sample)!]),
);

/** The shipped sample closest to `midi`, with how many semitones to shift it. */
const nearestSample = (midi: number): { readonly sample: Sample; readonly semitones: number } =>
  SAMPLES.map((sample) => ({ sample, semitones: midi - SAMPLE_MIDI.get(sample)! })).reduce(
    (best, candidate) =>
      Math.abs(candidate.semitones) < Math.abs(best.semitones) ? candidate : best,
  );

const sampleUrl = (sample: Sample) => `/audio/cello/${sample.replace('#', 's')}.mp3`;

// ---------------------------------------------------------------------------------------------
// Audio graph, created once per page

interface Graph {
  readonly context: AudioContext;
  /** Where the voices play into; carries the dry and the reverberated signal to the output. */
  readonly input: AudioNode;
}

let graph: Graph | undefined;
const buffers = new Map<Sample, Promise<AudioBuffer | undefined>>();

/**
 * A short hall: decaying noise, a little darker toward the end like a real room. It is generated,
 * so it costs no download.
 */
const impulseResponse = (context: AudioContext): AudioBuffer => {
  const seconds = 2.4;
  const length = Math.ceil(seconds * context.sampleRate);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (const channel of [0, 1]) {
    const data = impulse.getChannelData(channel);
    // Filling a sample buffer is one of the few places where writing in place is the only way.
    for (let frame = 0; frame < length; frame += 1) {
      const progress = frame / length;
      data[frame] = (Math.random() * 2 - 1) * (1 - progress) ** 3.5;
    }
  }
  return impulse;
};

const createGraph = (): Graph | undefined => {
  if (typeof AudioContext === 'undefined') return undefined;
  const context = new AudioContext();

  const input = context.createGain();
  // A soft ceiling, so a four-note chord on a loud phone never clips.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;
  // Rounds off the sample's edge, so the chord sits back a little like a cello in a room.
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 5500;
  tone.Q.value = 0.5;

  const reverb = context.createConvolver();
  reverb.buffer = impulseResponse(context);
  const wet = context.createGain();
  wet.gain.value = 0.35;
  const dry = context.createGain();
  dry.gain.value = 0.8;

  input.connect(tone);
  tone.connect(dry);
  tone.connect(reverb);
  reverb.connect(wet);
  dry.connect(limiter);
  wet.connect(limiter);
  limiter.connect(context.destination);
  return { context, input };
};

const getGraph = (): Graph | undefined => (graph ??= createGraph());

/**
 * Makes a sample loop seamlessly: the end of the loop is blended with the sound just before its
 * start, so jumping back lands on the same waveform.
 */
const loopable = (context: AudioContext, decoded: AudioBuffer): AudioBuffer => {
  const rate = decoded.sampleRate;
  const loopEnd = Math.min(LOOP_END_SECONDS, decoded.duration - 0.6);
  const loopStart = Math.min(LOOP_START_SECONDS, loopEnd - 0.5);
  const crossfade = Math.min(LOOP_CROSSFADE_SECONDS, loopStart);
  const endFrame = Math.floor(loopEnd * rate);
  const startFrame = Math.floor(loopStart * rate);
  const fadeFrames = Math.floor(crossfade * rate);
  const buffer = context.createBuffer(decoded.numberOfChannels, endFrame, rate);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const source = decoded.getChannelData(channel);
    const target = buffer.getChannelData(channel);
    target.set(source.subarray(0, endFrame));
    // Writing samples in place is how audio buffers are filled.
    for (let offset = 0; offset < fadeFrames; offset += 1) {
      const mix = offset / fadeFrames;
      const tail = endFrame - fadeFrames + offset;
      const head = startFrame - fadeFrames + offset;
      target[tail] = source[tail]! * (1 - mix) + source[head]! * mix;
    }
  }
  return buffer;
};

const loadSample = (sample: Sample): Promise<AudioBuffer | undefined> => {
  const cached = buffers.get(sample);
  if (cached !== undefined) return cached;
  const loading = (async () => {
    const audio = getGraph();
    if (audio === undefined) return undefined;
    try {
      const response = await fetch(sampleUrl(sample));
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const decoded = await audio.context.decodeAudioData(await response.arrayBuffer());
      return loopable(audio.context, decoded);
    } catch (error: unknown) {
      console.warn(`Cello sample ${sample} did not load`, error);
      buffers.delete(sample);
      return undefined;
    }
  })();
  buffers.set(sample, loading);
  return loading;
};

// ---------------------------------------------------------------------------------------------
// Chords

/** Names of the notes in a chord, like `['C3', 'G3', 'E4']`; unknown names are skipped. */
export type ChordNotes = readonly string[];

const voicesOf = (chord: ChordNotes) =>
  chord.flatMap((note) => {
    const midi = midiOf(note);
    return midi === undefined ? [] : [{ ...nearestSample(midi), midi }];
  });

/** Fetches and decodes the samples a chord needs, so the first slide does not wait for them. */
export const preloadChord = (chord: ChordNotes): void => {
  for (const voice of voicesOf(chord)) void loadSample(voice.sample);
};

export interface ChordPlayer {
  /**
   * How far the thumb is, 0 to 1. Note `k` of `n` sounds from `k * end / (n - 1)` on, the first one
   * from the start; sliding back silences the notes passed on the way. The chord also swells with
   * the thumb: barely there at the start, full at `end`.
   */
  readonly setProgress: (progress: number) => void;
  /** The slide reached the end: the chord rings out and a chime marks the choice. */
  readonly confirm: () => void;
  /** The slide was given up: the chord fades quickly. */
  readonly cancel: () => void;
}

const frequencyOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A short struck tone at `hertz`, into the same room as the chord. */
const chime = (audio: Graph, hertz: number) => {
  const { context } = audio;
  const now = context.currentTime;
  for (const partial of CHIME_PARTIALS) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = hertz * partial.ratio;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(CHIME_LEVEL * partial.level, now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0005, now + partial.decaySeconds);
    oscillator.connect(envelope);
    envelope.connect(audio.input);
    oscillator.start(now);
    oscillator.stop(now + partial.decaySeconds + 0.05);
  }
};

interface Voice {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

const startVoice = (
  audio: Graph,
  into: AudioNode,
  buffer: AudioBuffer,
  semitones: number,
  level: number,
): Voice => {
  const { context } = audio;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 2 ** (semitones / 12);
  source.loop = true;
  source.loopStart = Math.min(LOOP_START_SECONDS, buffer.duration - 0.5);
  source.loopEnd = buffer.duration;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(level, context.currentTime + ATTACK_SECONDS);
  source.connect(gain);
  gain.connect(into);
  source.start();
  return { gain, source };
};

const stopVoice = (audio: Graph, voice: Voice, seconds: number) => {
  const now = audio.context.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.exponentialRampToValueAtTime(0.0005, now + seconds);
  voice.source.stop(now + seconds + 0.05);
};

/**
 * Starts playing `chord` for one slide. Call it from a pointer event: browsers let a page make
 * sound only after a gesture. Returns a silent player when audio is unavailable.
 */
export const startChord = (chord: ChordNotes, end = 1): ChordPlayer => {
  const audio = getGraph();
  const voices = voicesOf(chord);
  if (audio === undefined || voices.length === 0)
    return { setProgress: () => undefined, confirm: () => undefined, cancel: () => undefined };
  void audio.context.resume();

  // Quieter voices in a fuller chord, so chords of any size are about as loud.
  const level = 0.9 / Math.sqrt(voices.length);
  // The whole chord passes through this: the thumb's position sets how loud it is.
  const swell = audio.context.createGain();
  swell.gain.value = QUIET_LEVEL;
  swell.connect(audio.input);
  const swellTo = (progress: number) => {
    const share = Math.min(Math.max(progress / end, 0), 1);
    const target = QUIET_LEVEL * (1 / QUIET_LEVEL) ** (share ** SWELL_CURVE);
    swell.gain.setTargetAtTime(target, audio.context.currentTime, SWELL_SECONDS);
  };
  // The chime sits two octaves over the chord's highest note, within a glockenspiel's range.
  const topMidi = Math.max(...voices.map((voice) => voice.midi));
  const chimeHertz = Math.min(frequencyOf(topMidi + 24), CHIME_MAX_HZ);
  const thresholds = voices.map((_voice, index) =>
    voices.length === 1 ? 0 : (index * end) / (voices.length - 1),
  );
  // The audio graph is stateful by nature: these track which notes sound right now.
  const playing = new Map<number, Voice>();
  const pending = new Set<number>();
  let released = false;

  const startNote = (index: number) => {
    if (pending.has(index) || playing.has(index)) return;
    pending.add(index);
    void loadSample(voices[index]!.sample).then((buffer) => {
      if (!pending.delete(index) || buffer === undefined) return;
      playing.set(index, startVoice(audio, swell, buffer, voices[index]!.semitones, level));
    });
  };
  const stopNote = (index: number, seconds: number) => {
    pending.delete(index);
    const voice = playing.get(index);
    if (voice === undefined) return;
    playing.delete(index);
    stopVoice(audio, voice, seconds);
  };
  const release = (seconds: number) => {
    released = true;
    for (const index of thresholds.keys()) stopNote(index, seconds);
  };

  return {
    setProgress: (progress) => {
      if (released) return;
      swellTo(progress);
      thresholds.forEach((threshold, index) => {
        // A little hysteresis, so a thumb resting on a threshold does not flutter.
        if (progress >= threshold) startNote(index);
        else if (progress < threshold - 0.04) stopNote(index, 0.25);
      });
    },
    confirm: () => {
      if (released) return;
      release(CONFIRM_RELEASE_SECONDS);
      chime(audio, chimeHertz);
    },
    cancel: () => release(CANCEL_RELEASE_SECONDS),
  };
};
