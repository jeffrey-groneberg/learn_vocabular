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
  Settings,
  Settings2,
  Speaker,
  Square,
  Trash2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
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
import { LanguageProvider } from './LanguageProvider.js'
import { useUiLanguage, type UiCopy, type UiLanguage } from './i18n.js'

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
  const { language, copy, preferenceLoadFailed, changeLanguage } = useUiLanguage()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState<UiLanguage | null>(null)
  const [saveError, setSaveError] = useState(false)
  const settingsId = useId()

  async function chooseLanguage(nextLanguage: UiLanguage) {
    if (nextLanguage === language || savingLanguage) {
      return
    }
    setSavingLanguage(nextLanguage)
    setSaveError(false)
    try {
      await changeLanguage(nextLanguage)
    } catch {
      setSaveError(true)
    } finally {
      setSavingLanguage(null)
    }
  }

  return (
    <>
      <header className="cabinet-header">
        <div className="brand-lockup">
          <p className="brand-name">Vocabulary Voice Tutor</p>
        </div>
        <div className="header-actions">
          <button
            className="icon-button on-blue"
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label={copy.settings.open}
            aria-controls={settingsId}
            aria-expanded={settingsOpen}
          >
            <Settings size={20} aria-hidden="true" />
          </button>
          {!minimal && onLogout ? (
            <button
              className="icon-button on-blue"
              type="button"
              onClick={onLogout}
              aria-label={copy.common.logout}
            >
              <LogOut size={20} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>
      {settingsOpen ? (
        <section className="settings-drawer" id={settingsId} aria-labelledby={`${settingsId}-title`}>
          <div className="settings-drawer-inner">
            <div className="settings-heading">
              <h2 id={`${settingsId}-title`}>{copy.settings.title}</h2>
              <p>{copy.settings.description}</p>
            </div>
            <fieldset className="language-options" aria-busy={savingLanguage !== null}>
              <legend>{copy.settings.languageLegend}</legend>
              {([
                {
                  value: 'en',
                  code: 'EN',
                  name: copy.settings.englishName,
                  detail: copy.settings.englishDetail,
                },
                {
                  value: 'de',
                  code: 'DE',
                  name: copy.settings.germanName,
                  detail: copy.settings.germanDetail,
                },
              ] satisfies Array<{
                value: UiLanguage
                code: string
                name: string
                detail: string
              }>).map((option) => (
                <label
                  className={language === option.value ? 'language-option selected' : 'language-option'}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name={`${settingsId}-language`}
                    value={option.value}
                    checked={language === option.value}
                    disabled={savingLanguage !== null}
                    onChange={() => void chooseLanguage(option.value)}
                  />
                  <span className="language-code" aria-hidden="true">
                    {option.code}
                  </span>
                  <span className="language-copy">
                    <strong>{option.name}</strong>
                    <small>{option.detail}</small>
                  </span>
                  <Check className="language-check" size={20} aria-hidden="true" />
                </label>
              ))}
            </fieldset>
            {preferenceLoadFailed || saveError ? (
              <p className="settings-error form-error" role="alert">
                <CircleAlert size={18} aria-hidden="true" />
                {saveError ? copy.settings.saveError : copy.settings.loadError}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  )
}

function OfflineNotice({ online }: { online: boolean }) {
  const { copy } = useUiLanguage()
  if (online) {
    return null
  }
  return (
    <div className="offline-notice" role="status">
      <CircleAlert size={18} aria-hidden="true" />
      {copy.notices.offline}
    </div>
  )
}

function UpdateNotice() {
  const { copy } = useUiLanguage()
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
      <span>{copy.notices.updateReady}</span>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent('vocabulary-tutor:apply-update'))
        }
      >
        {copy.notices.updateNow}
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
  const { copy } = useUiLanguage()
  const [code, setCode] = useState('')
  const [error, setError] = useState<
    | { kind: 'service-unavailable' }
    | { kind: 'session-expired' }
    | { kind: 'rate-limit'; minutes: number }
    | { kind: 'invalid-code' }
    | null
  >(
    state === 'unavailable'
      ? { kind: 'service-unavailable' }
      : state === 'expired'
        ? { kind: 'session-expired' }
        : null,
  )
  const [submitting, setSubmitting] = useState(false)
  const errorMessage =
    error?.kind === 'service-unavailable'
      ? copy.access.serviceUnavailable
      : error?.kind === 'session-expired'
        ? copy.access.sessionExpired
        : error?.kind === 'rate-limit'
          ? copy.access.tooManyTries(error.minutes)
          : error?.kind === 'invalid-code'
            ? copy.access.invalidCode
            : null

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
        setError({ kind: 'rate-limit', minutes })
      } else {
        setError({ kind: 'invalid-code' })
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
          <h1 id="access-title">{copy.access.title}</h1>
          <p className="lede">
            {copy.access.description}
          </p>
          <form onSubmit={submit}>
            <label htmlFor="family-code">{copy.access.codeLabel}</label>
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
            {errorMessage ? (
              <p className="form-error" role="alert">
                <CircleAlert size={18} aria-hidden="true" />
                {errorMessage}
              </p>
            ) : null}
            <button className="primary-button full-width" type="submit" disabled={!code || submitting}>
              {submitting ? copy.access.opening : copy.access.openTutor}
              {!submitting ? <ChevronRight size={21} aria-hidden="true" /> : null}
            </button>
          </form>
        </section>
        <p className="privacy-note">
          <LockKeyhole size={15} aria-hidden="true" />
          {copy.access.privacy}
        </p>
      </main>
    </div>
  )
}

function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  const { copy } = useUiLanguage()
  return (
    <section className="empty-cabinet">
      <div className="empty-drawer" aria-hidden="true">
        <span>EN</span>
        <span>DE</span>
      </div>
      <h2>{copy.library.emptyTitle}</h2>
      <p>{copy.library.emptyDescription}</p>
      <button className="primary-button" type="button" onClick={onCreate}>
        <Plus size={20} aria-hidden="true" />
        {copy.library.createFirst}
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
  const { copy } = useUiLanguage()
  return (
    <main className="page-content">
      <div className="page-heading">
        <div>
          <h1>{copy.library.title}</h1>
          <p>{copy.library.description}</p>
        </div>
        <button className="primary-button compact" type="button" onClick={onCreate}>
          <Plus size={20} aria-hidden="true" />
          {copy.library.newList}
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
              <p>{copy.library.pairCount(exercise.entries.length)}</p>
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
                    : copy.library.unavailableTitle
                }
              >
                <BookOpen size={20} aria-hidden="true" />
                {copy.library.practise}
              </button>
              <div className="drawer-actions">
                <button className="text-button" type="button" onClick={() => onEdit(exercise)}>
                  <Settings2 size={17} aria-hidden="true" />
                  {copy.library.edit}
                </button>
                <button className="text-button danger" type="button" onClick={() => onDelete(exercise)}>
                  <Trash2 size={17} aria-hidden="true" />
                  {copy.library.delete}
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
  const { copy } = useUiLanguage()
  const [name, setName] = useState(existing?.name ?? '')
  const [entries, setEntries] = useState<VocabularyEntry[]>(
    existing?.entries.length ? existing.entries : [blankEntry()],
  )
  const [error, setError] = useState<
    'missing-name' | 'missing-pair' | 'incomplete-pair' | 'save-error' | null
  >(null)
  const [saving, setSaving] = useState(false)
  const errorMessage =
    error === 'missing-name'
      ? copy.editor.missingName
      : error === 'missing-pair'
        ? copy.editor.missingPair
        : error === 'incomplete-pair'
          ? copy.editor.incompletePair
          : error === 'save-error'
            ? copy.editor.saveError
            : null

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
      setError('missing-name')
      return
    }
    if (completeEntries.length === 0) {
      setError('missing-pair')
      return
    }
    if (completeEntries.some((entry) => !entry.english.trim() || !entry.german.trim())) {
      setError('incomplete-pair')
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
      setError('save-error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page-content narrow-page">
      <button className="back-button" type="button" onClick={onCancel}>
        <ArrowLeft size={19} aria-hidden="true" />
        {copy.editor.back}
      </button>
      <div className="page-heading">
        <div>
          <h1>{existing ? copy.editor.editTitle : copy.editor.buildTitle}</h1>
          <p>{copy.editor.description}</p>
        </div>
      </div>
      <form className="editor-form" onSubmit={submit}>
        <div className="field-group">
          <label htmlFor="set-name">{copy.editor.nameLabel}</label>
          <input
            id="set-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.editor.namePlaceholder}
            maxLength={80}
          />
        </div>

        <div className="word-table-heading" aria-hidden="true">
          <span>{copy.common.english}</span>
          <span>{copy.common.german}</span>
        </div>
        <div className="word-rows">
          {entries.map((entry, index) => (
            <fieldset className="word-row" key={entry.id}>
              <legend>{copy.editor.pairLegend(index + 1)}</legend>
              <span className="row-number">{String(index + 1).padStart(2, '0')}</span>
              <label>
                <span>{copy.common.english}</span>
                <input
                  lang="en-GB"
                  value={entry.english}
                  onChange={(event) => changeEntry(entry.id, 'english', event.target.value)}
                  maxLength={120}
                  autoCapitalize="none"
                />
              </label>
              <label>
                <span>{copy.common.german}</span>
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
                aria-label={copy.editor.removePair(index + 1)}
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
          {copy.editor.addPair}
        </button>

        {errorMessage ? (
          <p className="form-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            {errorMessage}
          </p>
        ) : null}
        <div className="sticky-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            {copy.editor.cancel}
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={19} aria-hidden="true" />
            {saving ? copy.editor.saving : copy.editor.save}
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
  const { copy } = useUiLanguage()
  const [direction, setDirection] = useState<PracticeDirection>('mixed')
  const [mode, setMode] = useState<PracticeMode>('learn')

  return (
    <main className="page-content narrow-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={19} aria-hidden="true" />
        {copy.setup.back}
      </button>
      <div className="page-heading">
        <div>
          <h1>{exercise.name}</h1>
          <p>
            {copy.setup.readyCount(exercise.entries.length)}
          </p>
        </div>
      </div>
      <div className="setup-sheet">
        <fieldset className="choice-group">
          <legend>{copy.setup.chooseMode}</legend>
          <label className={mode === 'learn' ? 'choice-card selected' : 'choice-card'}>
            <input type="radio" name="mode" value="learn" checked={mode === 'learn'} onChange={() => setMode('learn')} />
            <BookOpen size={24} aria-hidden="true" />
            <span>
              <strong>{copy.setup.learn}</strong>
              <small>{copy.setup.learnDetail}</small>
            </span>
            <Check size={20} className="choice-check" aria-hidden="true" />
          </label>
          <label className={mode === 'test' ? 'choice-card selected' : 'choice-card'}>
            <input type="radio" name="mode" value="test" checked={mode === 'test'} onChange={() => setMode('test')} />
            <LockKeyhole size={24} aria-hidden="true" />
            <span>
              <strong>{copy.setup.test}</strong>
              <small>{copy.setup.testDetail}</small>
            </span>
            <Check size={20} className="choice-check" aria-hidden="true" />
          </label>
        </fieldset>

        <fieldset className="choice-group direction-group">
          <legend>{copy.setup.chooseDirection}</legend>
          {(['english-to-german', 'german-to-english', 'mixed'] satisfies PracticeDirection[]).map((value) => (
            <label className={direction === value ? 'line-choice selected' : 'line-choice'} key={value}>
              <input
                type="radio"
                name="direction"
                value={value}
                checked={direction === value}
                onChange={() => setDirection(value)}
              />
              <span>
                <strong>{copy.setup.directions[value].label}</strong>
                <small>{copy.setup.directions[value].detail}</small>
              </span>
              <Check size={18} aria-hidden="true" />
            </label>
          ))}
        </fieldset>

        <button className="primary-button full-width large-button" type="button" onClick={() => onStart(direction, mode)}>
          {copy.setup.start(mode)}
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

function languageName(copy: UiCopy, language: VocabularyLanguage): string {
  return language === 'english' ? copy.common.english : copy.common.german
}

function practiceErrorMessage(copy: UiCopy, error: string): string {
  switch (error) {
    case 'playback':
      return copy.practice.errors.playback
    case 'microphonePermission':
      return copy.practice.errors.microphonePermission
    case 'recordingCheck':
      return copy.practice.errors.recordingCheck
    case 'microphoneStart':
      return copy.practice.errors.microphoneStart
    default:
      return error
  }
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
  const { copy } = useUiLanguage()
  const language = languageName(copy, word.language)

  return (
    <div className={`spelling-result result-${outcome}`}>
      {outcome === 'correct' ? (
        <>
          <Check size={22} aria-hidden="true" />
          <strong>{copy.practice.spellingCorrect(language)}</strong>
        </>
      ) : outcome === 'minor-typo' ? (
        <>
          <CircleAlert size={22} aria-hidden="true" />
          <div>
            <strong>{copy.practice.spellingAlmost(language)}</strong>
            <p>{copy.practice.spellingTypo}</p>
          </div>
        </>
      ) : (
        <>
          <RotateCcw size={22} aria-hidden="true" />
          <div>
            <strong>{copy.practice.spellingRetry(language)}</strong>
            <p>{copy.practice.spellingHidden}</p>
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
  const { copy } = useUiLanguage()
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
  const [storageWarning, setStorageWarning] = useState(false)
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
      dispatch({ type: 'FAIL', message: 'playback' })
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
          ? 'microphonePermission'
          : 'recordingCheck'
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
          ? 'microphonePermission'
          : 'microphoneStart'
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
    setStorageWarning(false)
    void saveAttempt(attempt).catch(() => {
      if (currentAttemptId.current === attempt.id) {
        setStorageWarning(true)
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
    setStorageWarning(false)
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
          {copy.practice.leave}
        </button>
        <span>
          {state.itemIndex + 1} / {state.totalItems}
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={copy.practice.wordProgress(state.itemIndex + 1, state.totalItems)}
        aria-valuemin={0}
        aria-valuemax={state.totalItems}
        aria-valuenow={state.itemIndex + (state.phase === 'revealed' ? 1 : 0)}
      >
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>

      <section className="practice-specimen" aria-live="polite">
        <div className="specimen-meta">
          <span>{prompt.direction === 'english-to-german' ? 'EN → DE' : 'DE → EN'}</span>
          <span>{copy.practice.modeLabel(mode)}</span>
        </div>
        <p className="prompt-label">{copy.practice.audioCue}</p>
        <div className="audio-cue">
          <Headphones size={44} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>{copy.practice.listenTo(languageName(copy, cue.language))}</strong>
            <small>{copy.practice.spellingIntroduction}</small>
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
              <strong>{copy.practice.failedTitle}</strong>
              <p>{practiceErrorMessage(copy, state.error)}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => dispatch({ type: 'RETRY' })}>
              <RotateCcw size={18} aria-hidden="true" />
              {copy.practice.tryAgain}
            </button>
          </div>
        ) : null}

        {state.phase === 'ready' && !state.error ? (
          <div className={state.hasListened ? 'practice-actions ready-to-speak' : 'practice-actions'}>
            <button className="secondary-button large-button" type="button" onClick={() => void playCue()} disabled={!online || playing}>
              <Speaker size={22} aria-hidden="true" />
              {playing
                ? copy.practice.playing
                : state.hasListened
                  ? copy.practice.listenAgain
                  : copy.practice.listen}
            </button>
            {state.hasListened ? (
              <>
                <button className="record-button" type="button" onClick={() => void startRecording()} disabled={!online}>
                  <Mic size={27} aria-hidden="true" />
                  <span>{copy.practice.speakEnglish}</span>
                  <small>{copy.practice.speakHint}</small>
                </button>
                <button className="secondary-button skip-button" type="button" onClick={() => skipWord('speaking')}>
                  {copy.practice.skip}
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {state.phase === 'playing' ? (
          <div className="processing-state" role="status">
            <Headphones size={30} aria-hidden="true" />
            <strong>{copy.practice.listenCarefully}</strong>
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
            <strong>{copy.practice.listening}</strong>
            <button className="stop-button" type="button" onClick={() => void finishRecording()}>
              <Square size={20} fill="currentColor" aria-hidden="true" />
              {copy.practice.stopAndCheck}
            </button>
          </div>
        ) : null}

        {state.phase === 'processing' ? (
          <div className="processing-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <strong>{copy.practice.checkingSpeech}</strong>
            <small>{copy.practice.recordingDiscarded}</small>
          </div>
        ) : null}

        {state.phase === 'speech-retry' && spokenOutcome && !state.error ? (
          <div className="speech-retry-step">
            <div className={`speech-feedback outcome-${spokenOutcome}`} role="status">
              <RotateCcw size={21} aria-hidden="true" />
              <div>
                <strong>{copy.practice.spokenMessages[spokenOutcome]}</strong>
                {spokenScore !== null && mode === 'learn' ? (
                  <small>{copy.practice.pronunciation(Math.round(spokenScore))}</small>
                ) : null}
              </div>
            </div>
            <div className="practice-actions ready-to-speak">
              <button className="secondary-button large-button" type="button" onClick={() => void playCue()} disabled={!online || playing}>
                <Speaker size={22} aria-hidden="true" />
                {playing ? copy.practice.playing : copy.practice.listenAgain}
              </button>
              <button className="record-button" type="button" onClick={() => void startRecording()} disabled={!online}>
                <Mic size={27} aria-hidden="true" />
                <span>{copy.practice.speakAgain}</span>
                <small>{copy.practice.speakHint}</small>
              </button>
              <button className="secondary-button skip-button" type="button" onClick={() => skipWord('speaking')}>
                {copy.practice.skip}
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
                <strong>{copy.practice.spokenMessages[spokenOutcome]}</strong>
                {spokenScore !== null && mode === 'learn' ? (
                  <small>{copy.practice.pronunciation(Math.round(spokenScore))}</small>
                ) : null}
              </div>
            </div>
            <form onSubmit={submitSpelling}>
              <fieldset className="spelling-fields">
                <legend>{copy.practice.writeLegend(prompt.spellingLanguages.length)}</legend>
                {prompt.spellingLanguages.map((language, index) => {
                  const word = prompt.words[language]
                  const outcome = spellingOutcomes[language]
                  const detail = copy.practice.spellingDetail(language, prompt.direction)
                  return (
                    <div className="spelling-field" key={language}>
                      <label htmlFor={`spelling-${language}`}>
                        {copy.practice.spellingLabel(
                          language,
                          languageName(copy, language),
                        )}
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
                    ? copy.practice.checkAgain
                    : prompt.spellingLanguages.length === 2
                      ? copy.practice.checkBoth
                      : copy.practice.checkEnglish}
                  <ChevronRight size={21} aria-hidden="true" />
                </button>
                <button className="secondary-button full-width" type="button" onClick={() => skipWord('spelling')}>
                  {copy.practice.skip}
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
                    ? copy.practice.firstTry
                    : copy.practice.needsPractice}
                </strong>
                <p>
                  {currentAttempt.completion === 'retried'
                    ? copy.practice.completedAfterRetries(currentAttempt.retryCount)
                    : currentAttempt.completion === 'skipped'
                      ? copy.practice.skippedDuring(currentAttempt.skippedAt)
                      : copy.practice.allCorrect}
                </p>
              </div>
            </div>
            <div className="answer-ledger" aria-label={copy.practice.correctPair}>
              <div>
                <span>{copy.common.english}</span>
                <strong lang="en-GB">{prompt.words.english.text}</strong>
              </div>
              <div>
                <span>{copy.common.german}</span>
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
                {copy.practice.historyWarning}
              </p>
            ) : null}
            <div className="reveal-actions">
              <button className="secondary-button" type="button" onClick={() => void playCue()} disabled={!online || playing}>
                <Speaker size={20} aria-hidden="true" />
                {playing ? copy.practice.playing : copy.practice.hearAgain}
              </button>
              <button className="primary-button" type="button" onClick={next}>
                {state.itemIndex + 1 === state.totalItems
                  ? copy.practice.seeResults
                  : copy.practice.nextWord}
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
  const { copy } = useUiLanguage()
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
      <h1>{copy.results.title}</h1>
      <p className="lede">{exercise.name}</p>
      <section className="performance-summary" aria-labelledby="performance-title">
        <div className="performance-heading">
          <div>
            <h2 id="performance-title">{copy.results.performanceTitle}</h2>
            <p>
              {copy.results.performanceSummary(performance.firstTry, performance.total)}
            </p>
          </div>
          <strong className="performance-score">{performance.percentage}%</strong>
        </div>
        <div
          className="performance-track"
          role="progressbar"
          aria-label={copy.results.performanceLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={performance.percentage}
        >
          <span style={{ transform: `scaleX(${performance.percentage / 100})` }} />
        </div>
        <div className="performance-key" aria-label={copy.results.breakdownLabel}>
          <span><b>{performance.firstTry}</b> {copy.results.firstTry}</span>
          <span><b>{performance.retried}</b> {copy.results.retried}</span>
          <span><b>{performance.skipped}</b> {copy.results.skipped}</span>
        </div>
      </section>
      <div className="result-ledger">
        <div>
          <span>{copy.results.spokenClearly}</span>
          <strong>
            {spokenCorrect}<small> / {attempts.length}</small>
          </strong>
        </div>
        <div>
          <span>{copy.results.spelledExactly}</span>
          <strong>
            {englishSpellingCorrect}<small> / {attempts.length}</small>
          </strong>
        </div>
        {germanAttempts.length > 0 ? (
          <div>
            <span>{copy.results.germanExactly}</span>
            <strong>
              {germanSpellingCorrect}<small> / {germanAttempts.length}</small>
            </strong>
          </div>
        ) : null}
        <div>
          <span>{copy.results.review}</span>
          <strong>{reviewCount}</strong>
        </div>
      </div>
      <section className="word-results" aria-labelledby="word-results-title">
        <h2 id="word-results-title">{copy.results.wordByWord}</h2>
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
                      {attempt.completion === 'first-try'
                        ? copy.results.firstTry
                        : copy.results.needsPractice}
                    </strong>
                    {attempt.completion === 'retried' ? (
                      <small>
                        {copy.results.retryCount(attempt.retryCount)}
                      </small>
                    ) : attempt.completion === 'skipped' ? (
                      <small>{copy.results.skipped}</small>
                    ) : null}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </section>
      <p className="result-note">
        {copy.results.note}
      </p>
      <div className="results-actions">
        <button className="secondary-button" type="button" onClick={onDone}>
          {copy.results.back}
        </button>
        <button className="primary-button" type="button" onClick={onAgain}>
          <RotateCcw size={19} aria-hidden="true" />
          {copy.results.again}
        </button>
      </div>
    </main>
  )
}

function LoadingScreen() {
  const { copy } = useUiLanguage()
  return (
    <div className="app-shell access-shell">
      <ShellHeader minimal />
      <main className="loading-main" aria-live="polite">
        <span className="spinner cobalt" aria-hidden="true" />
        <p>{copy.loading.opening}</p>
      </main>
    </div>
  )
}

function StorageUnavailableScreen() {
  const { copy } = useUiLanguage()
  return (
    <div className="app-shell access-shell">
      <ShellHeader minimal />
      <main className="access-main">
        <section className="access-card" aria-labelledby="storage-title">
          <CircleAlert className="access-icon" size={30} aria-hidden="true" />
          <h1 id="storage-title">{copy.storage.title}</h1>
          <p className="lede">
            {copy.storage.description}
          </p>
          <button
            className="primary-button full-width"
            type="button"
            onClick={() => window.location.reload()}
          >
            {copy.storage.retry}
          </button>
        </section>
      </main>
    </div>
  )
}

function AppContent() {
  const { copy } = useUiLanguage()
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
    if (!window.confirm(copy.library.deleteConfirmation(exercise.name))) {
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
          {copy.notices.localOnly}
        </div>
      ) : null}
      {content}
      {view.name !== 'practice' ? (
        <footer>
          <span>{copy.footer.local}</span>
          <span aria-hidden="true">•</span>
          <span>{copy.footer.noScores}</span>
        </footer>
      ) : null}
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  )
}
