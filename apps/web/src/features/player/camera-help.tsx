type Platform =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'android-chrome'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-other'
  | 'other';

/**
 * The phone's system and browser, from the user agent. iPadOS says it is a Mac, so a Mac with a
 * touch screen counts as iOS. Every browser on iOS runs on Safari's engine, only the settings of
 * the app differ.
 */
const detectPlatform = (): Platform => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return 'android-samsung';
    if (/Firefox/.test(ua)) return 'android-firefox';
    if (/Chrome/.test(ua) && !/EdgA|OPR|YaBrowser|wv\)/.test(ua)) return 'android-chrome';
    return 'android-other';
  }
  return 'other';
};

/** Name of the browser app on iOS, as it is listed in the iPhone's Settings. */
const iosAppName = (): string => {
  const ua = navigator.userAgent;
  if (/FxiOS/.test(ua)) return 'Firefox';
  if (/EdgiOS/.test(ua)) return 'Edge';
  if (/OPiOS/.test(ua)) return 'Opera';
  if (/GSA\//.test(ua)) return 'Google';
  return 'svého prohlížeče';
};

const RETRY = 'Vraťte se sem a klepněte na **Zkusit znovu**.';
const RELOAD = 'Pokud se nic nestane, obnovte stránku a zkuste to znovu.';

const IOS_SYSTEM = (app: string) => [
  'Otevřete aplikaci **Nastavení** iPhonu.',
  `Sjeďte dolů na **Aplikace** a najděte **${app}**.`,
  'Zapněte **Kamera**.',
  RETRY,
];

const ANDROID_SYSTEM = (app: string) =>
  `Pořád nic? V **Nastavení** telefonu otevřete **Aplikace → ${app} → Oprávnění → Fotoaparát** a zvolte **Povolit**.`;

interface Help {
  readonly title: string;
  readonly steps: readonly string[];
  /** Shown under the steps, for when the browser itself is not allowed the camera. */
  readonly note?: string;
}

const helpFor = (platform: Platform): Help | undefined => {
  switch (platform) {
    case 'ios-safari':
      return {
        title: 'Jak povolit kameru v Safari',
        steps: [
          'Klepněte na ikonu **aA** (nebo ☰) vlevo v adresním řádku.',
          'Zvolte **Nastavení webové stránky**.',
          'U **Kamera** vyberte **Povolit**.',
          RETRY,
        ],
        note: 'Pořád nic? V **Nastavení** iPhonu otevřete **Aplikace → Safari → Kamera** a zvolte **Povolit**. Pak stránku obnovte.',
      };
    case 'ios-chrome':
      return { title: 'Jak povolit kameru v Chromu', steps: IOS_SYSTEM('Chrome'), note: RELOAD };
    case 'ios-other':
      return {
        title: 'Jak povolit kameru na iPhonu',
        steps: IOS_SYSTEM(iosAppName()),
        note: RELOAD,
      };
    case 'android-chrome':
      return {
        title: 'Jak povolit kameru v Chromu',
        steps: [
          'Klepněte na ikonu vlevo v adresním řádku (posuvníky nebo zámek).',
          'Zvolte **Oprávnění** a zapněte **Fotoaparát**.',
          RETRY,
        ],
        note: ANDROID_SYSTEM('Chrome'),
      };
    case 'android-samsung':
      return {
        title: 'Jak povolit kameru v Samsung Internetu',
        steps: [
          'Klepněte na ikonu zámku vlevo v adresním řádku.',
          'Zvolte **Oprávnění** (nebo **Nastavení webu**) a povolte **Fotoaparát**.',
          RETRY,
        ],
        note: ANDROID_SYSTEM('Samsung Internet'),
      };
    case 'android-firefox':
      return {
        title: 'Jak povolit kameru ve Firefoxu',
        steps: [
          'Klepněte na ikonu zámku vlevo v adresním řádku.',
          'U **Kamera** klepněte na **Blokováno** a změňte na **Povoleno**.',
          RETRY,
        ],
        note: ANDROID_SYSTEM('Firefox'),
      };
    case 'android-other':
      return {
        title: 'Jak povolit kameru na Androidu',
        steps: [
          'Klepněte na ikonu vlevo v adresním řádku a v oprávněních stránky povolte **Fotoaparát**.',
          RETRY,
        ],
        note: ANDROID_SYSTEM('váš prohlížeč'),
      };
    case 'other':
      break;
  }
  return undefined;
};

/** `**bold**` in a step, the only markup the steps use. */
const Rich = ({ text }: { text: string }) => (
  <>
    {text.split(/\*\*(.+?)\*\*/).map((part, index) =>
      index % 2 === 1 ? (
        <strong key={index} className='font-semibold text-foreground'>
          {part}
        </strong>
      ) : (
        part
      ),
    )}
  </>
);

/**
 * Steps that allow the camera after the player denied it, for the detected phone and browser.
 * Nothing on a computer or an unknown system; the short text above the steps covers that.
 */
export const CameraHelp = () => {
  const help = helpFor(detectPlatform());
  if (help === undefined) return null;
  return (
    <div className='flex w-full flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-left text-sm'>
      <h3 className='font-semibold'>{help.title}</h3>
      <ol className='flex flex-col gap-2'>
        {help.steps.map((step, index) => (
          <li key={index} className='flex gap-3 text-muted-foreground'>
            <span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background'>
              {index + 1}
            </span>
            <span>
              <Rich text={step} />
            </span>
          </li>
        ))}
      </ol>
      {help.note !== undefined && (
        <p className='text-muted-foreground'>
          <Rich text={help.note} />
        </p>
      )}
    </div>
  );
};

/** Whether `CameraHelp` has steps for this device. */
export const hasCameraHelp = () => helpFor(detectPlatform()) !== undefined;
