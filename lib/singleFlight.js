// Wraps an async setup function (schema migration, seeding) so it runs once.
// Concurrent callers - typical on a serverless cold start - share the same run
// instead of each executing it. A failed run is not remembered, so the next
// call retries.
export function singleFlight(fn) {
  let promise = null;
  return function run() {
    if (!promise) {
      promise = Promise.resolve()
        .then(fn)
        .catch((err) => {
          promise = null;
          throw err;
        });
    }
    return promise;
  };
}
