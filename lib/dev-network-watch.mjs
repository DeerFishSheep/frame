import { isIPv4 } from "node:net";

/** Keep the watch boundary aligned with getLocalDevOrigins: concrete private IPv4 only. */
export function getPrivateIpv4Addresses(interfaces) {
  const addresses = Object.values(interfaces).flatMap(entries => (entries ?? []).flatMap(entry => {
    if (entry.internal || entry.family !== "IPv4" || !isIPv4(entry.address)) return [];
    const [first, second] = entry.address.split(".").map(Number);
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) ? [entry.address] : [];
  }));
  return [...new Set(addresses)].sort();
}

/**
 * Restart only for a settled network change. A stopped or crashed child is never revived.
 * Dependencies are injected so lifecycle tests need neither Next nor real network changes.
 */
export function createDevNetworkWatch({
  readAddresses, spawnChild, onExit, onRestart = (_addresses) => {}, onError = (_error) => {},
  pollMs = 2000, settleMs = 1500,
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
}) {
  let child = null, poll = null, debounce = null;
  let stopped = false, finished = false, restarting = false;
  let runningKey = "", observedKey = "";
  const snapshot = () => [...new Set(readAddresses())].sort();
  const clearDebounce = () => { if (debounce !== null) timers.clearTimeout(debounce); debounce = null; };
  const clearTimers = () => { clearDebounce(); if (poll !== null) timers.clearInterval(poll); poll = null; };
  const finish = (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimers();
    onExit(code, signal);
  };
  const terminate = signal => {
    if (!child) return;
    try { child.kill(signal); }
    catch (error) { onError(error); finish(1, null); }
  };
  const launch = () => {
    if (stopped || finished) return;
    clearDebounce();
    restarting = false;
    try {
      runningKey = JSON.stringify(snapshot());
      observedKey = runningKey;
      const launched = spawnChild();
      child = launched;
      launched.once("error", error => {
        if (child !== launched || finished) return;
        onError(error);
        finish(1, null);
      });
      launched.once("close", (code, signal) => {
        if (child !== launched || finished) return;
        child = null;
        if (restarting && !stopped) launch();
        else finish(code, signal);
      });
    } catch (error) { onError(error); finish(1, null); }
  };
  const scheduleRestart = () => {
    debounce = timers.setTimeout(() => {
      debounce = null;
      if (stopped || finished || restarting) return;
      let latestKey;
      try { latestKey = JSON.stringify(snapshot()); }
      catch (error) { observedKey = runningKey; onError(error); return; }
      if (latestKey !== observedKey) {
        observedKey = latestKey;
        if (latestKey !== runningKey) scheduleRestart();
        return;
      }
      if (observedKey === runningKey) return;
      restarting = true;
      onRestart(JSON.parse(observedKey));
      terminate("SIGTERM");
    }, settleMs);
  };
  const sample = () => {
    if (stopped || finished) return;
    let addresses;
    try { addresses = snapshot(); }
    catch (error) { onError(error); return; }
    const key = JSON.stringify(addresses);
    if (key === observedKey) return;
    observedKey = key;
    clearDebounce();
    // The pending child's replacement will read the newest snapshot when it launches.
    if (restarting || key === runningKey) return;
    scheduleRestart();
  };
  launch();
  if (!finished) poll = timers.setInterval(sample, pollMs);
  return {
    sample,
    stop(signal = "SIGTERM") {
      if (stopped || finished) return;
      stopped = true;
      restarting = false;
      clearTimers();
      if (child) terminate(signal);
      else finish(0, null);
    },
  };
}
