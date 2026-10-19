(async () => {
  const context = new AudioContext();
  const code = `
    class TestProcessor extends AudioWorkletProcessor {
      process() { return true; }
    }
    registerProcessor('test-processor', TestProcessor);
  `;
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  try {
    await context.audioWorklet.addModule(url);
    return { worklet: 'ok' };
  } catch (error) {
    return { worklet: String(error) };
  } finally {
    URL.revokeObjectURL(url);
    await context.close();
  }
})()
