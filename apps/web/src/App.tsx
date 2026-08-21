import '@fontsource-variable/atkinson-hyperlegible-next'
import {
  createPracticePrompt,
  gradeSpelling,
  initialPracticeState,
  practiceReducer,
  summarizePracticePerformance,
  type AttemptCompletion,
  type AttemptSummary,
  type ExerciseSet,
  type PracticeDirection,
  type PracticeMode,
  type PracticePrompt,
  type PracticeWord,
  type PronunciationCheck,
  type PronunciationFeedback,
  type PronunciationScores,
  type PronunciationWordFeedback,
  type SpeechPace,
  type SkippedPracticeStep,
  type SpellingOutcome,
  type SpokenOutcome,
  type VocabularyEntry,
  type VocabularyLanguage,
} from '@vocabulary/domain'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Headphones,
  Languages,
  LockKeyhole,
  LogOut,
  Mic,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Speaker,
  Square,
  Trash2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { deleteExercise, listExercises, saveAttempt, saveExercise } from './data/database.js'
import {
  ApiError,
  assessPronunciation,
  createSession,
  getSession,
  logout,
  requestSpeech,
} from './lib/api.js'
import { PcmRecorder } from './lib/audio.js'
import {
  playPreparedSpeechBlob,
  PreparedSpeechAudio,
  speechAudioKey,
} from './lib/prepared-speech.js'

type View =
  | { name: 'library' }
  | { name: 'editor'; exercise?: ExerciseSet }
  | { name: 'setup'; exercise: ExerciseSet }
  | {
      name: 'practice'
      exercise: ExerciseSet
      direction: PracticeDirection
      mode: PracticeMode
    }
  | { name: 'results'; exercise: ExerciseSet; attempts: AttemptSummary[] }

type SessionState =
  | 'loading'
  | 'signed-out'
  | 'signed-in'
  | 'local-only'
  | 'unavailable'
  | 'expired'
  | 'storage-unavailable'

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function ShellHeader({
  onLogout,
  minimal = false,
}: {
  onLogout?: () => void
  minimal?: boolean
}) {
  return (
    <header className="cabinet-header">
      <div className="brand-lockup">
        <p className="brand-name">Vocabulary Voice Tutor</p>
      </div>
      {!minimal && onLogout ? (
        <button className="icon-button on-blue" type="button" onClick={onLogout} aria-label="Log out">
          <LogOut size={20} aria-hidden="true" />
        </button>
      ) : null}
    </header>
  )
}

function OfflineNotice({ online }: { online: boolean }) {
  if (online) {
    return null
  }
  return (
    <div className="offline-notice" role="status">
      <CircleAlert size={18} aria-hidden="true" />
      Your practice sets are still here. Listening and speaking need an internet connection.
    </div>
  )
}

function UpdateNotice() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const show = () => setReady(true)
    window.addEventListener('vocabulary-tutor:update-ready', show)
    void navigator.serviceWorker?.getRegistration().then((registration) => {
      if (registration?.waiting) {
        setReady(true)
      }
    })
    return () => window.removeEventListener('vocabulary-tutor:update-ready', show)
  }, [])

  if (!ready) {
    return null
  }
  return (
    <div className="update-notice" role="status">
      <span>A fresh version is ready.</span>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent('vocabulary-tutor:apply-update'))
        }
      >
        Update now
      </button>
    </div>
  )
}

function AccessScreen({
  state,
  onAuthenticated,
}: {
  state: Extract<SessionState, 'signed-out' | 'unavailable' | 'expired'>
  onAuthenticated: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(
    state === 'unavailable'
      ? 'The private speech service is not available right now.'
      : state === 'expired'
        ? 'Your 30-day session ended. Sign in again; your practice sets are still on this iPhone.'
        : null,
  )
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!code || submitting) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createSession(code)
      setCode('')
      onAuthenticated()
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) {
        const minutes = Math.max(1, Math.ceil((caught.retryAfterSeconds ?? 60) / 60))
        setError(`Too many tries. Wait about ${minutes} minute${minutes === 1 ? '' : 's'}, then try again.`)
      } else {
        setError('That code did not work. Check it and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell access-shell">
      <ShellHeader minimal />
      <main className="access-main">
        <section className="access-card" aria-labelledby="access-title">
          <LockKeyhole className="access-icon" size={30} aria-hidden="true" />
          <h1 id="access-title">Open your practice sets</h1>
          <p className="lede">
            Use your family access code. Your practice sets and practice history stay on this
            iPhone.
          </p>
          <form onSubmit={submit}>
            <label htmlFor="family-code">Family access code</label>
            <input
              id="family-code"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
              maxLength={256}
              disabled={submitting}
            />
            {error ? (
              <p className="form-error" role="alert">
                <CircleAlert size={18} aria-hidden="true" />
                {error}
              </p>
            ) : null}
            <button className="primary-button full-width" type="submit" disabled={!code || submitting}>
              {submitting ? 'Opening…' : 'Open tutor'}
              {!submitting ? <ChevronRight size={21} aria-hidden="true" /> : null}
            </button>
          </form>
        </section>
        <p className="privacy-note">
          <LockKeyhole size={15} aria-hidden="true" />
          Audio is used only for the current check and is then discarded.
        </p>
      </main>
    </div>
  )
}

function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-cabinet">
      <div className="empty-drawer" aria-hidden="true">
        <span>EN</span>
        <span>DE</span>
      </div>
      <h2>Your cabinet is empty</h2>
      <p>Add words or sentences for the next language lesson. You can change them at any time.</p>
      <button className="primary-button" type="button" onClick={onCreate}>
        <Plus size={20} aria-hidden="true" />
        Create first practice set
      </button>
    </section>
  )
}

