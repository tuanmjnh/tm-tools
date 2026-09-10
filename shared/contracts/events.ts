export interface EventBusContracts {
  // Sự kiện vòng đời Profile
  'profile:started': {
    profileId: string
    pid: number
    startedAt: number
  }
  'profile:stopped': {
    profileId: string
    exitCode: number | null
  }
  'profile:crashed': {
    profileId: string
    error: string
  }

  // Sự kiện vòng đời Browser Runtime
  'browser:started': {
    browserId: string
    pid: number
  }
  'browser:closed': {
    browserId: string
    pid: number
  }

  // Sự kiện vòng đời Task Automation
  'task:started': {
    taskId: string
    profileId?: string
    startedAt: number
  }
  'task:progress': {
    taskId: string
    progress: number
    stepName: string
  }
  'task:completed': {
    taskId: string
    result?: unknown
    finishedAt: number
  }
  'task:failed': {
    taskId: string
    error: string
    finishedAt: number
  }
}
