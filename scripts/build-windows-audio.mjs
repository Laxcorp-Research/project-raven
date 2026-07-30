import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'win32') {
  console.error('The Windows audio addon can only be built on Windows.')
  process.exit(1)
}

const root = resolve(import.meta.dirname, '..')
const cargoHome = process.env.CARGO_HOME || join(homedir(), '.cargo')
const cargoBin = join(cargoHome, 'bin')
const cargoExe = join(cargoBin, 'cargo.exe')
const env = { ...process.env }
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH'

if (existsSync(cargoExe)) {
  env[pathKey] = `${cargoBin}${delimiter}${env[pathKey] || ''}`
}

const npmCli = process.env.npm_execpath
if (!npmCli || !existsSync(npmCli)) {
  console.error('Could not locate npm-cli.js from the current npm process.')
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [npmCli, '--prefix', 'src/native/windows', 'run', 'build'],
  { cwd: root, env, shell: false, stdio: 'inherit' },
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
