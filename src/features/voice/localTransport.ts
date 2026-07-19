import type { SignalTransport } from './types'

/** Signaling used by the visual demo: it keeps media local and announces only the user. */
export const localSignalTransport: SignalTransport = {
  subscribe: () => () => undefined,
  send: () => undefined,
  presence: ({ participant, onChange }) => {
    onChange([participant])
    return () => undefined
  },
}
