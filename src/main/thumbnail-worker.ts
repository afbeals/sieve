import { parentPort, workerData } from 'node:worker_threads'
import { statSync } from 'node:fs'
import ffmpegStaticPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import ffmpeg from 'fluent-ffmpeg'
import type { ThumbnailFrame } from '../shared/types'
import type { ThumbnailJob } from './thumbnails'

// electron-builder can't run a binary from inside app.asar; packaging must unpack these
// (asarUnpack) so this substitution finds the real file at runtime. No-op outside an asar build.
function resolveBinaryPath(rawPath: string): string {
  return rawPath.replace('app.asar', 'app.asar.unpacked')
}

if (!ffmpegStaticPath) throw new Error('ffmpeg-static did not resolve a binary for this platform')
ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegStaticPath))
ffmpeg.setFfprobePath(resolveBinaryPath(ffprobeStatic.path))

// Configurable via Settings (#37) - defaults to 800, deliberately much larger than any
// current display size (a 260px preview panel, even at 3x DPI, only needs ~780px) so the
// browser is always scaling the image DOWN, never up - scaling down stays sharp, scaling up
// blurs. Also gives headroom for the lightbox full-size zoom (#20).
// Scale to cover a `resolution` square then center-crop to exactly that size, so the stored
// thumbnail itself has no letterboxing - filling the preview panel requires no black bars
// baked into the container, since the image already fills its own square. -q:v 2 keeps JPEG
// quality high (ffmpeg's mjpeg qscale, 2-31 where lower is better) instead of the soft
// default the earlier lower-resolution thumbnails used.
function thumbnailFilterFor(resolution: number): string {
  return `scale=${resolution}:${resolution}:force_original_aspect_ratio=increase,crop=${resolution}:${resolution}`
}
// Fast seeks near the very end of a video can land past the last decodable frame and produce
// an empty output; clamp so the last timestamp always has real content before it.
const END_OF_VIDEO_MARGIN_SECONDS = 0.3

function probeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return reject(err)
      const duration = data.format?.duration
      if (typeof duration !== 'number') return reject(new Error('no duration in probe result'))
      resolve(duration)
    })
  })
}

// timestampSeconds is omitted for a static image: there's nothing to seek to, and seeking
// (-ss before -i) on a single-frame image2/mjpeg input can make ffmpeg emit a garbage
// negative timestamp and write an empty output file - while still exiting 0 as if it
// succeeded (reproduced directly against a real photo; a synthetic 1-frame test image did
// not hit it, which is why this looked file-specific rather than seek-specific at first).
function extractFrame(
  inputPath: string,
  outputPath: string,
  resolution: number,
  timestampSeconds?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
    if (timestampSeconds !== undefined) command.seekInput(timestampSeconds)
    command
      .frames(1)
      .outputOptions(['-vf', thumbnailFilterFor(resolution), '-q:v', '2'])
      .output(outputPath)
      .on('end', () => {
        // ffmpeg can exit 0 while having written nothing (the seek-on-image case above, and
        // possibly other edge cases) - never trust the exit event alone.
        try {
          if (statSync(outputPath).size > 0) resolve()
          else reject(new Error('ffmpeg reported success but wrote an empty file'))
        } catch {
          reject(new Error('ffmpeg reported success but wrote no file'))
        }
      })
      .on('error', (err: Error) => reject(err))
      .run()
  })
}

async function processImageJob(job: ThumbnailJob): Promise<ThumbnailFrame[]> {
  try {
    await extractFrame(job.path, job.outputPaths[0], job.resolution)
    return [{ frameIndex: 0, thumbPath: job.outputPaths[0] }]
  } catch {
    return []
  }
}

async function processVideoJob(job: ThumbnailJob): Promise<ThumbnailFrame[]> {
  let duration: number
  try {
    duration = await probeDuration(job.path)
  } catch {
    return []
  }
  if (!(duration > 0)) return []

  const frameCount = job.outputPaths.length
  const frames: ThumbnailFrame[] = []
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const fraction = frameCount === 1 ? 0 : frameIndex / (frameCount - 1)
    const timestamp = Math.min(duration * fraction, duration - END_OF_VIDEO_MARGIN_SECONDS)
    if (timestamp < 0) continue
    try {
      await extractFrame(job.path, job.outputPaths[frameIndex], job.resolution, timestamp)
      frames.push({ frameIndex, thumbPath: job.outputPaths[frameIndex] })
    } catch {
      // Skip this frame; the file may have a codec ffmpeg can seek but not decode at that
      // exact timestamp - the other frames still succeeding is enough for a usable carousel.
    }
  }
  return frames
}

async function run(): Promise<void> {
  const jobs = workerData.jobs as ThumbnailJob[]
  for (const job of jobs) {
    const frames = job.kind === 'image' ? await processImageJob(job) : await processVideoJob(job)
    parentPort?.postMessage({ type: 'result', path: job.path, mtimeMs: job.mtimeMs, frames })
  }
  parentPort?.postMessage({ type: 'done' })
}

void run()
