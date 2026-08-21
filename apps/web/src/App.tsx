import '@fontsource-variable/atkinson-hyperlegible-next'
import {
  gradeSpelling,
  initialPracticeState,
  mayRevealTarget,
  practiceReducer,
  type AttemptSummary,
  type ExerciseSet,
  type PracticeDirection,
  type PracticeMode,
  type PracticePrompt,
  type SpellingOutcome,
  type SpokenOutcome,
  type VocabularyEntry,
} from '@vocabulary/domain'
import {
  ArrowLeft,
  ArrowDownRight,
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
              <small>Listen first, then speak and spell.</small>
            </span>
            <Check size={20} className="choice-check" aria-hidden="true" />
          </label>
          <label className={mode === 'test' ? 'choice-card selected' : 'choice-card'}>
            <input type="radio" name="mode" value="test" checked={mode === 'test'} onChange={() => setMode('test')} />
            <LockKeyhole size={24} aria-hidden="true" />
            <span>
              <strong>Test</strong>
              <small>Recall the answer before it is revealed.</small>
            </span>
            <Check size={20} className="choice-check" aria-hidden="true" />
          </label>
        </fieldset>

        <fieldset className="choice-group direction-group">
          <legend>Choose a direction</legend>
          {[
            ['english-to-german', 'English → German'],
            ['german-to-english', 'German → English'],
            ['mixed', 'Mix both directions'],
          ].map(([value, label]) => (
            <label className={direction === value ? 'line-choice selected' : 'line-choice'} key={value}>
              <input
                type="radio"
                name="direction"
                value={value}
                checked={direction === value}
                onChange={() => setDirection(value as PracticeDirection)}
              />
              <span>{label}</span>
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
      const resolvedDirection =
        direction === 'mixed'
          ? Math.random() < 0.5
            ? 'english-to-german'
            : 'german-to-english'
          : direction
      return resolvedDirection === 'english-to-german'
        ? { entryId: entry.id, source: entry.english, target: entry.german, targetLocale: 'de-DE' }
        : { entryId: entry.id, source: entry.german, target: entry.english, targetLocale: 'en-GB' }
    }),
  )
}

