import { exec } from 'child_process'
import util from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = util.promisify(exec)

export function readConfigEnv(): Record<string, string> {
  const result: Record<string, string> = {}
  try {
    const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : path.join(process.env.HOME || '', '.config'))
    const configFile = path.join(appData, 'tm-tools', 'config.env')
    if (fs.existsSync(configFile)) {
      const content = fs.readFileSync(configFile, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        let value = trimmed.slice(eqIdx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        result[key] = value
      }
    }
  } catch {
    // ignore
  }
  return result
}

export function getConfiguredPath(key: string): string | undefined {
  const envVal = process.env[key]
  if (envVal && fs.existsSync(envVal)) return envVal
  const conf = readConfigEnv()
  if (conf[key] && fs.existsSync(conf[key])) return conf[key]
  return undefined
}

export async function getExecutableVersion(executablePath: string): Promise<string> {
  if (!fs.existsSync(executablePath)) {
    throw new Error(`File không tồn tại: ${executablePath}`)
  }

  // Trên Windows: Dùng PowerShell Get-Item VersionInfo lấy version cực nhanh không cần spawn browser
  if (process.platform === 'win32') {
    try {
      const escaped = executablePath.replace(/'/g, '\'\'')
      const psCommand = `powershell -NoProfile -Command "(Get-Item '${escaped}').VersionInfo.ProductVersion"`
      const { stdout } = await execAsync(psCommand, { timeout: 5000 })
      const version = stdout.trim()
      if (version) return version
    } catch {
      // fallback chạy với cờ --version
    }
  }

  // Fallback: Chạy lệnh `executablePath --version`
  try {
    const { stdout } = await execAsync(`"${executablePath}" --version`, { timeout: 5000 })
    const matched = stdout.match(/(\d+(\.\d+)+)/)
    if (matched && matched[1]) {
      return matched[1]
    }
  } catch {
    // thử tiếp với -v
    try {
      const { stdout } = await execAsync(`"${executablePath}" -v`, { timeout: 5000 })
      const matched = stdout.match(/(\d+(\.\d+)+)/)
      if (matched && matched[1]) {
        return matched[1]
      }
    } catch {
      // bỏ qua
    }
  }

  return 'unknown'
}

export async function killProcessTree(pid: number, force = true): Promise<void> {
  if (process.platform === 'win32') {
    const flag = force ? '/F' : ''
    try {
      await execAsync(`taskkill /pid ${pid} /T ${flag}`, { timeout: 5000 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // Nếu process không còn tồn tại thì coi như thành công
      if (!message.includes('not found') && !message.includes('không tìm thấy')) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // ignore
        }
      }
    }
  } else {
    try {
      process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM')
    } catch {
      try {
        process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
      } catch {
        // ignore
      }
    }
  }
}
