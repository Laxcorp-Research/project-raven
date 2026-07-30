import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const originalShutdown = `    finally:
        if not results_task.done():
            results_task.cancel()
        try:
            await results_task
        except (asyncio.CancelledError, Exception):
            pass
        await audio_processor.cleanup()`

const repairedShutdown = `    finally:
        # Raven compatibility repair: let end-of-input inference publish its
        # final Results message before cleaning up the WebSocket session.
        try:
            await asyncio.wait_for(results_task, timeout=15.0)
        except asyncio.TimeoutError:
            logger.warning("Deepgram compat final-results flush timed out")
        except (asyncio.CancelledError, Exception):
            pass
        await audio_processor.cleanup()`

const originalAdapterState = `        self._prev_n_lines = 0
        self._sent_lines = 0`

const repairedAdapterState = `        # Track committed text by stable line start so growing and front-pruned
        # FrontData snapshots can be converted into append-only result deltas.
        self._sent_line_text = {}`

const originalCommittedLines = `        n_speech = len(speech_lines)

        # Detect new committed lines → emit as is_final=true results
        if n_speech > self._sent_lines:
            new_lines = speech_lines[self._sent_lines:]
            result = _lines_to_result(new_lines, is_final=True, speech_final=True)
            await self.websocket.send_json(result)

            # Track last word end for UtteranceEnd
            if result["channel"]["alternatives"][0]["words"]:
                self._last_word_end = result["channel"]["alternatives"][0]["words"][-1]["end"]

            self._sent_lines = n_speech`

const repairedCommittedLines = `        n_speech = len(speech_lines)

        # FrontData lines are rolling snapshots. A committed line can grow for
        # several updates and older lines can be pruned, so a line-count cursor
        # drops most of a long utterance. Emit only each line's newly appended
        # words, keyed by its stable start time and speaker.
        new_lines = []
        for line in speech_lines:
            key = (line.get("start", ""), line.get("speaker", 0))
            text = line.get("text", "").strip()
            previous = self._sent_line_text.get(key, "")
            if text == previous:
                continue
            previous_words = previous.split()
            current_words = text.split()
            common = 0
            while (common < len(previous_words) and common < len(current_words)
                   and previous_words[common] == current_words[common]):
                common += 1
            delta = " ".join(current_words[common:]).strip()
            self._sent_line_text[key] = text
            if delta:
                delta_line = dict(line)
                delta_line["text"] = delta
                new_lines.append(delta_line)

        if new_lines:
            result = _lines_to_result(new_lines, is_final=True, speech_final=True)
            await self.websocket.send_json(result)

            # Track last word end for UtteranceEnd
            if result["channel"]["alternatives"][0]["words"]:
                self._last_word_end = result["channel"]["alternatives"][0]["words"][-1]["end"]`

export function patchWhisperLiveKit(filePath) {
  let source = readFileSync(filePath, 'utf8')
  let changed = false

  if (!source.includes(repairedShutdown)) {
    if (!source.includes(originalShutdown)) {
      throw new Error('WhisperLiveKit shutdown block did not match pinned 0.2.24; refusing an unsafe patch')
    }
    source = source.replace(originalShutdown, repairedShutdown)
    changed = true
  }

  if (!source.includes(repairedAdapterState)) {
    if (!source.includes(originalAdapterState)) {
      throw new Error('WhisperLiveKit adapter state did not match pinned 0.2.24; refusing an unsafe patch')
    }
    source = source.replace(originalAdapterState, repairedAdapterState)
    changed = true
  }

  if (!source.includes(repairedCommittedLines)) {
    if (!source.includes(originalCommittedLines)) {
      throw new Error('WhisperLiveKit committed-lines block did not match pinned 0.2.24; refusing an unsafe patch')
    }
    source = source.replace(originalCommittedLines, repairedCommittedLines)
    changed = true
  }

  if (source.includes('        elif buffer and buffer.strip():')) {
    source = source.replace('        elif buffer and buffer.strip():', '        if buffer and buffer.strip():')
    changed = true
  } else if (!source.includes('        if buffer and buffer.strip():')) {
    throw new Error('WhisperLiveKit interim-results block did not match pinned 0.2.24; refusing an unsafe patch')
  }

  if (changed) writeFileSync(filePath, source, 'utf8')
  return changed
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2]
  if (!target) throw new Error('Usage: node scripts/patch-whisperlivekit.mjs <deepgram_compat.py>')
  const changed = patchWhisperLiveKit(resolve(target))
  console.log(changed ? 'Applied Raven WhisperLiveKit finalization repair.' : 'WhisperLiveKit finalization repair is already applied.')
}
