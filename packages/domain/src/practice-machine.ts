import type { PracticeMode } from './types.js'

export type PracticePhase =
  | 'ready'
  | 'playing'
  | 'recording'
  | 'processing'
  | 'spelling'
  | 'revealed'
  | 'complete'

export interface PracticeState {
  phase: PracticePhase
  itemIndex: number
  totalItems: number
  mode: PracticeMode
  error: string | null
}

export type PracticeEvent =
  | { type: 'PLAY' }
  | { type: 'PLAY_FINISHED' }
  | { type: 'RECORD' }
  | { type: 'CANCEL_RECORDING' }
  | { type: 'RECORDED' }
  | { type: 'SPEECH_FINISHED' }
  | { type: 'SPELLING_SUBMITTED' }
  | { type: 'NEXT' }
  | { type: 'FAIL'; message: string }
  | { type: 'RETRY' }

const allowedEvents: Record<PracticePhase, readonly PracticeEvent['type'][]> = {
  ready: ['PLAY', 'RECORD', 'FAIL'],
  playing: ['PLAY_FINISHED', 'FAIL'],
  recording: ['CANCEL_RECORDING', 'RECORDED', 'FAIL'],
  processing: ['SPEECH_FINISHED', 'FAIL'],
  spelling: ['SPELLING_SUBMITTED', 'FAIL'],
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

  return { phase: 'ready', itemIndex: 0, totalItems, mode, error: null }
}

export function practiceReducer(
  state: PracticeState,
  event: PracticeEvent,
): PracticeState {
  if (event.type === 'RETRY' && state.error) {
    return { ...state, phase: 'ready', error: null }
  }

  if (!allowedEvents[state.phase].includes(event.type)) {
    return state
  }

  switch (event.type) {
    case 'PLAY':
      return { ...state, phase: 'playing', error: null }
    case 'PLAY_FINISHED':
      return { ...state, phase: 'ready' }
    case 'RECORD':
      return { ...state, phase: 'recording', error: null }
    case 'CANCEL_RECORDING':
      return { ...state, phase: 'ready' }
    case 'RECORDED':
      return { ...state, phase: 'processing' }
    case 'SPEECH_FINISHED':
      return { ...state, phase: 'spelling' }
    case 'SPELLING_SUBMITTED':
      return { ...state, phase: 'revealed' }
    case 'NEXT': {
      const nextIndex = state.itemIndex + 1
      return nextIndex >= state.totalItems
        ? { ...state, phase: 'complete' }
        : { ...state, phase: 'ready', itemIndex: nextIndex, error: null }
    }
    case 'FAIL':
      return { ...state, phase: 'ready', error: event.message }
    case 'RETRY':
      return state
  }
}

export function mayRevealTarget(mode: PracticeMode, phase: PracticePhase): boolean {
  return mode === 'learn' || phase === 'revealed' || phase === 'complete'
}
