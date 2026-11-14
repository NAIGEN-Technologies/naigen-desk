// Naigen Desk: upstream tests exercise the Genspark code paths, so they run with the gate on.
// Tests of the compiled-out behavior re-mock the gate to false with vi.doMock.
import { vi } from 'vitest'

vi.mock('../../src/genspark-gate', () => ({ GENSPARK_ENABLED: true }))
