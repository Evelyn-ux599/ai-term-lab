// All sounds are synthesized locally. No recordings, network requests or sample licenses.
export class Sound {
  context = null;
  enabled = true;
  async unlock() {
    if (!this.enabled) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context ||= new Context();
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Sound is optional; the visual experience still works. */ }
  }
  tick(final = false) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running' || document.hidden) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.028), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.16));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = final ? 850 : 1450; filter.Q.value = 0.7;
    const gain = ctx.createGain(); gain.gain.value = final ? 0.28 : 0.16;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  chime(done = false) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running' || document.hidden) return;
    const notes = done ? [523.25, 659.25, 783.99] : [523.25, 659.25];
    notes.forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);
      osc.connect(gain).connect(ctx.destination); osc.start(start); osc.stop(start + 0.7);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.context?.state === 'running') this.context.suspend().catch(() => {});
    if (enabled) this.unlock();
  }
}
