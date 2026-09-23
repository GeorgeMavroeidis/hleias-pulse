/** Run every cleanup step even when an earlier one fails. */
export async function cleanupAll(
  steps: Array<[string, () => Promise<unknown>]>,
  testFailure?: unknown,
) {
  const errors: Error[] = [];
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(new Error(`${label} failed`, { cause: error }));
    }
  }
  if (errors.length) {
    throw new AggregateError(
      testFailure === undefined ? errors : [testFailure, ...errors],
      testFailure === undefined ? "Smoke fixture cleanup failed" : "Smoke and cleanup both failed",
    );
  }
}
