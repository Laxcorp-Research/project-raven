import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const source = resolve(process.argv[2] || '')
if (!source) throw new Error('SearXNG source path is required.')
const target = join(source, 'searx', 'valkeydb.py')
let contents = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')

const importNeedle = 'import os\nimport pwd\nimport logging'
const importReplacement = `import os
try:
    import pwd
except ImportError:  # Windows has no POSIX account database
    pwd = None
import logging`
if (contents.includes(importNeedle)) contents = contents.replace(importNeedle, importReplacement)

const errorNeedle = `        _pw = pwd.getpwuid(os.getuid())
        logger.exception("[%s (%s)] can't connect valkey DB ...", _pw.pw_name, _pw.pw_uid)`
const errorReplacement = `        if pwd is not None and hasattr(os, 'getuid'):
            _pw = pwd.getpwuid(os.getuid())
            logger.exception("[%s (%s)] can't connect valkey DB ...", _pw.pw_name, _pw.pw_uid)
        else:
            logger.exception("can't connect valkey DB ...")`
if (contents.includes(errorNeedle)) contents = contents.replace(errorNeedle, errorReplacement)

if (!contents.includes('pwd = None') || !contents.includes('if pwd is not None')) {
  throw new Error('Pinned SearXNG Windows compatibility patch did not match the expected source.')
}
writeFileSync(target, contents, 'utf8')