function LibraryScreen({
  exercises,
  onCreate,
  onEdit,
  onPractice,
  onDelete,
  practiceAvailable,
}: {
  exercises: ExerciseSet[]
  onCreate: () => void
  onEdit: (exercise: ExerciseSet) => void
  onPractice: (exercise: ExerciseSet) => void
  onDelete: (exercise: ExerciseSet) => void
  practiceAvailable: boolean
}) {
  return (
    <main className="page-content">
      <div className="page-heading">
        <div>
          <h1>Practice sets</h1>
          <p>Choose a drawer to practise, or prepare a new one.</p>
        </div>
        <button className="primary-button compact" type="button" onClick={onCreate}>
          <Plus size={20} aria-hidden="true" />
          New list
        </button>
      </div>

      {exercises.length === 0 ? (
        <EmptyLibrary onCreate={onCreate} />
      ) : (
        <div className="drawer-grid">
          {exercises.map((exercise) => (
            <article className="drawer-card" key={exercise.id}>
              <div className="drawer-labels">
                <span>EN</span>
                <Languages size={18} aria-hidden="true" />
                <span>DE</span>
              </div>
              <h2>{exercise.name}</h2>
              <p>
                {exercise.entries.length} {exercise.entries.length === 1 ? 'item' : 'items'}
              </p>
              <div className="drawer-ruler" aria-hidden="true">
                {Array.from({ length: 9 }, (_, tick) => (
                  <span key={tick} />
                ))}
              </div>
              <button
                className="primary-button full-width"
                type="button"
                onClick={() => onPractice(exercise)}
                disabled={exercise.entries.length === 0 || !practiceAvailable}
                title={
                  practiceAvailable
                    ? undefined
                    : 'Sign in while online to use listening and speaking practice.'
                }
              >
                <BookOpen size={20} aria-hidden="true" />
                Practise this set
              </button>
              <div className="drawer-actions">
                <button className="text-button" type="button" onClick={() => onEdit(exercise)}>
                  <Settings2 size={17} aria-hidden="true" />
                  Edit
                </button>
                <button className="text-button danger" type="button" onClick={() => onDelete(exercise)}>
                  <Trash2 size={17} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}

function blankEntry(): VocabularyEntry {
  const now = new Date().toISOString()
  return { id: makeId('word'), english: '', german: '', createdAt: now, updatedAt: now }
}

function ExerciseEditor({
  existing,
  onCancel,
  onSaved,
}: {
  existing?: ExerciseSet
  onCancel: () => void
  onSaved: (exercise: ExerciseSet) => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [entries, setEntries] = useState<VocabularyEntry[]>(
    existing?.entries.length ? existing.entries : [blankEntry()],
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function changeEntry(id: string, field: 'english' | 'german', value: string) {
    const now = new Date().toISOString()
    const singleLineValue = value
      .replaceAll('\r', ' ')
      .replaceAll('\n', ' ')
      .replaceAll('\t', ' ')
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: singleLineValue, updatedAt: now } : entry,
      ),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()
    const completeEntries = entries.filter((entry) => entry.english.trim() || entry.german.trim())
    if (!cleanName) {
      setError('Give this practice set a name.')
      return
    }
    if (completeEntries.length === 0) {
      setError('Add at least one English and German item.')
      return
    }
    if (completeEntries.some((entry) => !entry.english.trim() || !entry.german.trim())) {
      setError('Complete both sides of every item.')
      return
    }

    setSaving(true)
    setError(null)
    const now = new Date().toISOString()
    const exercise: ExerciseSet = {
      id: existing?.id ?? makeId('set'),
      name: cleanName,
      entries: completeEntries.map((entry) => ({
        ...entry,
        english: entry.english.normalize('NFC').trim(),
        german: entry.german.normalize('NFC').trim(),
        updatedAt: now,
      })),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await saveExercise(exercise)
      onSaved(exercise)
    } catch {
      setError('This practice set could not be saved on the iPhone. Check available storage and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page-content narrow-page">
      <button className="back-button" type="button" onClick={onCancel}>
        <ArrowLeft size={19} aria-hidden="true" />
        Practice sets
      </button>
      <div className="page-heading">
        <div>
          <h1>{existing ? 'Edit practice set' : 'Build a practice set'}</h1>
          <p>Add a word or one complete sentence in each language.</p>
        </div>
      </div>
      <form className="editor-form" onSubmit={submit}>
        <div className="field-group">
          <label htmlFor="set-name">Practice set name</label>
          <input
            id="set-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="For example: Unit 4"
            maxLength={80}
          />
        </div>

        <div className="word-table-heading" aria-hidden="true">
          <span>English</span>
          <span>German</span>
        </div>
        <div className="word-rows">
          {entries.map((entry, index) => (
            <fieldset className="word-row" key={entry.id}>
              <legend>Item {index + 1}</legend>
              <span className="row-number">{String(index + 1).padStart(2, '0')}</span>
              <label>
                <span>English</span>
                <textarea
                  lang="en-US"
                  value={entry.english}
                  onChange={(event) => changeEntry(entry.id, 'english', event.target.value)}
                  maxLength={120}
                  rows={4}
                  placeholder="English word or sentence"
                />
              </label>
              <label>
                <span>German</span>
                <textarea
                  lang="de-DE"
                  value={entry.german}
                  onChange={(event) => changeEntry(entry.id, 'german', event.target.value)}
                  maxLength={120}
                  rows={4}
                  placeholder="German word or sentence"
                />
              </label>
              <button
                className="icon-button remove-row"
                type="button"
                aria-label={`Remove item ${index + 1}`}
                onClick={() =>
                  setEntries((current) =>
                    current.length === 1 ? [blankEntry()] : current.filter((item) => item.id !== entry.id),
                  )
                }
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </fieldset>
          ))}
        </div>
        <button className="secondary-button add-row" type="button" onClick={() => setEntries((items) => [...items, blankEntry()])}>
          <Plus size={19} aria-hidden="true" />
          Add another item
        </button>

        {error ? (
          <p className="form-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            {error}
          </p>
        ) : null}
        <div className="sticky-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={19} aria-hidden="true" />
            {saving ? 'Saving…' : 'Save practice set'}
          </button>
        </div>
      </form>
    </main>
  )
}

function PracticeSetup({
  exercise,
  onBack,
  onStart,
}: {
  exercise: ExerciseSet
  onBack: () => void
  onStart: (direction: PracticeDirection, mode: PracticeMode) => void
}) {
  const [direction, setDirection] = useState<PracticeDirection>('mixed')
  const [mode, setMode] = useState<PracticeMode>('learn')

  return (
    <main className="page-content narrow-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={19} aria-hidden="true" />
        Practice sets
      </button>
      <div className="page-heading">
        <div>
          <h1>{exercise.name}</h1>
          <p>
            {exercise.entries.length}{' '}
            {exercise.entries.length === 1
              ? 'item is ready.'
              : 'items are ready.'}
          </p>
        </div>
      </div>
      <div className="setup-sheet">
        <fieldset className="choice-group">
          <legend>Choose a mode</legend>
          <label className={mode === 'learn' ? 'choice-card selected' : 'choice-card'}>
            <input type="radio" name="mode" value="learn" checked={mode === 'learn'} onChange={() => setMode('learn')} />
            <BookOpen size={24} aria-hidden="true" />
            <span>
              <strong>Learn</strong>
              <small>Hear the cue, practise English speech, then write.</small>
            </span>
            <Check size={20} className="choice-check" aria-hidden="true" />
          </label>
          <label className={mode === 'test' ? 'choice-card selected' : 'choice-card'}>
            <input type="radio" name="mode" value="test" checked={mode === 'test'} onChange={() => setMode('test')} />
            <LockKeyhole size={24} aria-hidden="true" />
            <span>
              <strong>Test</strong>
              <small>Get exact pronunciation hints without numeric scores.</small>
            </span>
            <Check size={20} className="choice-check" aria-hidden="true" />
          </label>
        </fieldset>

        <fieldset className="choice-group direction-group">
          <legend>Choose a direction</legend>
          {[
            {
              value: 'english-to-german',
              label: 'English → German',
              detail: 'Hear English; speak English; write German and English.',
            },
            {
              value: 'german-to-english',
              label: 'German → English',
              detail: 'Hear German; speak and write the English translation.',
            },
            {
              value: 'mixed',
              label: 'Mix both directions',
              detail: 'Switch the audio cue while keeping English as the focus.',
            },
          ].map(({ value, label, detail }) => (
            <label className={direction === value ? 'line-choice selected' : 'line-choice'} key={value}>
              <input
                type="radio"
                name="direction"
                value={value}
                checked={direction === value}
                onChange={() => setDirection(value as PracticeDirection)}
              />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <Check size={18} aria-hidden="true" />
            </label>
          ))}
        </fieldset>

        <button className="primary-button full-width large-button" type="button" onClick={() => onStart(direction, mode)}>
          Start {mode === 'learn' ? 'learning' : 'test'}
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
    </main>
  )
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]!
    shuffled[swapIndex] = current!
  }
  return shuffled
}

function makePrompts(exercise: ExerciseSet, direction: PracticeDirection): PracticePrompt[] {
  return shuffle(
    exercise.entries.map((entry) => {
      const resolvedDirection: Exclude<PracticeDirection, 'mixed'> =
        direction === 'mixed'
          ? Math.random() < 0.5
            ? 'english-to-german'
            : 'german-to-english'
          : direction
      return createPracticePrompt(entry, resolvedDirection)
    }),
  )
}

const spokenMessages: Record<SpokenOutcome, string> = {
  correct: 'That sounded right.',
  'different-word': 'That did not match the expected English answer.',
  'pronunciation-retry': 'That needs one more try.',
  'no-speech': 'No clear speech was heard. You can try again.',
  'low-confidence': 'The recording was not clear enough to judge. Try again in a quieter spot.',
  'service-unavailable': 'Speaking feedback is unavailable right now. Try again in a moment.',
}

const pronunciationCheckLabels: Record<PronunciationCheck, string> = {
  overall: 'Overall pronunciation',
  accuracy: 'Sound accuracy',
  fluency: 'Smooth speaking',
  completeness: 'Complete answer',
  prosody: 'Rhythm and stress',
  minimumWord: 'Lowest word score',
}

const soundPositionLabels = {
  start: 'first',
  middle: 'middle',
  end: 'last',
} as const

interface SoundCoach {
  label: string
  example: string
  tip: string
}

const soundCoaches: Record<string, SoundCoach> = {
  p: {
    label: 'the “p” sound',
    example: 'pen',
    tip: 'Close your lips, hold a little air, then pop them open. Keep your voice off.',
  },
  b: {
    label: 'the “b” sound',
    example: 'bed',
    tip: 'Close your lips, then open them while your voice is buzzing.',
  },
  t: {
    label: 'the “t” sound',
    example: 'top',
    tip: 'Touch just behind your top teeth with your tongue, then release the air.',
  },
  d: {
    label: 'the “d” sound',
    example: 'dog',
    tip: 'Touch just behind your top teeth with your tongue, then release it with your voice on.',
  },
  k: {
    label: 'the “k” sound',
    example: 'key',
    tip: 'Lift the back of your tongue, briefly stop the air, then release it without your voice.',
  },
  g: {
    label: 'the hard “g” sound',
    example: 'go',
    tip: 'Lift the back of your tongue, briefly stop the air, then release it with your voice on.',
  },
  f: {
    label: 'the “f” sound',
    example: 'fish',
    tip: 'Rest your top teeth on your lower lip and blow air. Keep your voice off.',
  },
  v: {
    label: 'the “v” sound',
    example: 'very',
    tip: 'Rest your top teeth on your lower lip and let your voice buzz.',
  },
  θ: {
    label: 'the quiet “th” sound',
    example: 'think',
    tip: 'Put your tongue lightly between your teeth and blow air. Keep your voice off.',
  },
  ð: {
    label: 'the buzzing “th” sound',
    example: 'this',
    tip: 'Put your tongue lightly between your teeth and turn your voice on.',
  },
  s: {
    label: 'the “s” sound',
    example: 'sun',
    tip: 'Keep your tongue just behind your top teeth and blow a thin stream of air.',
  },
  z: {
    label: 'the “z” sound',
    example: 'zoo',
    tip: 'Make the “s” shape, then turn your voice on so it buzzes.',
  },
  ʃ: {
    label: 'the “sh” sound',
    example: 'ship',
    tip: 'Round your lips a little and blow air down the middle of your tongue.',
  },
  ʒ: {
    label: 'the soft sound in “vision”',
    example: 'vision',
    tip: 'Make a gentle “sh” shape and turn your voice on.',
  },
  tʃ: {
    label: 'the “ch” sound',
    example: 'chair',
    tip: 'Start with a quick “t”, then release it into “sh”.',
  },
  dʒ: {
    label: 'the “j” sound',
    example: 'jump',
    tip: 'Start with a quick “d”, then release it with your voice on.',
  },
  h: {
    label: 'the “h” sound',
    example: 'hat',
    tip: 'Breathe the sound out gently, as if warming your hands.',
  },
  m: {
    label: 'the “m” sound',
    example: 'moon',
    tip: 'Close your lips and hum through your nose.',
  },
  n: {
    label: 'the “n” sound',
    example: 'nose',
    tip: 'Touch behind your top teeth with your tongue and let your voice flow through your nose.',
  },
  ŋ: {
    label: 'the “ng” sound',
    example: 'sing',
    tip: 'Lift the back of your tongue and let your voice flow through your nose.',
  },
  l: {
    label: 'the “l” sound',
    example: 'light',
    tip: 'Touch just behind your top teeth with the tip of your tongue and use your voice.',
  },
  ɹ: {
    label: 'the English “r” sound',
    example: 'red',
    tip: 'Lift your tongue without touching the roof of your mouth and round your lips a little.',
  },
  w: {
    label: 'the “w” sound',
    example: 'we',
    tip: 'Round your lips tightly, then open them as you start the word.',
  },
  j: {
    label: 'the “y” sound',
    example: 'yes',
    tip: 'Lift the middle of your tongue close to the roof of your mouth, then glide into the vowel.',
  },
  i: {
    label: 'the long “ee” sound',
    example: 'see',
    tip: 'Smile slightly and keep your tongue high near the front of your mouth.',
  },
  ɪ: {
    label: 'the short “i” sound',
    example: 'sit',
    tip: 'Relax your mouth and say a short, light vowel.',
  },
  eɪ: {
    label: 'the long “a” sound',
    example: 'day',
    tip: 'Start with “eh” and glide gently toward “ee”.',
  },
  ɛ: {
    label: 'the short “e” sound',
    example: 'bed',
    tip: 'Open your mouth a little and keep your tongue relaxed near the front.',
  },
  æ: {
    label: 'the short “a” sound',
    example: 'cat',
    tip: 'Open your mouth wider and keep your tongue low near the front.',
  },
  ɑ: {
    label: 'the open “ah” sound',
    example: 'father',
    tip: 'Open your mouth and keep your tongue low and relaxed.',
  },
  ɔ: {
    label: 'the “aw” sound',
    example: 'law',
    tip: 'Round your lips a little and keep the sound open.',
  },
  oʊ: {
    label: 'the long “o” sound',
    example: 'go',
    tip: 'Round your lips and let the sound glide gently toward “oo”.',
  },
  ʊ: {
    label: 'the short “oo” sound',
    example: 'book',
    tip: 'Round your lips loosely and keep the sound short.',
  },
  u: {
    label: 'the long “oo” sound',
    example: 'moon',
    tip: 'Round your lips and keep your tongue high near the back.',
  },
  ʌ: {
    label: 'the short “u” sound',
    example: 'cup',
    tip: 'Keep your mouth relaxed and make a short sound from the middle.',
  },
  ə: {
    label: 'the quick “uh” sound',
    example: 'about',
    tip: 'Relax your mouth and make this sound very short and light.',
  },
  ɝ: {
    label: 'the “er” sound',
    example: 'bird',
    tip: 'Lift your tongue without touching the roof of your mouth and keep your voice on.',
  },
  ɚ: {
    label: 'the soft “er” sound',
    example: 'teacher',
    tip: 'Keep the sound short, with your tongue lifted and your voice on.',
  },
  aɪ: {
    label: 'the long “i” sound',
    example: 'my',
    tip: 'Start with an open mouth and glide toward a small smile.',
  },
  aʊ: {
    label: 'the “ow” sound',
    example: 'now',
    tip: 'Start with an open mouth and glide toward rounded lips.',
  },
  ɔɪ: {
    label: 'the “oy” sound',
    example: 'boy',
    tip: 'Start with rounded lips and glide toward a small smile.',
  },
}

function soundCoach(phoneme: string): SoundCoach | undefined {
  const normalized = phoneme
    .normalize('NFC')
    .replaceAll('ɡ', 'g')
    .replaceAll('r', 'ɹ')
    .replaceAll('t͡ʃ', 'tʃ')
    .replaceAll('d͡ʒ', 'dʒ')
    .replace(/[ˈˌː.]/gu, '')
  return soundCoaches[normalized]
}

function feedbackHint(feedback: PronunciationFeedback): string {
  if (feedback.errors.includes('monotone')) {
    return 'The whole answer sounded too flat. Copy the model’s rise and fall more closely.'
  }
  if (feedback.failedChecks.includes('prosody')) {
    return 'Copy the model answer’s rhythm, stress, and rise and fall more closely.'
  }
  if (feedback.problemWords.length > 0) {
    return feedback.problemWords.length === 1
      ? 'Try the tip below, then say the complete answer again.'
      : 'Try each tip below, then say the complete answer again.'
  }
  if (feedback.errors.includes('omission')) {
    return 'A sound or word was left out. Say the whole answer from beginning to end.'
  }
  if (feedback.errors.includes('insertion')) {
    return 'An extra sound or word was heard. Listen again, then copy only the answer.'
  }
  if (feedback.errors.includes('mispronunciation')) {
    return 'Listen to the model, practise the marked word slowly, then try the full answer again.'
  }
  if (feedback.failedChecks.includes('completeness')) {
    return 'Say the whole answer from beginning to end.'
  }
  if (
    feedback.failedChecks.includes('fluency') ||
    feedback.errors.includes('unexpected-break') ||
    feedback.errors.includes('missing-break')
  ) {
    return 'Say it smoothly, without a long pause in the middle.'
  }
  if (
    feedback.failedChecks.includes('accuracy') ||
    feedback.failedChecks.includes('minimumWord')
  ) {
    return 'Listen again and match each sound more closely.'
  }
  return 'Listen again, then say the answer a little more clearly.'
}

function problemWordMessages(problem: PronunciationWordFeedback): string[] {
  const messages: string[] = []
  for (const error of problem.errors) {
    if (error === 'omission') {
      messages.push('This word was missing. Add it when you say the full answer again.')
    } else if (error === 'insertion') {
      messages.push('This was an extra word. Leave it out on the next try.')
    } else if (error === 'unexpected-break') {
      messages.push('You paused before this word. Join it smoothly to the word before it.')
    } else if (error === 'missing-break') {
      messages.push('Take a tiny pause before this word.')
    } else if (error === 'mispronunciation' && !problem.weakestSound) {
      messages.push('Listen for this word in the model answer, say it slowly once, then try the full answer.')
    }
  }
  const skippedOrInserted =
    problem.errors.includes('omission') || problem.errors.includes('insertion')
  if (problem.weakestSound && !skippedOrInserted) {
    const expected = soundCoach(problem.weakestSound.expected)
    const heard = problem.weakestSound.heard
      ? soundCoach(problem.weakestSound.heard)
      : undefined
    if (expected) {
      messages.push(`Try ${expected.label}, like in “${expected.example}”.`)
      if (heard) {
        messages.push(`It sounded closer to ${heard.label}, like in “${heard.example}”. ${expected.tip}`)
      } else {
        messages.push(expected.tip)
      }
    } else {
      const location = problem.weakestSound.position
        ? `the ${soundPositionLabels[problem.weakestSound.position]} sound`
        : 'this sound'
      messages.push(
        `Listen for ${location} in “${problem.word}”. Say the word slowly, then try the full answer.`,
      )
    }
  }
  if (messages.length === 0) {
    messages.push('This word needs a clearer pronunciation.')
  }
  return messages
}

function checkScore(
  scores: PronunciationScores,
  check: PronunciationCheck,
): number | null {
  return scores[check]
}

function PronunciationDetails({
  outcome,
  feedback,
  mode,
}: {
  outcome: SpokenOutcome
  feedback: PronunciationFeedback | null
  mode: PracticeMode
}) {
  if (!feedback) {
    return null
  }
  const scores = feedback.scores
  if (outcome === 'correct') {
    return scores && mode === 'learn' ? (
      <small>English pronunciation: {Math.round(scores.overall)} / 100</small>
    ) : null
  }
  if (outcome !== 'pronunciation-retry' && outcome !== 'different-word') {
    return null
  }

  return (
    <>
      <p className="speech-guidance">{feedbackHint(feedback)}</p>
      {feedback.problemWords.length > 0 ? (
        <div className="speech-problem-sheet">
          <small>{feedback.problemWords.length === 1 ? 'Word to fix' : 'Words to fix'}</small>
          <ol className="speech-problem-list">
            {feedback.problemWords.map((problem) => (
              <li key={`${problem.index}-${problem.word}-${problem.errors.join('-') || 'score'}`}>
                <div className="speech-problem-heading">
                  <strong>{problem.word}</strong>
                  <span>Word {problem.index + 1}</span>
                </div>
                {problemWordMessages(problem).map((message) => (
                  <p key={message}>{message}</p>
                ))}
                {mode === 'learn' ? (
                  <small>Word match: {Math.round(problem.accuracyScore)} / 100</small>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {scores && feedback.failedChecks.length > 0 && mode === 'learn' ? (
        <div className="speech-score-sheet">
          <small>Each check needs 80 / 100.</small>
          <dl className="speech-score-list">
            {feedback.failedChecks.map((check) => (
              <div className="speech-score-row" key={check}>
                <dt>{pronunciationCheckLabels[check]}</dt>
                <dd>
                  {checkScore(scores, check) === null
                    ? 'Not available'
                    : `${Math.round(checkScore(scores, check) ?? 0)} / 100`}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </>
  )
}

const languageNames: Record<VocabularyLanguage, string> = {
  english: 'English',
  german: 'German',
}

type SpeechAudioStatus = 'idle' | 'loading' | 'ready' | 'error'

function emptySpellingAnswers(): Record<VocabularyLanguage, string> {
  return { english: '', german: '' }
}

function clientErrorDiagnostic(error: unknown): string {
  if (error instanceof ApiError) {
    return `api-${error.status}:${error.message}`
  }
  if (error instanceof Error) {
    return error.name
  }
  return 'unknown'
}

function SpellingFeedback({
  word,
  outcome,
}: {
  word: PracticeWord
  outcome: SpellingOutcome
}) {
  const language = languageNames[word.language]

  return (
    <div className={`spelling-result result-${outcome}`}>
      {outcome === 'correct' ? (
        <>
          <Check size={22} aria-hidden="true" />
          <strong>{language} spelling correct</strong>
        </>
      ) : outcome === 'minor-typo' ? (
        <>
          <CircleAlert size={22} aria-hidden="true" />
          <div>
            <strong>Almost right in {language}</strong>
            <p>There is one small typo. Fix it, then check again.</p>
          </div>
        </>
      ) : (
        <>
          <RotateCcw size={22} aria-hidden="true" />
          <div>
            <strong>Try the {language} answer again</strong>
            <p>The correct answer stays hidden until this is right or you skip the item.</p>
          </div>
        </>
      )}
    </div>
  )
}

function PracticeScreen({
  exercise,
  direction,
  mode,
  online,
  onExit,
  onComplete,
  onSessionExpired,
}: {
  exercise: ExerciseSet
  direction: PracticeDirection
  mode: PracticeMode
  online: boolean
  onExit: () => void
  onComplete: (attempts: AttemptSummary[]) => void
  onSessionExpired: () => void
}) {
  const prompts = useMemo(() => makePrompts(exercise, direction), [exercise, direction])
  const [state, dispatch] = useReducer(practiceReducer, initialPracticeState(prompts.length, mode))
  const [spokenOutcome, setSpokenOutcome] = useState<SpokenOutcome | null>(null)
  const [spokenFeedback, setSpokenFeedback] = useState<PronunciationFeedback | null>(null)
  const [spelling, setSpelling] = useState(emptySpellingAnswers)
  const [spellingOutcomes, setSpellingOutcomes] = useState<
    Partial<Record<VocabularyLanguage, SpellingOutcome>>
  >({})
  const [hasCheckedSpelling, setHasCheckedSpelling] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [currentAttempt, setCurrentAttempt] = useState<AttemptSummary | null>(null)
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [playingPace, setPlayingPace] = useState<SpeechPace | null>(null)
  const [preparingRecorder, setPreparingRecorder] = useState(false)
  const [cueAudioError, setCueAudioError] = useState<string | null>(null)
  const [modelAudioError, setModelAudioError] = useState<string | null>(null)
  const [cueAudioStatus, setCueAudioStatus] = useState<SpeechAudioStatus>('idle')
  const [modelAudioStatus, setModelAudioStatus] = useState<
    Record<SpeechPace, SpeechAudioStatus>
  >({ normal: 'idle', slow: 'idle' })
  const recorder = useRef<PcmRecorder | null>(null)
  const stopTimer = useRef<number | null>(null)
  const completed = useRef(false)
  const attemptRecorded = useRef(false)
  const currentAttemptId = useRef<string | null>(null)
  const [preparedSpeechAudio] = useState(
    () => new PreparedSpeechAudio(requestSpeech),
  )
  const prompt = prompts[state.itemIndex]!
  const cue = prompt.words[prompt.cueLanguage]
  const spokenAnswer = prompt.words[prompt.spokenLanguage]
  const currentCueAudioKey = useRef('')
  const currentModelAudioKeys = useRef<Record<SpeechPace, string>>({
    normal: '',
    slow: '',
  })
  currentCueAudioKey.current = speechAudioKey(cue, 'normal')
  currentModelAudioKeys.current = {
    normal: speechAudioKey(spokenAnswer, 'normal'),
    slow: speechAudioKey(spokenAnswer, 'slow'),
  }
  const playing = playingPace !== null
  const canHearModel =
    spokenOutcome === 'pronunciation-retry' || spokenOutcome === 'different-word'

  const prepareWordAudio = useCallback(
    (word: PracticeWord, pace: SpeechPace): Promise<Blob> =>
      preparedSpeechAudio.prepare(word, pace),
    [preparedSpeechAudio],
  )

  const prepareCueAudio = useCallback(async () => {
    if (!online) {
      setCueAudioStatus('idle')
      return
    }
    const key = speechAudioKey(cue, 'normal')
    setCueAudioError(null)
    setCueAudioStatus('loading')
    try {
      await prepareWordAudio(cue, 'normal')
      if (currentCueAudioKey.current === key) {
        setCueAudioStatus('ready')
      }
    } catch (caught) {
      console.error(
        'pronunciation-check-failed',
        clientErrorDiagnostic(caught),
      )
      if (caught instanceof ApiError && caught.status === 401) {
        onSessionExpired()
        return
      }
      setCueAudioStatus('error')
      setCueAudioError(
        'The cue could not be prepared. Check the connection, then load it again.',
      )
    }
  }, [cue, online, onSessionExpired, prepareWordAudio])

  const prepareModelAudio = useCallback(
    async (pace: SpeechPace) => {
      if (!online || !canHearModel) {
        return
      }
      const key = speechAudioKey(spokenAnswer, pace)
      setModelAudioError(null)
      setModelAudioStatus((current) => ({ ...current, [pace]: 'loading' }))
      try {
        await prepareWordAudio(spokenAnswer, pace)
        if (currentModelAudioKeys.current[pace] === key) {
          setModelAudioStatus((current) => ({ ...current, [pace]: 'ready' }))
        }
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          onSessionExpired()
          return
        }
        setModelAudioStatus((current) => ({ ...current, [pace]: 'error' }))
        setModelAudioError(
          'The model audio could not be prepared. Check the connection, then load it again.',
        )
      }
    },
    [canHearModel, online, onSessionExpired, prepareWordAudio, spokenAnswer],
  )

  useEffect(
    () => () => {
      if (stopTimer.current !== null) {
        window.clearTimeout(stopTimer.current)
      }
      if (recorder.current) {
        void recorder.current.stop().catch(() => undefined)
      }
      preparedSpeechAudio.clear()
    },
    [preparedSpeechAudio],
  )

  useEffect(() => {
    void prepareCueAudio()
  }, [prepareCueAudio])

  useEffect(() => {
    if (!canHearModel || !online) {
      setModelAudioStatus({ normal: 'idle', slow: 'idle' })
      return
    }
    void prepareModelAudio('normal')
    void prepareModelAudio('slow')
  }, [canHearModel, online, prepareModelAudio])

  useEffect(() => {
    if (state.phase === 'complete' && !completed.current) {
      completed.current = true
      onComplete(attempts)
    }
  }, [attempts, onComplete, state.phase])

  function playPreparedWord(word: PracticeWord, pace: SpeechPace): Promise<void> {
    const blob = preparedSpeechAudio.get(word, pace)
    if (!blob) {
      return Promise.reject(new Error('Speech audio is not prepared'))
    }
    return playPreparedSpeechBlob(blob)
  }

  async function playCue() {
    if (!online || playing) {
      return
    }
    if (cueAudioStatus !== 'ready') {
      void prepareCueAudio()
      return
    }
    const changesState = state.phase === 'ready'
    if (changesState) {
      dispatch({ type: 'PLAY' })
    }
    setPlayingPace('normal')
    try {
      await playPreparedWord(cue, 'normal')
      if (changesState) {
        dispatch({ type: 'PLAY_FINISHED' })
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onSessionExpired()
        return
      }
      dispatch({ type: 'FAIL', message: 'The audio cue could not be played. Check the connection and try again.' })
    } finally {
      setPlayingPace(null)
    }
  }

  async function playModelWord(pace: SpeechPace) {
    if (!online || playing) {
      return
    }
    if (modelAudioStatus[pace] !== 'ready') {
      void prepareModelAudio(pace)
      return
    }
    setModelAudioError(null)
    setPlayingPace(pace)
    try {
      await playPreparedWord(spokenAnswer, pace)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onSessionExpired()
        return
      }
      setModelAudioError(
        'The model answer could not be played. Check the connection and try again.',
      )
    } finally {
      setPlayingPace(null)
    }
  }

  async function finishRecording() {
    const activeRecorder = recorder.current
    if (!activeRecorder) {
      return
    }
    recorder.current = null
    if (stopTimer.current !== null) {
      window.clearTimeout(stopTimer.current)
      stopTimer.current = null
    }
    dispatch({ type: 'RECORDED' })
    try {
      const audio = await activeRecorder.stop()
      const result = await assessPronunciation(
        audio,
        spokenAnswer.text,
        spokenAnswer.locale,
        mode,
      )
      setSpokenOutcome(result.outcome)
      setSpokenFeedback({
        scores: result.scores,
        failedChecks: result.failedChecks,
        errors: result.errors,
        problemWords: result.problemWords,
      })
      const passed = result.outcome === 'correct'
      if (!passed) {
        setRetryCount((current) => current + 1)
      }
      dispatch({ type: 'SPEECH_FINISHED', passed })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onSessionExpired()
        return
      }
      const message =
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Microphone access is off. Allow it in Safari settings, then try again.'
          : 'The recording could not be checked. Nothing was saved; please try again.'
      dispatch({ type: 'FAIL', message })
    }
  }

  async function startRecording() {
    if (
      !online ||
      preparingRecorder ||
      (state.phase !== 'ready' && state.phase !== 'speech-retry') ||
      !state.hasListened
    ) {
      return
    }
    setSpelling(emptySpellingAnswers())
    setSpellingOutcomes({})
    setHasCheckedSpelling(false)
    setModelAudioError(null)
    setPreparingRecorder(true)
    try {
      const preparedRecorder = await PcmRecorder.start()
      recorder.current = preparedRecorder
      dispatch({ type: 'RECORD' })
      stopTimer.current = window.setTimeout(() => void finishRecording(), recorder.current.remainingMs)
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Microphone access is off. Allow it in Safari settings, then try again.'
          : 'The microphone could not start. Check Safari settings and try again.'
      dispatch({ type: 'FAIL', message })
    } finally {
      setPreparingRecorder(false)
    }
  }

  function recordAttempt(
    completion: AttemptCompletion,
    outcomes: Partial<Record<VocabularyLanguage, SpellingOutcome>>,
    skippedAt?: SkippedPracticeStep,
  ) {
    if (attemptRecorded.current) {
      return
    }
    attemptRecorded.current = true
    const attempt: AttemptSummary = {
      id: makeId('attempt'),
      exerciseId: exercise.id,
      entryId: prompt.entryId,
      mode,
      direction: prompt.direction,
      ...(spokenOutcome ? { spokenOutcome } : {}),
      ...(outcomes.english ? { spellingOutcome: outcomes.english } : {}),
      ...(outcomes.german ? { germanSpellingOutcome: outcomes.german } : {}),
      completion,
      retryCount,
      ...(skippedAt ? { skippedAt } : {}),
      attemptedAt: new Date().toISOString(),
    }
    currentAttemptId.current = attempt.id
    setCurrentAttempt(attempt)
    setAttempts((current) => [...current, attempt])
    setStorageWarning(null)
    void saveAttempt(attempt).catch(() => {
      if (currentAttemptId.current === attempt.id) {
        setStorageWarning(
          'This attempt could not be added to local history, but you can keep practising.',
        )
      }
    })
  }

  function skipWord(skippedAt: SkippedPracticeStep) {
    recordAttempt('skipped', spellingOutcomes, skippedAt)
    dispatch({ type: 'SKIP' })
  }

  function submitSpelling(event: FormEvent) {
    event.preventDefault()
    if (
      !spokenOutcome ||
      prompt.spellingLanguages.some((language) => !spelling[language].trim())
    ) {
      return
    }
    const englishGrade = gradeSpelling(
      spelling.english,
      prompt.words.english.text,
      prompt.words.english.locale,
    )
    const germanGrade = prompt.spellingLanguages.includes('german')
      ? gradeSpelling(
          spelling.german,
          prompt.words.german.text,
          prompt.words.german.locale,
        )
      : undefined
    const outcomes: Partial<Record<VocabularyLanguage, SpellingOutcome>> = {
      english: englishGrade.outcome,
      ...(germanGrade ? { german: germanGrade.outcome } : {}),
    }
    setHasCheckedSpelling(true)
    setSpellingOutcomes(outcomes)
    const passed = prompt.spellingLanguages.every(
      (language) => outcomes[language] === 'correct',
    )
    if (!passed) {
      setRetryCount((current) => current + 1)
      dispatch({ type: 'SPELLING_SUBMITTED', passed: false })
      return
    }
    recordAttempt(retryCount > 0 ? 'retried' : 'first-try', outcomes)
    dispatch({ type: 'SPELLING_SUBMITTED', passed: true })
  }

  function next() {
    setSpokenOutcome(null)
    setSpokenFeedback(null)
    setSpelling(emptySpellingAnswers())
    setSpellingOutcomes({})
    setHasCheckedSpelling(false)
    setRetryCount(0)
    setCurrentAttempt(null)
    setStorageWarning(null)
    setModelAudioError(null)
    attemptRecorded.current = false
    currentAttemptId.current = null
    dispatch({ type: 'NEXT' })
  }

  const progress = ((state.itemIndex + (state.phase === 'revealed' ? 1 : 0)) / state.totalItems) * 100
  return (
    <main className="practice-page">
      <div className="practice-topbar">
        <button className="back-button" type="button" onClick={onExit}>
          <ArrowLeft size={19} aria-hidden="true" />
          Leave
        </button>
        <span>
          {state.itemIndex + 1} / {state.totalItems}
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`Item ${state.itemIndex + 1} of ${state.totalItems}`}
        aria-valuemin={0}
        aria-valuemax={state.totalItems}
        aria-valuenow={state.itemIndex + (state.phase === 'revealed' ? 1 : 0)}
      >
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>

      <section className="practice-specimen" aria-live="polite">
        <div className="specimen-meta">
          <span>{prompt.direction === 'english-to-german' ? 'EN → DE' : 'DE → EN'}</span>
          <span>{mode === 'learn' ? 'LEARN' : 'TEST'}</span>
        </div>
        <p className="prompt-label">Audio cue</p>
        <div className="audio-cue">
          <Headphones size={44} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>Listen to the {languageNames[cue.language]} cue</strong>
            <small>Written answers stay hidden except for exact pronunciation feedback.</small>
          </div>
        </div>
        <div className="measurement-line" aria-hidden="true">
          {Array.from({ length: 17 }, (_, index) => (
            <span key={index} />
          ))}
        </div>

        {state.error ? (
          <div className="feedback-panel error-panel" role="alert">
            <CircleAlert size={22} aria-hidden="true" />
            <div>
              <strong>That did not work</strong>
              <p>{state.error}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => dispatch({ type: 'RETRY' })}>
              <RotateCcw size={18} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : null}

        {state.phase === 'ready' && !state.error ? (
          <div className={state.hasListened ? 'practice-actions ready-to-speak' : 'practice-actions'}>
            <button
              className="secondary-button large-button"
              type="button"
              onClick={() => void playCue()}
              disabled={
                !online ||
                playing ||
                cueAudioStatus === 'loading' ||
                cueAudioStatus === 'idle'
              }
              aria-busy={cueAudioStatus === 'loading'}
            >
              <Speaker size={22} aria-hidden="true" />
              {playing
                ? 'Playing…'
                : cueAudioStatus === 'loading' || cueAudioStatus === 'idle'
                  ? 'Preparing audio…'
                  : cueAudioStatus === 'error'
                    ? 'Load audio again'
                    : state.hasListened
                      ? 'Listen again'
                      : 'Listen'}
            </button>
            {cueAudioError ? (
              <p className="model-audio-error" role="alert">
                {cueAudioError}
              </p>
            ) : null}
            {state.hasListened ? (
              <>
                <button
                  className="record-button"
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={!online || preparingRecorder}
                  aria-busy={preparingRecorder}
                >
                  <Mic size={27} aria-hidden="true" />
                  <span>
                    {preparingRecorder
                      ? 'Starting microphone…'
                      : 'Speak English'}
                  </span>
                  <small>
                    {preparingRecorder
                      ? 'Wait for “Listening…” before speaking'
                      : 'Say the English answer · Up to 15 seconds'}
                  </small>
                </button>
                <button className="secondary-button skip-button" type="button" onClick={() => skipWord('speaking')}>
                  Skip this item
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {state.phase === 'playing' ? (
          <div className="processing-state" role="status">
            <Headphones size={30} aria-hidden="true" />
            <strong>Listen carefully…</strong>
          </div>
        ) : null}

        {state.phase === 'recording' ? (
          <div className="recording-state">
            <div className="recording-indicator" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <strong>Listening…</strong>
            <button className="stop-button" type="button" onClick={() => void finishRecording()}>
              <Square size={20} fill="currentColor" aria-hidden="true" />
              Stop and check
            </button>
          </div>
        ) : null}

        {state.phase === 'processing' ? (
          <div className="processing-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <strong>Checking your speech…</strong>
            <small>The recording is discarded after this check.</small>
          </div>
        ) : null}

        {state.phase === 'speech-retry' && spokenOutcome && !state.error ? (
          <div className="speech-retry-step">
            <div className={`speech-feedback outcome-${spokenOutcome}`} role="status">
              <RotateCcw size={21} aria-hidden="true" />
              <div>
                <strong>{spokenMessages[spokenOutcome]}</strong>
                <PronunciationDetails
                  outcome={spokenOutcome}
                  feedback={spokenFeedback}
                  mode={mode}
                />
              </div>
            </div>
            {canHearModel ? (
              <section className="model-audio-panel" aria-labelledby="model-audio-title">
                <div className="model-audio-heading">
                  <Headphones size={25} aria-hidden="true" />
                  <div>
                    <strong id="model-audio-title">Compare with the model</strong>
                    <small>Hear the complete English answer at either pace, then try it again.</small>
                  </div>
                </div>
                <div className="model-audio-actions">
                  <button
                    className="secondary-button model-audio-button"
                    type="button"
                    onClick={() => void playModelWord('normal')}
                    disabled={
                      !online ||
                      playing ||
                      modelAudioStatus.normal === 'loading' ||
                      modelAudioStatus.normal === 'idle'
                    }
                    aria-busy={modelAudioStatus.normal === 'loading'}
                  >
                    <Speaker size={21} aria-hidden="true" />
                    <span className="model-audio-button-copy">
                      <span>
                        {playingPace === 'normal'
                          ? 'Playing model…'
                          : modelAudioStatus.normal === 'loading' ||
                              modelAudioStatus.normal === 'idle'
                            ? 'Preparing model audio…'
                            : modelAudioStatus.normal === 'error'
                              ? 'Load model audio'
                              : 'Hear the model answer'}
                      </span>
                      <small>Normal pace</small>
                    </span>
                  </button>
                  <button
                    className="secondary-button model-audio-button"
                    type="button"
                    onClick={() => void playModelWord('slow')}
                    disabled={
                      !online ||
                      playing ||
                      modelAudioStatus.slow === 'loading' ||
                      modelAudioStatus.slow === 'idle'
                    }
                    aria-busy={modelAudioStatus.slow === 'loading'}
                  >
                    <Speaker size={21} aria-hidden="true" />
                    <span className="model-audio-button-copy">
                      <span>
                        {playingPace === 'slow'
                          ? 'Playing slowly…'
                          : modelAudioStatus.slow === 'loading' ||
                              modelAudioStatus.slow === 'idle'
                            ? 'Preparing slow audio…'
                            : modelAudioStatus.slow === 'error'
                              ? 'Load slow audio'
                              : 'Hear it slowly'}
                      </span>
                      <small>Slower model</small>
                    </span>
                  </button>
                </div>
                {modelAudioError ? (
                  <p className="model-audio-error" role="alert">
                    {modelAudioError}
                  </p>
                ) : null}
              </section>
            ) : null}
            <div
              className={
                canHearModel
                  ? 'practice-actions retry-actions'
                  : 'practice-actions ready-to-speak'
              }
            >
              {!canHearModel ? (
                <button
                  className="secondary-button large-button"
                  type="button"
                  onClick={() => void playCue()}
                  disabled={!online || playing}
                >
                  <Speaker size={22} aria-hidden="true" />
                  {playing ? 'Playing…' : 'Listen again'}
                </button>
              ) : null}
              <button
                className="record-button"
                type="button"
                onClick={() => void startRecording()}
                disabled={!online || playing || preparingRecorder}
                aria-busy={preparingRecorder}
              >
                <Mic size={27} aria-hidden="true" />
                <span>
                  {preparingRecorder
                    ? 'Starting microphone…'
                    : 'Try speaking again'}
                </span>
                <small>
                  {preparingRecorder
                    ? 'Wait for “Listening…” before speaking'
                    : 'Say the English answer · Up to 15 seconds'}
                </small>
              </button>
              <button className="secondary-button skip-button" type="button" onClick={() => skipWord('speaking')}>
                Skip this item
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {state.phase === 'spelling' && spokenOutcome ? (
          <div className="spelling-step">
            <div className={`speech-feedback outcome-${spokenOutcome}`}>
              {spokenOutcome === 'correct' ? <Check size={21} aria-hidden="true" /> : <CircleAlert size={21} aria-hidden="true" />}
              <div>
                <strong>{spokenMessages[spokenOutcome]}</strong>
                <PronunciationDetails
                  outcome={spokenOutcome}
                  feedback={spokenFeedback}
                  mode={mode}
                />
              </div>
            </div>
            <form onSubmit={submitSpelling}>
              <fieldset className="spelling-fields">
                <legend>
                  Now write{' '}
                  {prompt.spellingLanguages.length === 2 ? 'both answers' : 'the English answer'}
                </legend>
                {prompt.spellingLanguages.map((language, index) => {
                  const word = prompt.words[language]
                  const outcome = spellingOutcomes[language]
                  const detail =
                    language === 'german'
                      ? 'Write the German translation of the English cue.'
                      : prompt.direction === 'english-to-german'
                        ? 'Write the English answer you heard.'
                        : 'Write the English translation of the German cue.'
                  return (
                    <div className="spelling-field" key={language}>
                      <label htmlFor={`spelling-${language}`}>
                        {languageNames[language]} {language === 'german' ? 'translation' : 'spelling'}
                        <small>{detail}</small>
                        <textarea
                          id={`spelling-${language}`}
                          lang={word.locale}
                          value={spelling[language]}
                          onChange={(event) => {
                            setSpelling((current) => ({
                              ...current,
                              [language]: event.target.value,
                            }))
                            setSpellingOutcomes((current) => {
                              const next = { ...current }
                              delete next[language]
                              return next
                            })
                          }}
                          readOnly={outcome === 'correct'}
                          aria-invalid={outcome ? outcome !== 'correct' : undefined}
                          aria-describedby={outcome ? `spelling-feedback-${language}` : undefined}
                          autoFocus={index === 0}
                          autoCapitalize="sentences"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={120}
                          rows={3}
                        />
                      </label>
                      {outcome ? (
                        <div id={`spelling-feedback-${language}`} role="status">
                          <SpellingFeedback word={word} outcome={outcome} />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </fieldset>
              <div className="spelling-actions">
                <button
                  className="primary-button full-width large-button"
                  type="submit"
                  disabled={prompt.spellingLanguages.some(
                    (language) => !spelling[language].trim(),
                  )}
                >
                  {hasCheckedSpelling
                    ? 'Check again'
                    : prompt.spellingLanguages.length === 2
                      ? 'Check both answers'
                      : 'Check English answer'}
                  <ChevronRight size={21} aria-hidden="true" />
                </button>
                <button className="secondary-button full-width" type="button" onClick={() => skipWord('spelling')}>
                  Skip this item
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {state.phase === 'revealed' && currentAttempt ? (
          <div className="reveal-step">
            <div
              className={`feedback-panel completion-panel completion-${currentAttempt.completion}`}
              role="status"
            >
              {currentAttempt.completion === 'first-try' ? (
                <Check size={22} aria-hidden="true" />
              ) : (
                <CircleAlert size={22} aria-hidden="true" />
              )}
              <div>
                <strong>
                  {currentAttempt.completion === 'first-try'
                    ? 'Completed on the first try'
                    : 'Needs practice'}
                </strong>
                <p>
                  {currentAttempt.completion === 'retried'
                    ? `Completed after ${currentAttempt.retryCount} ${currentAttempt.retryCount === 1 ? 'retry' : 'retries'}.`
                    : currentAttempt.completion === 'skipped'
                      ? `Skipped during ${currentAttempt.skippedAt === 'speaking' ? 'speaking' : 'writing'}.`
                      : 'Every check was correct straight away.'}
                </p>
              </div>
            </div>
            <div className="answer-ledger" aria-label="Correct English and German answers">
              <div>
                <span>English</span>
                <strong lang="en-US">{prompt.words.english.text}</strong>
              </div>
              <div>
                <span>German</span>
                <strong lang="de-DE">{prompt.words.german.text}</strong>
              </div>
            </div>
            {currentAttempt.completion !== 'skipped'
              ? prompt.spellingLanguages.map((language) => {
                  const outcome = spellingOutcomes[language]
                  return outcome ? (
                    <SpellingFeedback
                      key={language}
                      word={prompt.words[language]}
                      outcome={outcome}
                    />
                  ) : null
                })
              : null}
            {storageWarning ? (
              <p className="storage-warning" role="status">
                <CircleAlert size={18} aria-hidden="true" />
                {storageWarning}
              </p>
            ) : null}
            <div className="reveal-actions">
              <button className="secondary-button" type="button" onClick={() => void playCue()} disabled={!online || playing}>
                <Speaker size={20} aria-hidden="true" />
                {playing ? 'Playing…' : 'Hear the cue again'}
              </button>
              <button className="primary-button" type="button" onClick={next}>
                {state.itemIndex + 1 === state.totalItems ? 'See results' : 'Next item'}
                <ChevronRight size={21} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function ResultsScreen({
  exercise,
  attempts,
  onAgain,
  onDone,
}: {
  exercise: ExerciseSet
  attempts: AttemptSummary[]
  onAgain: () => void
  onDone: () => void
}) {
  const performance = summarizePracticePerformance(attempts)
  const spokenCorrect = attempts.filter(
    (attempt) => attempt.spokenOutcome === 'correct',
  ).length
  const englishSpellingCorrect = attempts.filter(
    (attempt) => attempt.spellingOutcome === 'correct',
  ).length
  const germanAttempts = attempts.filter(
    (attempt) => attempt.direction === 'english-to-german',
  )
  const germanSpellingCorrect = germanAttempts.filter(
    (attempt) => attempt.germanSpellingOutcome === 'correct',
  ).length
  const reviewCount = performance.retried + performance.skipped
  const entriesById = new Map(exercise.entries.map((entry) => [entry.id, entry]))

  return (
    <main className="page-content narrow-page results-page">
      <div className="result-stamp" aria-hidden="true">
        <Check size={34} />
      </div>
      <h1>Practice finished</h1>
      <p className="lede">{exercise.name}</p>
      <section className="performance-summary" aria-labelledby="performance-title">
        <div className="performance-heading">
          <div>
            <h2 id="performance-title">First-try performance</h2>
            <p>
              {performance.firstTry} of {performance.total} items completed without a retry or skip
            </p>
          </div>
          <strong className="performance-score">{performance.percentage}%</strong>
        </div>
        <div
          className="performance-track"
          role="progressbar"
          aria-label="First-try performance"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={performance.percentage}
        >
          <span style={{ transform: `scaleX(${performance.percentage / 100})` }} />
        </div>
        <div className="performance-key" aria-label="Performance breakdown">
          <span><b>{performance.firstTry}</b> First try</span>
          <span><b>{performance.retried}</b> Retried</span>
          <span><b>{performance.skipped}</b> Skipped</span>
        </div>
      </section>
      <div className="result-ledger">
        <div>
          <span>English spoken clearly</span>
          <strong>
            {spokenCorrect}<small> / {attempts.length}</small>
          </strong>
        </div>
        <div>
          <span>English written exactly</span>
          <strong>
            {englishSpellingCorrect}<small> / {attempts.length}</small>
          </strong>
        </div>
        {germanAttempts.length > 0 ? (
          <div>
            <span>German written exactly</span>
            <strong>
              {germanSpellingCorrect}<small> / {germanAttempts.length}</small>
            </strong>
          </div>
        ) : null}
        <div>
          <span>Worth another look</span>
          <strong>{reviewCount}</strong>
        </div>
      </div>
      <section className="word-results" aria-labelledby="word-results-title">
        <h2 id="word-results-title">Item by item</h2>
        <ol className="word-result-list">
          {attempts.map((attempt, index) => {
            const entry = entriesById.get(attempt.entryId)
            if (!entry) {
              return null
            }
            return (
              <li key={attempt.id}>
                <span className="word-result-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="word-result-pair">
                  <strong lang="en-US">{entry.english}</strong>
                  <small lang="de-DE">{entry.german}</small>
                </span>
                <span className={`word-result-status status-${attempt.completion}`}>
                  {attempt.completion === 'first-try' ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <CircleAlert size={18} aria-hidden="true" />
                  )}
                  <span>
                    <strong>
                      {attempt.completion === 'first-try' ? 'First try' : 'Needs practice'}
                    </strong>
                    {attempt.completion === 'retried' ? (
                      <small>
                        {attempt.retryCount} {attempt.retryCount === 1 ? 'retry' : 'retries'}
                      </small>
                    ) : attempt.completion === 'skipped' ? (
                      <small>Skipped</small>
                    ) : null}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </section>
      <p className="result-note">
        This is practice feedback, not a test grade. A quiet room and a clear voice help the
        speech check.
      </p>
      <div className="results-actions">
        <button className="secondary-button" type="button" onClick={onDone}>
          Back to practice sets
        </button>
        <button className="primary-button" type="button" onClick={onAgain}>
          <RotateCcw size={19} aria-hidden="true" />
          Practise again
        </button>
      </div>
    </main>
  )
}

function LoadingScreen() {
  return (
    <div className="app-shell access-shell">
      <ShellHeader minimal />
      <main className="loading-main" aria-live="polite">
        <span className="spinner cobalt" aria-hidden="true" />
        <p>Opening your practice sets…</p>
      </main>
    </div>
  )
}

function StorageUnavailableScreen() {
  return (
    <div className="app-shell access-shell">
      <ShellHeader minimal />
      <main className="access-main">
        <section className="access-card" aria-labelledby="storage-title">
          <CircleAlert className="access-icon" size={30} aria-hidden="true" />
          <h1 id="storage-title">Local storage is unavailable</h1>
          <p className="lede">
            Safari could not open the practice sets on this device. Check that private browsing
            is off and that storage is available, then reload the app.
          </p>
          <button
            className="primary-button full-width"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<SessionState>('loading')
  const [exercises, setExercises] = useState<ExerciseSet[]>([])
  const [view, setView] = useState<View>({ name: 'library' })
  const [online, setOnline] = useState(navigator.onLine)

  const refreshExercises = useCallback(async () => {
    setExercises(await listExercises())
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      let storedExercises: ExerciseSet[]
      try {
        storedExercises = await listExercises()
      } catch {
        if (active) {
          setSession('storage-unavailable')
        }
        return
      }
      if (!active) {
        return
      }
      setExercises(storedExercises)
      try {
        const authenticated = await getSession()
        if (active) {
          setSession(authenticated ? 'signed-in' : 'signed-out')
        }
      } catch {
        if (active) {
          setSession('local-only')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!online || session !== 'local-only') {
      return
    }
    let active = true
    void getSession()
      .then((authenticated) => {
        if (active) {
          setSession(authenticated ? 'signed-in' : 'signed-out')
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [online, session])

  async function signOut() {
    try {
      await logout()
    } finally {
      setView({ name: 'library' })
      setSession('signed-out')
    }
  }

  async function removeExercise(exercise: ExerciseSet) {
    if (!window.confirm(`Delete “${exercise.name}” and its local practice history?`)) {
      return
    }
    await deleteExercise(exercise.id)
    await refreshExercises()
  }

  if (session === 'loading') {
    return <LoadingScreen />
  }
  if (session === 'storage-unavailable') {
    return <StorageUnavailableScreen />
  }
  if (session === 'signed-out' || session === 'unavailable' || session === 'expired') {
    return <AccessScreen state={session} onAuthenticated={() => setSession('signed-in')} />
  }

  const practiceAvailable = session === 'signed-in' && online
  const content = (() => {
    switch (view.name) {
      case 'library':
        return (
          <LibraryScreen
            exercises={exercises}
            onCreate={() => setView({ name: 'editor' })}
            onEdit={(exercise) => setView({ name: 'editor', exercise })}
            onPractice={(exercise) => setView({ name: 'setup', exercise })}
            onDelete={(exercise) => void removeExercise(exercise)}
            practiceAvailable={practiceAvailable}
          />
        )
      case 'editor':
        return (
          <ExerciseEditor
            existing={view.exercise}
            onCancel={() => setView({ name: 'library' })}
            onSaved={() => {
              void refreshExercises()
              setView({ name: 'library' })
            }}
          />
        )
      case 'setup':
        return (
          <PracticeSetup
            exercise={view.exercise}
            onBack={() => setView({ name: 'library' })}
            onStart={(direction, mode) =>
              setView({ name: 'practice', exercise: view.exercise, direction, mode })
            }
          />
        )
      case 'practice':
        return (
          <PracticeScreen
            exercise={view.exercise}
            direction={view.direction}
            mode={view.mode}
            online={online}
            onExit={() => setView({ name: 'setup', exercise: view.exercise })}
            onComplete={(attempts) => setView({ name: 'results', exercise: view.exercise, attempts })}
            onSessionExpired={() => {
              setView({ name: 'library' })
              setSession('expired')
            }}
          />
        )
      case 'results':
        return (
          <ResultsScreen
            exercise={view.exercise}
            attempts={view.attempts}
            onAgain={() => setView({ name: 'setup', exercise: view.exercise })}
            onDone={() => setView({ name: 'library' })}
          />
        )
    }
  })()

  return (
    <div className="app-shell">
      <ShellHeader onLogout={() => void signOut()} />
      <UpdateNotice />
      <OfflineNotice online={online} />
      {session === 'local-only' && online ? (
        <div className="offline-notice" role="status">
          <CircleAlert size={18} aria-hidden="true" />
          The private service cannot be reached. You can still edit local practice sets.
        </div>
      ) : null}
      {content}
      {view.name !== 'practice' ? (
        <footer>
          <span>Stored only on this device</span>
          <span aria-hidden="true">•</span>
          <span>No points or streaks</span>
        </footer>
      ) : null}
    </div>
  )
}
