import type { PracticeMode } from './types.js'

export type PracticePhase =
  | 'ready'
  | 'playing'
  | 'recording'
  | 'processing'
  | 'speech-retry'
  | 'spelling'
  | 'revealed'
  | 'complete'

export interface PracticeState {
  phase: PracticePhase
  resumePhase: 'ready' | 'speech-retry' | 'revealed'
  itemIndex: number
  totalItems: number
  mode: PracticeMode
  hasListened: boolean
  error: string | null
}

export type PracticeEvent =
  | { type: 'PLAY' }
  | { type: 'PLAY_FINISHED' }
  | { type: 'RECORD' }
  | { type: 'CANCEL_RECORDING' }
  | { type: 'RECORDED' }
  | { type: 'SPEECH_FINISHED'; passed: boolean }
  | { type: 'SPELLING_SUBMITTED'; passed: boolean }
  | { type: 'SKIP' }
  | { type: 'NEXT' }
  | { type: 'FAIL'; message: string }
  | { type: 'RETRY' }

const allowedEvents: Record<PracticePhase, readonly PracticeEvent['type'][]> = {
  ready: ['PLAY', 'RECORD', 'SKIP', 'FAIL'],
  playing: ['PLAY_FINISHED', 'FAIL'],
  recording: ['CANCEL_RECORDING', 'RECORDED', 'FAIL'],
  processing: ['SPEECH_FINISHED', 'FAIL'],
  'speech-retry': ['PLAY', 'RECORD', 'SKIP', 'FAIL'],
  spelling: ['SPELLING_SUBMITTED', 'SKIP', 'FAIL'],
  revealed: ['PLAY', 'NEXT', 'FAIL'],
  complete: [],
}

export function initialPracticeState(
  totalItems: number,
  mode: PracticeMode,
): PracticeState {
  if (!Number.isInteger(totalItems) || totalItems < 1) {
    throw new Error('Practice requires at least one item')
  }

  return {
    phase: 'ready',
    resumePhase: 'ready',
    itemIndex: 0,
    totalItems,
    mode,
    hasListened: false,
    error: null,
  }
}

export function practiceReducer(
  state: PracticeState,
  event: PracticeEvent,
): PracticeState {
  if (event.type === 'RETRY' && state.error) {
    return { ...state, error: null }
  }

  if (event.type === 'RECORD' && !state.hasListened) {
    return state
  }

  if (event.type === 'SKIP' && state.phase === 'ready' && !state.hasListened) {
    return state
  }

  if (!allowedEvents[state.phase].includes(event.type)) {
    return state
  }

  switch (event.type) {
    case 'PLAY':
      return {
        ...state,
        phase: 'playing',
        resumePhase:
          state.phase === 'revealed' || state.phase === 'speech-retry'
            ? state.phase
            : 'ready',
        error: null,
      }
    case 'PLAY_FINISHED':
      return {
        ...state,
        phase: state.resumePhase,
        hasListened: true,
      }
    case 'RECORD':
      return {
        ...state,
        phase: 'recording',
        resumePhase: state.phase === 'speech-retry' ? 'speech-retry' : 'ready',
        error: null,
      }
    case 'CANCEL_RECORDING':
      return { ...state, phase: state.resumePhase }
    case 'RECORDED':
      return { ...state, phase: 'processing' }
    case 'SPEECH_FINISHED':
      return { ...state, phase: event.passed ? 'spelling' : 'speech-retry' }
    case 'SPELLING_SUBMITTED':
      return { ...state, phase: event.passed ? 'revealed' : 'spelling' }
    case 'SKIP':
      return { ...state, phase: 'revealed', error: null }
    case 'NEXT': {
      const nextIndex = state.itemIndex + 1
      return nextIndex >= state.totalItems
        ? { ...state, phase: 'complete' }
        : {
            ...state,
            phase: 'ready',
            resumePhase: 'ready',
            itemIndex: nextIndex,
            hasListened: false,
            error: null,
          }
    }
    case 'FAIL':
      return {
        ...state,
        phase:
          state.phase === 'playing' ||
          state.phase === 'recording' ||
          state.phase === 'processing'
            ? state.resumePhase
            : state.phase,
        error: event.message,
      }
    case 'RETRY':
      return state
  }
}
