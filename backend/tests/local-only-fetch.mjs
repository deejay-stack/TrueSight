// Loaded only by the integration test server. Any external Node HTTP analysis
// (including an accidental Sapling fallback) must fail this test.
globalThis.fetch = async () => {
  console.error("UNEXPECTED_OUTBOUND_FETCH");
  throw new Error("External requests are forbidden during local detector tests");
};
process.on("message", async (message) => {
  if (message === "test-shutdown") process.exit(0);
  if (message === "test-stop-worker") {
    const { stopInferenceWorker } = await import("../dist/services/InferenceService.js");
    stopInferenceWorker();
  }
});
