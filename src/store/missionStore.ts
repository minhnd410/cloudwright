import { create } from 'zustand'
import { MISSION_BY_ID, MISSIONS } from '@/scenarios/missions'
import { buildContext } from '@/scenarios/context'
import type { Mission } from '@/scenarios/types'
import { useGame } from './gameStore'

const PROGRESS_KEY = 'cloudwright:progress:v1'

interface Progress {
  completed: string[]
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (raw) return JSON.parse(raw) as Progress
  } catch {
    /* ignore */
  }
  return { completed: [] }
}

function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    /* ignore */
  }
}

export interface MissionState {
  activeId: string | null
  /** Objective ids currently satisfied. */
  done: string[]
  completed: string[]
  hintsShown: number
  /** Set when every objective has been satisfied at least once. */
  finished: boolean

  start: (missionId: string) => void
  abandon: () => void
  evaluate: () => void
  revealHint: () => void
  dismissDebrief: () => void
  isUnlocked: (mission: Mission) => boolean
}

export const useMission = create<MissionState>((set, get) => ({
  activeId: null,
  done: [],
  completed: loadProgress().completed,
  hintsShown: 0,
  finished: false,

  start: (missionId) => {
    const mission = MISSION_BY_ID[missionId]
    if (!mission) return
    const game = useGame.getState()

    if (mission.start) game.load(mission.start)
    else game.clear()

    game.setName(mission.title)
    set({ activeId: missionId, done: [], hintsShown: 0, finished: false })

    for (const seed of mission.startIncidents ?? []) {
      game.triggerIncident(seed.nodeId, seed.modeId)
    }
    get().evaluate()
  },

  abandon: () => set({ activeId: null, done: [], hintsShown: 0, finished: false }),

  evaluate: () => {
    const { activeId, done, completed, finished } = get()
    if (!activeId) return
    const mission = MISSION_BY_ID[activeId]
    if (!mission) return

    const game = useGame.getState()
    const ctx = buildContext(game.toSimGraph(), game.sim, game.findings, game.incidents)

    const satisfied: string[] = []
    for (const objective of mission.objectives) {
      let ok = false
      try {
        ok = objective.check(ctx)
      } catch {
        ok = false
      }
      // Non-sustained objectives latch: once achieved, they stay achieved.
      if (ok || (!objective.sustained && done.includes(objective.id))) satisfied.push(objective.id)
    }

    const allDone = satisfied.length === mission.objectives.length
    const nextCompleted = allDone && !completed.includes(activeId) ? [...completed, activeId] : completed
    if (nextCompleted !== completed) saveProgress({ completed: nextCompleted })

    if (satisfied.length !== done.length || allDone !== finished || nextCompleted !== completed) {
      set({ done: satisfied, finished: allDone, completed: nextCompleted })
    }
  },

  revealHint: () => set((s) => ({ hintsShown: s.hintsShown + 1 })),
  dismissDebrief: () => set({ finished: false }),

  isUnlocked: (mission) => {
    if (!mission.requires) return true
    return get().completed.includes(mission.requires)
  },
}))

/** Re-evaluate objectives whenever the diagram or the simulation changes. */
export function wireMissionEvaluation() {
  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      useMission.getState().evaluate()
    })
  }

  return useGame.subscribe((state, prev) => {
    if (
      state.nodes !== prev.nodes ||
      state.edges !== prev.edges ||
      state.sim !== prev.sim ||
      state.findings !== prev.findings ||
      state.incidents !== prev.incidents
    ) {
      schedule()
    }
  })
}

export const ALL_MISSIONS = MISSIONS
