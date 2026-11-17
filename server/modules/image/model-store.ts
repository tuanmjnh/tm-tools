import {
  MODEL_FILE,
  expectedModelSha256 as installerExpectedSha256,
  modelStatus as installerStatus,
  resolveModelPath,
  verifyModel as installerVerifyModel
} from './model-installer'

export { MODEL_FILE }

/**
 * Same resolution as `resolveBundledTool`: an explicit `IMAGE_MODEL_PATH`
 * override first, then the writable data directory the model installer writes
 * into. A packaged Electron app cannot write next to its binary, so the path
 * must never be cwd-relative — `model-installer` owns that rule.
 */
export function modelPath(): string {
  return resolveModelPath()
}

export function modelStatus(): { installed: boolean, path: string, bytes: number, verified: boolean } {
  const status = installerStatus()
  return { installed: status.installed, path: status.path, bytes: status.bytes, verified: status.verified }
}

/** A truncated or substituted download must never reach the session. */
export function verifyModel(path: string, expectedSha256: string): boolean {
  return installerVerifyModel(path, expectedSha256)
}

export function expectedModelSha256(): string {
  return installerExpectedSha256()
}
