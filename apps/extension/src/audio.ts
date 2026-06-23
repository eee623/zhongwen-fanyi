export const REALTIME_CAPTURE_BUFFER_SIZE = 512;
export const MAX_TRANSLATED_AUDIO_QUEUE_SECONDS = 1;

export function captureBufferDurationMs(bufferSize: number, sampleRate: number): number {
  return (bufferSize / sampleRate) * 1000;
}

export function floatToPcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return bytesToBase64(new Uint8Array(pcm.buffer));
}

export function mergeTranscript(text: string, stash = ""): string {
  return `${text}${stash}`.trim();
}

export function shouldDropTranslatedAudioForRealtime(
  currentTimeSeconds: number,
  nextPlaybackTimeSeconds: number,
  maxQueueSeconds = MAX_TRANSLATED_AUDIO_QUEUE_SECONDS
): boolean {
  return nextPlaybackTimeSeconds - currentTimeSeconds > maxQueueSeconds;
}

export function downsampleFloat32(
  samples: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (outputSampleRate >= inputSampleRate) {
    return samples;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(samples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;

    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex] ?? 0;
    }

    output[outputIndex] = sum / Math.max(1, end - start);
  }

  return output;
}

export function base64Pcm16ToAudioBuffer(
  audioContext: AudioContext,
  base64: string,
  sampleRate = 16000
): AudioBuffer {
  const bytes = base64ToBytes(base64);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    channel[index] = view.getInt16(index * 2, true) / 0x8000;
  }

  return buffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
