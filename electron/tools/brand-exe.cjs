const path = require('node:path')
const { createRequire } = require('node:module')

const RETRY_ATTEMPTS = 24
const RETRY_DELAY_MS = 2500

function resolveAppBuilderLib() {
  const ebRequire = createRequire(require.resolve('electron-builder/package.json'))
  return path.dirname(ebRequire.resolve('app-builder-lib/package.json'))
}

function hasAsarIntegrity(entryList) {
  return entryList.some(entry => String(entry.type) === 'INTEGRITY')
}

function readIntegrityFlag(resEdit, file, buffer) {
  const executable = resEdit.NtExecutable.from(buffer)
  const resource = resEdit.NtExecutableResource.from(executable)
  return hasAsarIntegrity(resource.entries)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isLockError(error) {
  return error && (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES')
}

module.exports = async function brandExe(context) {
  if (context.electronPlatformName !== 'win32') return

  const packager = context.packager
  const exePath = path.join(context.appOutDir, `${packager.appInfo.productFilename}.exe`)
  const appBuilderDir = resolveAppBuilderLib()
  const resEdit = require(path.join(appBuilderDir, 'out/util/resEdit.js'))
  const resEditLib = createRequire(path.join(appBuilderDir, 'package.json'))('resedit')

  const fs = require('node:fs/promises')
  const before = await fs.readFile(exePath)
  const integrityBefore = readIntegrityFlag(resEditLib, exePath, before)

  const versionStrings = {
    FileDescription: packager.appInfo.productName,
    ProductName: packager.appInfo.productName,
    LegalCopyright: packager.appInfo.copyright
  }
  versionStrings.InternalName = path.basename(exePath, '.exe')
  versionStrings.OriginalFilename = ''
  if (packager.appInfo.companyName) versionStrings.CompanyName = packager.appInfo.companyName

  const opts = {
    file: exePath,
    versionStrings,
    fileVersion: packager.appInfo.shortVersion || packager.appInfo.buildVersion,
    productVersion: packager.appInfo.shortVersionWindows || packager.appInfo.getVersionInWeirdWindowsForm(),
    requestedExecutionLevel: packager.platformSpecificBuildOptions.requestedExecutionLevel,
    iconPath: await packager.getIconPath()
  }

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await resEdit.editWindowsResources(opts)
      const after = await fs.readFile(exePath)
      if (!readIntegrityFlag(resEditLib, exePath, after)) {
        throw new Error('asar integrity resource missing after branding')
      }
      console.log(`  • exe branding applied  attempt=${attempt} integrity=${integrityBefore ? 'preserved' : 'absent-before'}`)
      return
    } catch (error) {
      if (!isLockError(error) || attempt === RETRY_ATTEMPTS) throw error
      console.log(`  • exe locked (${error.code}) attempt=${attempt}, retrying in ${RETRY_DELAY_MS}ms`)
      await delay(RETRY_DELAY_MS)
    }
  }
}
