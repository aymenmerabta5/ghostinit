import { StringDecoder } from "node:string_decoder";
import { stripVTControlCharacters } from "node:util";

type PreviewOutputStream = "stdout" | "stderr";

const MAX_EVENT_LINE_CHARS = 16 * 1024;
const MAX_BIND_FRAGMENT_CHARS = 256;
const READY_EVENT =
  /^(?:(?:\[wrangler(?:-ProxyWorker)?:info\]\s*)?(?:Ready on|Updated and ready on)\s+|(?:➜\s*)?Local:\s+)(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})\/?)$/i;
const BIND_FAILURE =
  /\bEADDRINUSE\b|\baddress already in use\b|\b(?:failed|unable) to (?:bind|listen)\b|\bport\s+\d+\s+is (?:already )?in use\b/i;
const EXPLICIT_PORT =
  /(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[[a-f\d:]+\]|::1|::):(\d{1,5})(?!\d)|\bport\s*(?:[:=]\s*)?["']?(\d{1,5})(?!\d)/gi;

function streamState() {
  return {
    decoder: new StringDecoder("utf8"),
    pending: "",
    discarding: false,
    bindFragment: "",
    sawBindFailure: false,
    sawExplicitPort: false,
    sawTargetPort: false,
  };
}

/** Retain readiness facts independently of the private, bounded diagnostic tail. */
export class WorkerPreviewReadiness {
  private readonly streams = { stdout: streamState(), stderr: streamState() };
  private ready = false;
  private bindContradiction = false;

  constructor(private readonly port: number) {}

  consume(stream: PreviewOutputStream, chunk: Buffer | string): void {
    const state = this.streams[stream];
    this.consumeText(stream, typeof chunk === "string" ? chunk : state.decoder.write(chunk));
  }

  finish(stream: PreviewOutputStream): void {
    const state = this.streams[stream];
    this.consumeText(stream, state.decoder.end());
    this.finishLine(state);
  }

  isReady(): boolean {
    return this.ready && !this.bindContradiction;
  }

  private consumeText(stream: PreviewOutputStream, text: string): void {
    const state = this.streams[stream];
    let start = 0;
    for (let index = 0; index <= text.length; index += 1) {
      if (index < text.length && text[index] !== "\n" && text[index] !== "\r") continue;
      const part = text.slice(start, index);
      if (state.discarding) {
        this.observeDiscardedBindings(state, part, index < text.length);
      } else {
        if (state.pending.length + part.length > MAX_EVENT_LINE_CHARS) {
          // Never treat a suffix of an oversized diagnostic as a new ready line.
          // Bind contradictions must survive even when the whole line cannot.
          this.observeDiscardedBindings(state, state.pending + part, index < text.length);
          state.pending = "";
          state.discarding = true;
        } else {
          state.pending += part;
        }
      }
      if (index < text.length) {
        this.finishLine(state);
      }
      start = index + 1;
    }
  }

  private finishLine(state: ReturnType<typeof streamState>): void {
    if (state.discarding) this.observeDiscardedBindings(state, "", true);
    else this.observeLine(state.pending);
    state.pending = "";
    state.discarding = false;
    state.bindFragment = "";
    state.sawBindFailure = false;
    state.sawExplicitPort = false;
    state.sawTargetPort = false;
  }

  private observeDiscardedBindings(
    state: ReturnType<typeof streamState>,
    part: string,
    complete: boolean,
  ): void {
    const raw = state.bindFragment + part;
    const line = stripVTControlCharacters(raw);
    const failure = BIND_FAILURE.exec(line);
    if (failure && (complete || failure.index + failure[0].length < line.length)) {
      state.sawBindFailure = true;
    }
    for (const match of line.matchAll(EXPLICIT_PORT)) {
      // A port at the end of a fragment may gain digits in the next fragment.
      if (!complete && match.index + match[0].length === line.length) continue;
      state.sawExplicitPort = true;
      if (Number(match[1] ?? match[2]) === this.port) state.sawTargetPort = true;
    }
    state.bindFragment = raw.slice(-MAX_BIND_FRAGMENT_CHARS);
    if (state.sawBindFailure && (state.sawTargetPort || (complete && !state.sawExplicitPort))) {
      this.bindContradiction = true;
    }
  }

  private observeLine(raw: string): void {
    const line = stripVTControlCharacters(raw).trim();
    if (BIND_FAILURE.test(line)) {
      const ports = [...line.matchAll(EXPLICIT_PORT)].map((match) => Number(match[1] ?? match[2]));
      // An explicitly different port can belong to an auxiliary inspector.
      // Unscoped bind errors remain ambiguous and fail closed. A later ready
      // message cannot undo contradictory evidence from this process tree.
      if (ports.length === 0 || ports.includes(this.port)) this.bindContradiction = true;
    }
    const event = READY_EVENT.exec(line);
    if (event && Number(event[2]) === this.port) this.ready = true;
  }
}
