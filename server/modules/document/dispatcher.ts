import type { DocumentJobRecord, DocumentOperationId } from '#shared/types/document'
import { DocumentError } from './operations'
import { detectRuntime, exceedsScratchBudget, operationSupport } from './runtime'

/**
 * Dispatch decision for one job. The UI and the API never branch on runtime;
 * they ask a dispatcher, which is the only place that knows what a given runtime
 * can do (completion guide §8.6).
 */
export interface JobDispatchPlan {
  mode: 'inline' | 'bounded' | 'worker'
  /** Set when the job cannot run here; the caller returns this error. */
  error?: DocumentError
  reason?: string
}

export interface JobDispatcher {
  readonly name: string
  plan(job: Pick<DocumentJobRecord, 'operationId' | 'runtime'>, totalInputBytes: number): JobDispatchPlan
}

/**
 * Local and Electron run everything inline: there is no function budget and no
 * queue, and the engines are synchronous anyway.
 */
export class LocalInlineDispatcher implements JobDispatcher {
  readonly name = 'local-inline'

  plan(job: Pick<DocumentJobRecord, 'operationId' | 'runtime'>): JobDispatchPlan {
    const support = operationSupport(job.operationId as DocumentOperationId, job.runtime)
    if (!support.enabled) {
      return {
        mode: 'inline',
        reason: support.reasonDisabled,
        error: new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', {
          runtime: job.runtime,
          operationId: job.operationId,
          reason: support.reasonDisabled
        })
      }
    }
    return { mode: 'inline' }
  }
}

/**
 * A Function runs only what fits its measured scratch and duration budget. An
 * operation that is supported but too large is sent to a worker, which today
 * means the API reports `DOCUMENT_WORKER_REQUIRED` — no queue is provisioned.
 */
export class BoundedDispatcher implements JobDispatcher {
  readonly name = 'vercel-bounded'

  plan(job: Pick<DocumentJobRecord, 'operationId' | 'runtime'>, totalInputBytes: number): JobDispatchPlan {
    const support = operationSupport(job.operationId as DocumentOperationId, job.runtime)

    // An operation that exists only behind a worker is not "unsupported": it is
    // supported somewhere else. Checking it before `enabled` is what keeps the
    // two errors distinct (guide §11.1).
    if (support.executionMode === 'worker') {
      return {
        mode: 'worker',
        reason: 'operation-runs-on-worker',
        error: new DocumentError('DOCUMENT_WORKER_REQUIRED', {
          operationId: job.operationId,
          reason: support.reasonDisabled ?? 'operation-runs-on-worker'
        })
      }
    }

    if (!support.enabled) {
      return {
        mode: 'worker',
        reason: support.reasonDisabled,
        error: new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', {
          runtime: job.runtime,
          operationId: job.operationId,
          reason: support.reasonDisabled
        })
      }
    }

    if (exceedsScratchBudget(job.operationId as DocumentOperationId, totalInputBytes, job.runtime)) {
      return {
        mode: 'worker',
        reason: 'scratch-budget-exceeded',
        error: new DocumentError('DOCUMENT_WORKER_REQUIRED', {
          operationId: job.operationId,
          totalInputBytes
        })
      }
    }

    return { mode: 'bounded' }
  }
}

/**
 * A dedicated worker has its own disk and duration, so it only refuses an
 * operation that has no adapter at all.
 */
export class WorkerDispatcher implements JobDispatcher {
  readonly name = 'external-worker'

  plan(job: Pick<DocumentJobRecord, 'operationId' | 'runtime'>): JobDispatchPlan {
    const support = operationSupport(job.operationId as DocumentOperationId, job.runtime)
    if (!support.enabled) {
      return {
        mode: 'worker',
        reason: support.reasonDisabled,
        error: new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', {
          runtime: job.runtime,
          operationId: job.operationId,
          reason: support.reasonDisabled
        })
      }
    }
    return { mode: 'worker' }
  }
}

const DISPATCHERS: Record<string, JobDispatcher> = {
  local: new LocalInlineDispatcher(),
  electron: new LocalInlineDispatcher(),
  vercel: new BoundedDispatcher(),
  worker: new WorkerDispatcher()
}

export function dispatcherFor(runtime = detectRuntime()): JobDispatcher {
  return DISPATCHERS[runtime] ?? new LocalInlineDispatcher()
}

/** Convenience for route handlers: throw when the job cannot run here. */
export function requireDispatchable(
  job: Pick<DocumentJobRecord, 'operationId' | 'runtime'>,
  totalInputBytes: number
): JobDispatchPlan {
  const plan = dispatcherFor(job.runtime).plan(job, totalInputBytes)
  if (plan.error) throw plan.error
  return plan
}
