import type {
  PracticeDirection,
  PracticeMode,
  SkippedPracticeStep,
  SpokenOutcome,
  VocabularyLanguage,
} from '@vocabulary/domain'
import { createContext, useContext } from 'react'

export type UiLanguage = 'en' | 'de'

const english = {
  settings: {
    open: 'Open settings',
    title: 'Settings',
    description: 'Choose the language used for buttons, instructions and feedback.',
    languageLegend: 'App language',
    englishName: 'English',
    englishDetail: 'Use the app in English',
    germanName: 'Deutsch',
    germanDetail: 'Use the app in German',
    loadError:
      'Your saved language could not be read on this device. Choose a language to save it again.',
    saveError:
      'The language could not be saved on this device. Try again.',
  },
  common: {
    logout: 'Log out',
    english: 'English',
    german: 'German',
  },
  notices: {
    offline:
      'Your words are still here. Listening and speaking need an internet connection.',
    updateReady: 'A fresh version is ready.',
    updateNow: 'Update now',
    localOnly:
      'The private service cannot be reached. You can still edit local word lists.',
  },
  access: {
    serviceUnavailable: 'The private speech service is not available right now.',
    sessionExpired:
      'Your 30-day session ended. Sign in again; your word lists are still on this iPhone.',
    tooManyTries: (minutes: number) =>
      `Too many tries. Wait about ${minutes} minute${minutes === 1 ? '' : 's'}, then try again.`,
    invalidCode: 'That code did not work. Check it and try again.',
    title: 'Open your words',
    description:
      'Use your family access code. Your word lists and practice history stay on this iPhone.',
    codeLabel: 'Family access code',
    opening: 'Opening…',
    openTutor: 'Open tutor',
    privacy: 'Audio is used only for the current check and is then discarded.',
  },
  library: {
    emptyTitle: 'Your cabinet is empty',
    emptyDescription:
      'Add a short list for the next vocabulary lesson. You can change it at any time.',
    createFirst: 'Create first word list',
    title: 'Word lists',
    description: 'Choose a drawer to practise, or prepare a new one.',
    newList: 'New list',
    pairCount: (count: number) => `${count} ${count === 1 ? 'word pair' : 'word pairs'}`,
    unavailableTitle: 'Sign in while online to use listening and speaking practice.',
    practise: 'Practise this list',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirmation: (name: string) =>
      `Delete “${name}” and its local practice history?`,
  },
  editor: {
    missingName: 'Give this word list a name.',
    missingPair: 'Add at least one English and German word pair.',
    incompletePair: 'Complete both sides of every word pair.',
    saveError:
      'This list could not be saved on the iPhone. Check available storage and try again.',
    back: 'Word lists',
    editTitle: 'Edit word list',
    buildTitle: 'Build a word list',
    description: 'Keep phrases short so speaking feedback stays clear.',
    nameLabel: 'List name',
    namePlaceholder: 'For example: Unit 4',
    pairLegend: (index: number) => `Word pair ${index}`,
    removePair: (index: number) => `Remove word pair ${index}`,
    addPair: 'Add another pair',
    cancel: 'Cancel',
    saving: 'Saving…',
    save: 'Save list',
  },
  setup: {
    back: 'Word lists',
    readyCount: (count: number) =>
      `${count} ${count === 1 ? 'word pair is' : 'word pairs are'} ready.`,
    chooseMode: 'Choose a mode',
    learn: 'Learn',
    learnDetail: 'Hear the cue, practise English speech, then write.',
    test: 'Test',
    testDetail: 'Complete every check before either word appears.',
    chooseDirection: 'Choose a direction',
    directions: {
      'english-to-german': {
        label: 'English → German',
        detail: 'Hear English; speak English; write German and English.',
      },
      'german-to-english': {
        label: 'German → English',
        detail: 'Hear German; speak and write the English translation.',
      },
      mixed: {
        label: 'Mix both directions',
        detail: 'Switch the audio cue while keeping English as the focus.',
      },
    },
    start: (mode: PracticeMode) => `Start ${mode === 'learn' ? 'learning' : 'test'}`,
  },
  practice: {
    spokenMessages: {
      correct: 'That sounded right.',
      'different-word':
        'That sounded like a different English word. Listen again, then try once more.',
      'pronunciation-retry':
        'The English word was recognised. Try it again a little slower and clearer.',
      'no-speech': 'No clear speech was heard. You can try again.',
      'low-confidence':
        'The recording was not clear enough to judge. Try again in a quieter spot.',
      'service-unavailable':
        'Speaking feedback is unavailable right now. Try again in a moment.',
    } satisfies Record<SpokenOutcome, string>,
    spellingCorrect: (language: string) => `${language} spelling correct`,
    spellingAlmost: (language: string) => `Almost right in ${language}`,
    spellingTypo: 'There is one small typo. Fix it, then check again.',
    spellingRetry: (language: string) => `Try the ${language} word again`,
    spellingHidden:
      'The answer stays hidden until it is correct or you skip this word.',
    errors: {
      playback: 'The word could not be played. Check the connection and try again.',
      microphonePermission:
        'Microphone access is off. Allow it in Safari settings, then try again.',
      recordingCheck:
        'The recording could not be checked. Nothing was saved; please try again.',
      microphoneStart: 'The microphone could not start. Check Safari settings and try again.',
    },
    historyWarning:
      'This attempt could not be added to local history, but you can keep practising.',
    leave: 'Leave',
    wordProgress: (current: number, total: number) => `Word ${current} of ${total}`,
    modeLabel: (mode: PracticeMode) => (mode === 'learn' ? 'LEARN' : 'TEST'),
    audioCue: 'Audio cue',
    listenTo: (language: string) => `Listen to the ${language} word`,
    spellingIntroduction:
      'No English or German spelling appears until your checks are complete.',
    failedTitle: 'That did not work',
    tryAgain: 'Try again',
    playing: 'Playing…',
    listenAgain: 'Listen again',
    listen: 'Listen',
    speakEnglish: 'Speak English',
    speakHint: 'Say the English word · Up to 8 seconds',
    skip: 'Skip this word',
    listenCarefully: 'Listen carefully…',
    listening: 'Listening…',
    stopAndCheck: 'Stop and check',
    checkingSpeech: 'Checking your speech…',
    recordingDiscarded: 'The recording is discarded after this check.',
    speakAgain: 'Try speaking again',
    pronunciation: (score: number) => `English pronunciation: ${score} / 100`,
    writeLegend: (count: number) =>
      `Now write ${count === 2 ? 'both words' : 'the English word'}`,
    spellingDetail: (language: VocabularyLanguage, direction: PracticeDirection) => {
      if (language === 'german') {
        return 'Write the German meaning of the English cue.'
      }
      return direction === 'english-to-german'
        ? 'Write the English word you heard.'
        : 'Write the English translation of the German cue.'
    },
    spellingLabel: (language: VocabularyLanguage, languageName: string) =>
      `${languageName} ${language === 'german' ? 'translation' : 'spelling'}`,
    checkAgain: 'Check again',
    checkBoth: 'Check both answers',
    checkEnglish: 'Check English spelling',
    firstTry: 'Completed on the first try',
    needsPractice: 'Needs practice',
    completedAfterRetries: (count: number) =>
      `Completed after ${count} ${count === 1 ? 'retry' : 'retries'}.`,
    skippedDuring: (step: SkippedPracticeStep | undefined) =>
      step ? `Skipped during ${step === 'speaking' ? 'speaking' : 'writing'}.` : 'Skipped.',
    allCorrect: 'Every check was correct straight away.',
    correctPair: 'Correct word pair',
    hearAgain: 'Hear the cue again',
    seeResults: 'See results',
    nextWord: 'Next word',
  },
  results: {
    title: 'Practice finished',
    performanceTitle: 'First-try performance',
    performanceSummary: (firstTry: number, total: number) =>
      `${firstTry} of ${total} words completed without a retry or skip`,
    performanceLabel: 'First-try performance',
    breakdownLabel: 'Performance breakdown',
    firstTry: 'First try',
    retried: 'Retried',
    skipped: 'Skipped',
    spokenClearly: 'English spoken clearly',
    spelledExactly: 'English spelled exactly',
    germanExactly: 'German translated exactly',
    review: 'Worth another look',
    wordByWord: 'Word by word',
    needsPractice: 'Needs practice',
    retryCount: (count: number) => `${count} ${count === 1 ? 'retry' : 'retries'}`,
    note:
      'This is practice feedback, not a test grade. A quiet room and a clear voice help the speech check.',
    back: 'Back to lists',
    again: 'Practise again',
  },
  loading: {
    opening: 'Opening your words…',
  },
  storage: {
    title: 'Local storage is unavailable',
    description:
      'Safari could not open the word lists on this device. Check that private browsing is off and that storage is available, then reload the app.',
    retry: 'Try again',
  },
  footer: {
    local: 'Stored only on this device',
    noScores: 'No points or streaks',
  },
} as const

