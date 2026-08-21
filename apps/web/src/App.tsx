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
      Your words are still here. Listening and speaking need an internet connection.
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
        ? 'Your 30-day session ended. Sign in again; your word lists are still on this iPhone.'
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
          <h1 id="access-title">Open your words</h1>
          <p className="lede">
            Use your family access code. Your word lists and practice history stay on this
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
      <p>Add a short list for the next vocabulary lesson. You can change it at any time.</p>
      <button className="primary-button" type="button" onClick={onCreate}>
        <Plus size={20} aria-hidden="true" />
        Create first word list
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
          <h1>Word lists</h1>
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
                {exercise.entries.length} {exercise.entries.length === 1 ? 'word pair' : 'word pairs'}
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
                Practise this list
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
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value, updatedAt: now } : entry)),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()
    const completeEntries = entries.filter((entry) => entry.english.trim() || entry.german.trim())
    if (!cleanName) {
      setError('Give this word list a name.')
      return
    }
    if (completeEntries.length === 0) {
      setError('Add at least one English and German word pair.')
      return
    }
    if (completeEntries.some((entry) => !entry.english.trim() || !entry.german.trim())) {
      setError('Complete both sides of every word pair.')
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
      setError('This list could not be saved on the iPhone. Check available storage and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page-content narrow-page">
      <button className="back-button" type="button" onClick={onCancel}>
        <ArrowLeft size={19} aria-hidden="true" />
        Word lists
      </button>
      <div className="page-heading">
        <div>
          <h1>{existing ? 'Edit word list' : 'Build a word list'}</h1>
          <p>Keep phrases short so speaking feedback stays clear.</p>
        </div>
      </div>
      <form className="editor-form" onSubmit={submit}>
        <div className="field-group">
          <label htmlFor="set-name">List name</label>
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
              <legend>Word pair {index + 1}</legend>
              <span className="row-number">{String(index + 1).padStart(2, '0')}</span>
              <label>
                <span>English</span>
                <input
                  lang="en-GB"
                  value={entry.english}
                  onChange={(event) => changeEntry(entry.id, 'english', event.target.value)}
                  maxLength={120}
                  autoCapitalize="none"
                />
              </label>
              <label>
                <span>German</span>
                <input
                  lang="de-DE"
                  value={entry.german}
                  onChange={(event) => changeEntry(entry.id, 'german', event.target.value)}
                  maxLength={120}
                  autoCapitalize="none"
                />
              </label>
              <button
                className="icon-button remove-row"
                type="button"
                aria-label={`Remove word pair ${index + 1}`}
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
          Add another pair
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
            {saving ? 'Saving…' : 'Save list'}
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
        Word lists
      </button>
      <div className="page-heading">
        <div>
          <h1>{exercise.name}</h1>
          <p>
            {exercise.entries.length}{' '}
            {exercise.entries.length === 1
              ? 'word pair is ready.'
              : 'word pairs are ready.'}
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
              <small>Complete every check before either word appears.</small>
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
  'different-word': 'That sounded like a different English word. Listen again, then try once more.',
  'pronunciation-retry': 'The English word was recognised. Try it again a little slower and clearer.',
  'no-speech': 'No clear speech was heard. You can try again.',
  'low-confidence': 'The recording was not clear enough to judge. Try again in a quieter spot.',
  'service-unavailable': 'Speaking feedback is unavailable right now. Try again in a moment.',
}

const languageNames: Record<VocabularyLanguage, string> = {
  english: 'English',
  german: 'German',
}

function emptySpellingAnswers(): Record<VocabularyLanguage, string> {
  return { english: '', german: '' }
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
            <strong>Try the {language} word again</strong>
            <p>The answer stays hidden until it is correct or you skip this word.</p>
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
  const [spokenScore, setSpokenScore] = useState<number | null>(null)
  const [spelling, setSpelling] = useState(emptySpellingAnswers)
  const [spellingOutcomes, setSpellingOutcomes] = useState<
    Partial<Record<VocabularyLanguage, SpellingOutcome>>
  >({})
  const [hasCheckedSpelling, setHasCheckedSpelling] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [currentAttempt, setCurrentAttempt] = useState<AttemptSummary | null>(null)
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const recorder = useRef<PcmRecorder | null>(null)
  const stopTimer = useRef<number | null>(null)
  const completed = useRef(false)
  const attemptRecorded = useRef(false)
  const currentAttemptId = useRef<string | null>(null)
  const prompt = prompts[state.itemIndex]!
  const cue = prompt.words[prompt.cueLanguage]
  const spokenAnswer = prompt.words[prompt.spokenLanguage]

  useEffect(
    () => () => {
      if (stopTimer.current !== null) {
        window.clearTimeout(stopTimer.current)
      }
      if (recorder.current) {
        void recorder.current.stop().catch(() => undefined)
      }
    },
    [],
  )

  useEffect(() => {
    if (state.phase === 'complete' && !completed.current) {
      completed.current = true
      onComplete(attempts)
    }
  }, [attempts, onComplete, state.phase])

  async function playCue() {
    if (!online || playing) {
      return
    }
    const changesState = state.phase === 'ready'
    if (changesState) {
      dispatch({ type: 'PLAY' })
    }
    setPlaying(true)
    try {
      const blob = await requestSpeech(cue.text, cue.locale)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve()
        audio.onerror = () => reject(new Error('Audio playback failed'))
        void audio.play().catch(reject)
      })
      URL.revokeObjectURL(url)
      if (changesState) {
        dispatch({ type: 'PLAY_FINISHED' })
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onSessionExpired()
        return
      }
      dispatch({ type: 'FAIL', message: 'The word could not be played. Check the connection and try again.' })
    } finally {
      setPlaying(false)
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
      setSpokenScore(result.pronunciationScore)
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
      (state.phase !== 'ready' && state.phase !== 'speech-retry') ||
      !state.hasListened
    ) {
      return
    }
    setSpelling(emptySpellingAnswers())
    setSpellingOutcomes({})
    setHasCheckedSpelling(false)
    dispatch({ type: 'RECORD' })
    try {
      recorder.current = await PcmRecorder.start()
      stopTimer.current = window.setTimeout(() => void finishRecording(), recorder.current.remainingMs)
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Microphone access is off. Allow it in Safari settings, then try again.'
          : 'The microphone could not start. Check Safari settings and try again.'
      dispatch({ type: 'FAIL', message })
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
    setSpokenScore(null)
    setSpelling(emptySpellingAnswers())
    setSpellingOutcomes({})
    setHasCheckedSpelling(false)
    setRetryCount(0)
    setCurrentAttempt(null)
    setStorageWarning(null)
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
        aria-label={`Word ${state.itemIndex + 1} of ${state.totalItems}`}
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
            <strong>Listen to the {languageNames[cue.language]} word</strong>
            <small>No English or German spelling appears until your checks are complete.</small>
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
            <button className="secondary-button large-button" type="button" onClick={() => void playCue()} disabled={!online || playing}>
              <Speaker size={22} aria-hidden="true" />
              {playing ? 'Playing…' : state.hasListened ? 'Listen again' : 'Listen'}
            </button>
            {state.hasListened ? (
              <>
                <button className="record-button" type="button" onClick={() => void startRecording()} disabled={!online}>
                  <Mic size={27} aria-hidden="true" />
                  <span>Speak English</span>
                  <small>Say the English word · Up to 8 seconds</small>
                </button>
                <button className="secondary-button skip-button" type="button" onClick={() => skipWord('speaking')}>
                  Skip this word
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
                {spokenScore !== null && mode === 'learn' ? <small>English pronunciation: {Math.round(spokenScore)} / 100</small> : null}
              </div>
            </div>
            <div className="practice-actions ready-to-speak">
              <button className="secondary-button large-button" type="button" onClick={() => void playCue()} disabled={!online || playing}>
                <Speaker size={22} aria-hidden="true" />
                {playing ? 'Playing…' : 'Listen again'}
              </button>
              <button className="record-button" type="button" onClick={() => void startRecording()} disabled={!online}>
                <Mic size={27} aria-hidden="true" />
                <span>Try speaking again</span>
                <small>Say the English word · Up to 8 seconds</small>
              </button>
              <button className="secondary-button skip-button" type="button" onClick={() => skipWord('speaking')}>
                Skip this word
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
                {spokenScore !== null && mode === 'learn' ? <small>English pronunciation: {Math.round(spokenScore)} / 100</small> : null}
              </div>
            </div>
            <form onSubmit={submitSpelling}>
              <fieldset className="spelling-fields">
                <legend>Now write {prompt.spellingLanguages.length === 2 ? 'both words' : 'the English word'}</legend>
                {prompt.spellingLanguages.map((language, index) => {
                  const word = prompt.words[language]
                  const outcome = spellingOutcomes[language]
                  const detail =
                    language === 'german'
                      ? 'Write the German meaning of the English cue.'
                      : prompt.direction === 'english-to-german'
                        ? 'Write the English word you heard.'
                        : 'Write the English translation of the German cue.'
                  return (
                    <div className="spelling-field" key={language}>
                      <label htmlFor={`spelling-${language}`}>
                        {languageNames[language]} {language === 'german' ? 'translation' : 'spelling'}
                        <small>{detail}</small>
                        <input
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
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={120}
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
                      : 'Check English spelling'}
                  <ChevronRight size={21} aria-hidden="true" />
                </button>
                <button className="secondary-button full-width" type="button" onClick={() => skipWord('spelling')}>
                  Skip this word
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
            <div className="answer-ledger" aria-label="Correct word pair">
              <div>
                <span>English</span>
                <strong lang="en-GB">{prompt.words.english.text}</strong>
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
                {state.itemIndex + 1 === state.totalItems ? 'See results' : 'Next word'}
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
              {performance.firstTry} of {performance.total} words completed without a retry or skip
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
          <span>English spelled exactly</span>
          <strong>
            {englishSpellingCorrect}<small> / {attempts.length}</small>
          </strong>
        </div>
        {germanAttempts.length > 0 ? (
          <div>
            <span>German translated exactly</span>
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
        <h2 id="word-results-title">Word by word</h2>
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
                  <strong lang="en-GB">{entry.english}</strong>
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
          Back to lists
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
        <p>Opening your words…</p>
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
            Safari could not open the word lists on this device. Check that private browsing
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
          The private service cannot be reached. You can still edit local word lists.
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
