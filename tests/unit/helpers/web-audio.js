// Atrapa Web Audio dla istniejących testów diagnostyki i dekodowania.
export class AudioContextStub {
  currentTime = 0;
  state = "running";
  destination = {};
  createGain() {
    return { gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
  }
  createMediaElementSource() { return { connect() {}, disconnect() {} }; }
  async resume() { this.state = "running"; }
}
