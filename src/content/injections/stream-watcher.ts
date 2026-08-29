/**
 * Main-world stream watcher injected into Claude Web page
 */
(() => {
  if ((window as any).__claudeAutoResetStreamWatcher) return;
  (window as any).__claudeAutoResetStreamWatcher = true;

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';

    const isCompletion = url.includes('/completion') || url.includes('/retry_completion');
    if (isCompletion) {
      window.dispatchEvent(new CustomEvent('claude-reset:stream-start'));
    }

    try {
      const response = await originalFetch.apply(this, args);
      if (isCompletion && response.body) {
        // Clone stream to monitor termination without consuming app stream
        const cloned = response.clone();
        if (cloned.body) {
          const reader = cloned.body.getReader();
          (async () => {
            try {
              while (true) {
                const { done } = await reader.read();
                if (done) break;
              }
            } catch {
              // ignore
            } finally {
              window.dispatchEvent(new CustomEvent('claude-reset:stream-end'));
            }
          })();
        }
      }
      return response;
    } catch (err) {
      if (isCompletion) {
        window.dispatchEvent(new CustomEvent('claude-reset:stream-end'));
      }
      throw err;
    }
  };

  window.dispatchEvent(new CustomEvent('claude-reset:watcher-ready'));
})();