type WidenCopy<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => string
  : T extends string
    ? string
    : { [Key in keyof T]: WidenCopy<T[Key]> }

export type UiCopy = WidenCopy<typeof english>

const german: UiCopy = {
  settings: {
    open: 'Einstellungen öffnen',
    title: 'Einstellungen',
    description:
      'Wähle die Sprache für Schaltflächen, Anleitungen und Rückmeldungen.',
    languageLegend: 'App-Sprache',
    englishName: 'Englisch',
    englishDetail: 'App auf Englisch verwenden',
    germanName: 'Deutsch',
    germanDetail: 'App auf Deutsch verwenden',
    loadError:
      'Die gespeicherte Sprache konnte auf diesem Gerät nicht gelesen werden. Wähle eine Sprache aus, um sie erneut zu speichern.',
    saveError:
      'Die Sprache konnte auf diesem Gerät nicht gespeichert werden. Versuche es erneut.',
  },
  common: {
    logout: 'Abmelden',
    english: 'Englisch',
    german: 'Deutsch',
  },
  notices: {
    offline:
      'Deine Wörter sind weiterhin da. Zum Hören und Sprechen brauchst du eine Internetverbindung.',
    updateReady: 'Eine neue Version ist bereit.',
    updateNow: 'Jetzt aktualisieren',
    localOnly:
      'Der private Dienst ist nicht erreichbar. Du kannst deine lokalen Wortlisten weiterhin bearbeiten.',
  },
  access: {
    serviceUnavailable: 'Der private Sprachdienst ist gerade nicht verfügbar.',
    sessionExpired:
      'Deine 30-tägige Sitzung ist abgelaufen. Melde dich erneut an; deine Wortlisten sind weiterhin auf diesem iPhone.',
    tooManyTries: (minutes) =>
      `Zu viele Versuche. Warte etwa ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} und versuche es dann erneut.`,
    invalidCode: 'Dieser Code hat nicht funktioniert. Prüfe ihn und versuche es erneut.',
    title: 'Deine Wörter öffnen',
    description:
      'Verwende den Zugangscode deiner Familie. Deine Wortlisten und dein Übungsverlauf bleiben auf diesem iPhone.',
    codeLabel: 'Familien-Zugangscode',
    opening: 'Wird geöffnet…',
    openTutor: 'Trainer öffnen',
    privacy:
      'Audio wird nur für die aktuelle Prüfung verwendet und danach gelöscht.',
  },
  library: {
    emptyTitle: 'Dein Karteikasten ist leer',
    emptyDescription:
      'Lege eine kurze Liste für die nächste Vokabelstunde an. Du kannst sie jederzeit ändern.',
    createFirst: 'Erste Wortliste anlegen',
    title: 'Wortlisten',
    description: 'Wähle eine Schublade zum Üben oder lege eine neue an.',
    newList: 'Neue Liste',
    pairCount: (count) => `${count} ${count === 1 ? 'Wortpaar' : 'Wortpaare'}`,
    unavailableTitle:
      'Melde dich mit Internetverbindung an, um Hören und Sprechen zu üben.',
    practise: 'Diese Liste üben',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    deleteConfirmation: (name) =>
      `„${name}“ und den lokalen Übungsverlauf löschen?`,
  },
  editor: {
    missingName: 'Gib dieser Wortliste einen Namen.',
    missingPair: 'Füge mindestens ein englisch-deutsches Wortpaar hinzu.',
    incompletePair: 'Fülle bei jedem Wortpaar beide Seiten aus.',
    saveError:
      'Diese Liste konnte nicht auf dem iPhone gespeichert werden. Prüfe den freien Speicher und versuche es erneut.',
    back: 'Wortlisten',
    editTitle: 'Wortliste bearbeiten',
    buildTitle: 'Wortliste anlegen',
    description:
      'Halte Ausdrücke kurz, damit die Rückmeldung beim Sprechen klar bleibt.',
    nameLabel: 'Name der Liste',
    namePlaceholder: 'Zum Beispiel: Lektion 4',
    pairLegend: (index) => `Wortpaar ${index}`,
    removePair: (index) => `Wortpaar ${index} entfernen`,
    addPair: 'Weiteres Wortpaar',
    cancel: 'Abbrechen',
    saving: 'Wird gespeichert…',
    save: 'Liste speichern',
  },
  setup: {
    back: 'Wortlisten',
    readyCount: (count) =>
      `${count} ${count === 1 ? 'Wortpaar ist' : 'Wortpaare sind'} bereit.`,
    chooseMode: 'Modus wählen',
    learn: 'Lernen',
    learnDetail: 'Höre den Hinweis, übe die englische Aussprache und schreibe dann.',
    test: 'Test',
    testDetail: 'Schließe alle Prüfungen ab, bevor eines der Wörter erscheint.',
    chooseDirection: 'Richtung wählen',
    directions: {
      'english-to-german': {
        label: 'Englisch → Deutsch',
        detail: 'Höre Englisch; sprich Englisch; schreibe Deutsch und Englisch.',
      },
      'german-to-english': {
        label: 'Deutsch → Englisch',
        detail: 'Höre Deutsch; sprich und schreibe die englische Übersetzung.',
      },
      mixed: {
        label: 'Beide Richtungen mischen',
        detail: 'Wechsle den Hörhinweis; Englisch bleibt der Schwerpunkt.',
      },
    },
    start: (mode) => (mode === 'learn' ? 'Lernen starten' : 'Test starten'),
  },
  practice: {
    spokenMessages: {
      correct: 'Das klang richtig.',
      'different-word':
        'Das klang wie ein anderes englisches Wort. Höre noch einmal zu und versuche es erneut.',
      'pronunciation-retry':
        'Das englische Wort wurde erkannt. Sprich es noch einmal etwas langsamer und deutlicher.',
      'no-speech': 'Es wurde keine klare Sprache erkannt. Versuche es erneut.',
      'low-confidence':
        'Die Aufnahme war nicht klar genug. Versuche es noch einmal an einem ruhigeren Ort.',
      'service-unavailable':
        'Die Rückmeldung zum Sprechen ist gerade nicht verfügbar. Versuche es gleich noch einmal.',
    },
    spellingCorrect: (language) => `${language} richtig geschrieben`,
    spellingAlmost: (language) => `Fast richtig auf ${language}`,
    spellingTypo:
      'Es gibt einen kleinen Tippfehler. Korrigiere ihn und prüfe noch einmal.',
    spellingRetry: (language) =>
      `Versuche das ${language.toLocaleLowerCase('de-DE')}e Wort noch einmal`,
    spellingHidden:
      'Die Antwort bleibt verborgen, bis sie richtig ist oder du dieses Wort überspringst.',
    errors: {
      playback:
        'Das Wort konnte nicht abgespielt werden. Prüfe die Verbindung und versuche es erneut.',
      microphonePermission:
        'Der Mikrofonzugriff ist ausgeschaltet. Erlaube ihn in den Safari-Einstellungen und versuche es erneut.',
      recordingCheck:
        'Die Aufnahme konnte nicht geprüft werden. Es wurde nichts gespeichert; versuche es erneut.',
      microphoneStart:
        'Das Mikrofon konnte nicht gestartet werden. Prüfe die Safari-Einstellungen und versuche es erneut.',
    },
    historyWarning:
      'Dieser Versuch konnte nicht im lokalen Verlauf gespeichert werden. Du kannst trotzdem weiterüben.',
    leave: 'Verlassen',
    wordProgress: (current, total) => `Wort ${current} von ${total}`,
    modeLabel: (mode) => (mode === 'learn' ? 'LERNEN' : 'TEST'),
    audioCue: 'Hörhinweis',
    listenTo: (language) =>
      `Höre dir das ${language.toLocaleLowerCase('de-DE')}e Wort an`,
    spellingIntroduction:
      'Die englische oder deutsche Schreibweise erscheint erst, wenn du alle Prüfungen abgeschlossen hast.',
    failedTitle: 'Das hat nicht funktioniert',
    tryAgain: 'Erneut versuchen',
    playing: 'Wird abgespielt…',
    listenAgain: 'Noch einmal anhören',
    listen: 'Anhören',
    speakEnglish: 'Englisch sprechen',
    speakHint: 'Sprich das englische Wort · Bis zu 8 Sekunden',
    skip: 'Dieses Wort überspringen',
    listenCarefully: 'Hör genau zu…',
    listening: 'Aufnahme läuft…',
    stopAndCheck: 'Stoppen und prüfen',
    checkingSpeech: 'Deine Aussprache wird geprüft…',
    recordingDiscarded: 'Die Aufnahme wird nach dieser Prüfung gelöscht.',
    speakAgain: 'Noch einmal sprechen',
    pronunciation: (score) => `Englische Aussprache: ${score} / 100`,
    writeLegend: (count) =>
      count === 2
        ? 'Schreibe jetzt beide Wörter'
        : 'Schreibe jetzt das englische Wort',
    spellingDetail: (language, direction) => {
      if (language === 'german') {
        return 'Schreibe die deutsche Bedeutung des englischen Hörhinweises.'
      }
      return direction === 'english-to-german'
        ? 'Schreibe das englische Wort, das du gehört hast.'
        : 'Schreibe die englische Übersetzung des deutschen Hörhinweises.'
    },
    spellingLabel: (language, languageName) =>
      language === 'german'
        ? `${languageName}e Übersetzung`
        : `${languageName}e Schreibweise`,
    checkAgain: 'Noch einmal prüfen',
    checkBoth: 'Beide Antworten prüfen',
    checkEnglish: 'Englische Schreibweise prüfen',
    firstTry: 'Beim ersten Versuch geschafft',
    needsPractice: 'Braucht noch Übung',
    completedAfterRetries: (count) =>
      `Nach ${count} ${count === 1 ? 'Wiederholung' : 'Wiederholungen'} abgeschlossen.`,
    skippedDuring: (step) =>
      step
        ? `Beim ${step === 'speaking' ? 'Sprechen' : 'Schreiben'} übersprungen.`
        : 'Übersprungen.',
    allCorrect: 'Alle Prüfungen waren sofort richtig.',
    correctPair: 'Richtiges Wortpaar',
    hearAgain: 'Hörhinweis erneut anhören',
    seeResults: 'Ergebnisse ansehen',
    nextWord: 'Nächstes Wort',
  },
  results: {
    title: 'Übung abgeschlossen',
    performanceTitle: 'Beim ersten Versuch',
    performanceSummary: (firstTry, total) =>
      `${firstTry} von ${total} ${total === 1 ? 'Wort' : 'Wörtern'} ohne Wiederholung oder Überspringen abgeschlossen`,
    performanceLabel: 'Leistung beim ersten Versuch',
    breakdownLabel: 'Leistungsübersicht',
    firstTry: 'Erster Versuch',
    retried: 'Wiederholt',
    skipped: 'Übersprungen',
    spokenClearly: 'Englisch klar gesprochen',
    spelledExactly: 'Englisch genau geschrieben',
    germanExactly: 'Deutsch genau übersetzt',
    review: 'Noch einmal ansehen',
    wordByWord: 'Wort für Wort',
    needsPractice: 'Braucht noch Übung',
    retryCount: (count) =>
      `${count} ${count === 1 ? 'Wiederholung' : 'Wiederholungen'}`,
    note:
      'Das ist eine Rückmeldung zum Üben, keine Testnote. Ein ruhiger Raum und eine klare Stimme helfen bei der Sprachprüfung.',
    back: 'Zurück zu den Listen',
    again: 'Noch einmal üben',
  },
  loading: {
    opening: 'Deine Wörter werden geöffnet…',
  },
  storage: {
    title: 'Lokaler Speicher ist nicht verfügbar',
    description:
      'Safari konnte die Wortlisten auf diesem Gerät nicht öffnen. Deaktiviere privates Surfen, prüfe den verfügbaren Speicher und lade die App neu.',
    retry: 'Erneut versuchen',
  },
  footer: {
    local: 'Nur auf diesem Gerät gespeichert',
    noScores: 'Keine Punkte oder Serien',
  },
}

export const translations: Record<UiLanguage, UiCopy> = {
  en: english,
  de: german,
}

export type UiLanguageContextValue = {
  language: UiLanguage
  copy: UiCopy
  preferenceLoadFailed: boolean
  changeLanguage: (language: UiLanguage) => Promise<void>
}

export const UiLanguageContext = createContext<UiLanguageContextValue | null>(null)

export function useUiLanguage(): UiLanguageContextValue {
  const context = useContext(UiLanguageContext)
  if (!context) {
    throw new Error('useUiLanguage must be used inside LanguageProvider')
  }
  return context
}
