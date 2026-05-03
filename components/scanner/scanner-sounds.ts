/**
 * components/scanner/scanner-sounds.ts
 * Web Audio API — generates beep sounds in the browser.
 * No external files needed — pure synthesis.
 * Volume is set to maximum (1.0).
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

type BeepType = "success" | "error" | "duplicate";

interface BeepConfig {
  frequency: number;
  duration: number;   // ms
  type: OscillatorType;
  ramp?: { freq: number; at: number }; // optional second freq
}

const BEEPS: Record<BeepType, BeepConfig[]> = {
  // Success: two short rising beeps — classic scanner "accepted"
  success: [
    { frequency: 880,  duration: 80,  type: "square" },
    { frequency: 1320, duration: 120, type: "square" },
  ],
  // Error: one long low buzz
  error: [
    { frequency: 200, duration: 500, type: "sawtooth" },
  ],
  // Duplicate: three rapid mid beeps
  duplicate: [
    { frequency: 600, duration: 60, type: "square" },
    { frequency: 600, duration: 60, type: "square" },
    { frequency: 600, duration: 60, type: "square" },
  ],
};

function playBeep(freq: number, duration: number, type: OscillatorType, startTime: number): number {
  const ctx  = getCtx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type      = type;
  osc.frequency.setValueAtTime(freq, startTime);

  // Full volume
  gain.gain.setValueAtTime(1.0, startTime);
  // Quick fade at the end to avoid clicks
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration / 1000 - 0.01);

  osc.start(startTime);
  osc.stop(startTime + duration / 1000);

  return startTime + duration / 1000 + 0.02; // next start time (with tiny gap)
}

export function playSound(type: BeepType): void {
  try {
    const ctx    = getCtx();
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === "suspended") ctx.resume();

    const beeps  = BEEPS[type];
    let time     = ctx.currentTime + 0.01;

    for (const beep of beeps) {
      time = playBeep(beep.frequency, beep.duration, beep.type, time);
    }
  } catch (e) {
    // Audio not available — silent fail
    console.warn("[scanner] audio unavailable:", e);
  }
}