const spokenMessages: Record<SpokenOutcome, string> = {
  correct: 'That sounded right.',
  'different-word': 'That sounded like a different word. Keep going with the spelling step.',
  'pronunciation-retry': 'The word was recognised. Try a clearer, slower pronunciation next time.',
  'no-speech': 'No clear speech was heard. You can try again.',
  'low-confidence': 'The recording was not clear enough to judge.',
  'service-unavailable': 'Speaking feedback is unavailable right now.',
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
  const [spelling, setSpelling] = useState('')
  const [spellingOutcome, setSpellingOutcome] = useState<SpellingOutcome | null>(null)
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const recorder = useRef<PcmRecorder | null>(null)
  const stopTimer = useRef<number | null>(null)
  const completed = useRef(false)
  const prompt = prompts[state.itemIndex]!

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

  async function playTarget() {
    if (!online || playing) {
      return
    }
    const changesState = state.phase === 'ready'
    if (changesState) {
      dispatch({ type: 'PLAY' })
    }
    setPlaying(true)
    try {
      const blob = await requestSpeech(prompt.target, prompt.targetLocale)
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
      const result = await assessPronunciation(audio, prompt.target, prompt.targetLocale, mode)
      setSpokenOutcome(result.outcome)
      setSpokenScore(result.pronunciationScore)
      dispatch({ type: 'SPEECH_FINISHED' })
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
    if (!online || state.phase !== 'ready') {
      return
    }
    setSpokenOutcome(null)
    setSpokenScore(null)
    setSpelling('')
    setSpellingOutcome(null)
    try {
      recorder.current = await PcmRecorder.start()
      dispatch({ type: 'RECORD' })
      stopTimer.current = window.setTimeout(() => void finishRecording(), recorder.current.remainingMs)
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Microphone access is off. Allow it in Safari settings, then try again.'
          : 'The microphone could not start. Check Safari settings and try again.'
      dispatch({ type: 'FAIL', message })
    }
  }

  async function submitSpelling(event: FormEvent) {
    event.preventDefault()
    if (!spelling.trim() || !spokenOutcome) {
      return
    }
    const grade = gradeSpelling(spelling, prompt.target, prompt.targetLocale)
    setSpellingOutcome(grade.outcome)
    setStorageWarning(null)
    const resolvedDirection =
      prompt.targetLocale === 'de-DE' ? 'english-to-german' : 'german-to-english'
    const attempt: AttemptSummary = {
      id: makeId('attempt'),
      exerciseId: exercise.id,
      entryId: prompt.entryId,
      mode,
      direction: resolvedDirection,
      spokenOutcome,
      spellingOutcome: grade.outcome,
      attemptedAt: new Date().toISOString(),
    }
    setAttempts((current) => [...current, attempt])
    try {
      await saveAttempt(attempt)
    } catch {
      setStorageWarning(
        'This attempt could not be added to local history, but you can keep practising.',
      )
    }
    dispatch({ type: 'SPELLING_SUBMITTED' })
  }

  function next() {
    setSpokenOutcome(null)
    setSpokenScore(null)
    setSpelling('')
    setSpellingOutcome(null)
    setStorageWarning(null)
    dispatch({ type: 'NEXT' })
  }

  const targetVisible = mayRevealTarget(mode, state.phase)
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
      <div className="progress-track" aria-label={`Word ${state.itemIndex + 1} of ${state.totalItems}`}>
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>

      <section className="practice-specimen" aria-live="polite">
        <div className="specimen-meta">
          <span>{prompt.targetLocale === 'de-DE' ? 'EN → DE' : 'DE → EN'}</span>
          <span>{mode === 'learn' ? 'LEARN' : 'TEST'}</span>
        </div>
        <p className="prompt-label">{targetVisible ? 'Word pair' : 'Say and spell the translation'}</p>
        <p className="source-word" lang={prompt.targetLocale === 'de-DE' ? 'en-GB' : 'de-DE'}>
          {prompt.source}
        </p>
        <div className={targetVisible ? 'target-reveal visible' : 'target-reveal'}>
          {targetVisible ? (
            <>
              <ArrowDownRight size={22} aria-hidden="true" />
              <strong lang={prompt.targetLocale}>{prompt.target}</strong>
            </>
          ) : (
            <span className="concealed-answer">Answer stays covered until spelling is finished</span>
          )}
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
          <div className="practice-actions">
            {mode === 'learn' ? (
              <button className="secondary-button large-button" type="button" onClick={() => void playTarget()} disabled={!online || playing}>
                <Speaker size={22} aria-hidden="true" />
                {playing ? 'Playing…' : 'Listen'}
              </button>
            ) : null}
            <button className="record-button" type="button" onClick={() => void startRecording()} disabled={!online}>
              <Mic size={27} aria-hidden="true" />
              <span>Speak answer</span>
              <small>Up to 8 seconds</small>
            </button>
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

        {state.phase === 'spelling' && spokenOutcome ? (
          <div className="spelling-step">
            <div className={`speech-feedback outcome-${spokenOutcome}`}>
              {spokenOutcome === 'correct' ? <Check size={21} aria-hidden="true" /> : <CircleAlert size={21} aria-hidden="true" />}
              <div>
                <strong>{spokenMessages[spokenOutcome]}</strong>
                {spokenScore !== null && mode === 'learn' ? <small>Pronunciation check: {Math.round(spokenScore)} / 100</small> : null}
              </div>
            </div>
            <form onSubmit={submitSpelling}>
              <label htmlFor="spelling-answer">
                Now spell the answer
                <small>The answer is still covered.</small>
              </label>
              <input
                id="spelling-answer"
                lang={prompt.targetLocale}
                value={spelling}
                onChange={(event) => setSpelling(event.target.value)}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={120}
              />
              <button className="primary-button full-width large-button" type="submit" disabled={!spelling.trim()}>
                Check spelling
                <ChevronRight size={21} aria-hidden="true" />
              </button>
            </form>
          </div>
        ) : null}

        {state.phase === 'revealed' && spokenOutcome && spellingOutcome ? (
          <div className="reveal-step">
            <div className={`spelling-result result-${spellingOutcome}`}>
              {spellingOutcome === 'correct' ? (
                <>
                  <Check size={22} aria-hidden="true" />
                  <strong>Spelling correct</strong>
                </>
              ) : spellingOutcome === 'minor-typo' ? (
                <>
                  <CircleAlert size={22} aria-hidden="true" />
                  <div>
                    <strong>Almost right — one small typo</strong>
                    <p>
                      Correct spelling: <b>{prompt.target}</b>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <RotateCcw size={22} aria-hidden="true" />
                  <div>
                    <strong>Compare the spelling</strong>
                    <p>
                      Correct spelling: <b>{prompt.target}</b>
                    </p>
                  </div>
                </>
              )}
            </div>
            {storageWarning ? (
              <p className="storage-warning" role="status">
                <CircleAlert size={18} aria-hidden="true" />
                {storageWarning}
              </p>
            ) : null}
            <div className="reveal-actions">
              <button className="secondary-button" type="button" onClick={() => void playTarget()} disabled={!online || playing}>
                <Speaker size={20} aria-hidden="true" />
                {playing ? 'Playing…' : 'Hear it again'}
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
  const spokenCorrect = attempts.filter((attempt) => attempt.spokenOutcome === 'correct').length
  const spellingCorrect = attempts.filter((attempt) => attempt.spellingOutcome === 'correct').length
  const reviewCount = attempts.filter(
    (attempt) => attempt.spokenOutcome !== 'correct' || attempt.spellingOutcome === 'incorrect',
  ).length

  return (
    <main className="page-content narrow-page results-page">
      <div className="result-stamp" aria-hidden="true">
        <Check size={34} />
      </div>
      <h1>Practice finished</h1>
      <p className="lede">{exercise.name}</p>
      <div className="result-ledger">
        <div>
          <span>Spoken clearly</span>
          <strong>
            {spokenCorrect}<small> / {attempts.length}</small>
          </strong>
        </div>
        <div>
          <span>Spelled exactly</span>
          <strong>
            {spellingCorrect}<small> / {attempts.length}</small>
          </strong>
        </div>
        <div>
          <span>Worth another look</span>
          <strong>{reviewCount}</strong>
        </div>
      </div>
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
          <span>No scores or streaks</span>
        </footer>
      ) : null}
    </div>
  )
}
