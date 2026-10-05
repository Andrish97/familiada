const fs = require("node:fs");
const os = require("node:os");

async function installDisplayPerformance(context) {
  await context.addInitScript(() => {
    const perf = window.__displayPerf = { active: 0, animations: [], frames: [], svgUpdates: [], longTasks: [], heapPeakBytes: 0 };
    let svgChanges = 0;
    new MutationObserver((records) => {
      if (perf.active) svgChanges += records.length;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["fill"] });
    let previous = null;
    const tick = (now) => {
      if (previous !== null && perf.active && document.visibilityState === "visible") perf.frames.push(now - previous);
      if (perf.active) perf.svgUpdates.push({ at: performance.timeOrigin + now, count: svgChanges });
      svgChanges = 0;
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.longTasks.push(entry.duration);
      }).observe({ type: "longtask" });
    }
    setInterval(() => { perf.heapPeakBytes = Math.max(perf.heapPeakBytes, performance.memory?.usedJSHeapSize || 0); }, 1000);
    perf.reset = () => { perf.animations = []; perf.frames = []; perf.svgUpdates = []; perf.longTasks = []; perf.heapPeakBytes = 0; };
  });
}

function startRunnerPerformance() {
  const samples = [];
  const sample = () => {
    const processes = { chromium: 0, ffmpeg: 0, Xvfb: 0 };
    try {
      for (const pid of fs.readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
        try {
          const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
          const name = status.match(/^Name:\s+(\S+)/m)?.[1];
          const group = name?.startsWith("chrome") ? "chromium" : name;
          if (Object.hasOwn(processes, group)) processes[group] += Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
        } catch {}
      }
    } catch {}
    let availableBytes = os.freemem();
    try { availableBytes = Number(fs.readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)/m)?.[1]) * 1024; } catch {}
    samples.push({ availableBytes, load1: os.loadavg()[0], processes });
  };
  sample();
  const timer = setInterval(sample, 2000);
  return () => {
    clearInterval(timer);
    sample();
    return {
      totalBytes: os.totalmem(), cpus: os.cpus().length, samples: samples.length,
      availableMinBytes: Math.min(...samples.map((s) => s.availableBytes)),
      load1Max: Math.max(...samples.map((s) => s.load1)),
      processRssPeakBytes: Object.fromEntries(["chromium", "ffmpeg", "Xvfb"].map((name) => [name, Math.max(...samples.map((s) => s.processes[name]))])),
    };
  };
}

async function collectDisplayPerformance(page) {
  return page.evaluate(() => {
    const perf = window.__displayPerf;
    if (!perf) return null;
    const percentile = (values, fraction) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null;
    };
    return {
      animationFrames: perf.frames.length,
      frameP50Ms: percentile(perf.frames, 0.5), frameP95Ms: percentile(perf.frames, 0.95), frameMaxMs: percentile(perf.frames, 1),
      framesOver50Ms: perf.frames.filter((ms) => ms > 50).length,
      longTaskCount: perf.longTasks.length, longTaskTotalMs: perf.longTasks.reduce((sum, ms) => sum + ms, 0), longTaskMaxMs: percentile(perf.longTasks, 1),
      heapPeakBytes: perf.heapPeakBytes, svgNodes: document.querySelectorAll("svg *").length,
      stateReadDurationsMs: performance.getEntriesByType("resource").filter((entry) => entry.name.split("?")[0].endsWith("/rpc/game_state_get")).map((entry) => entry.duration),
      animations: perf.animations,
      svgUpdates: perf.svgUpdates,
    };
  });
}

module.exports = { installDisplayPerformance, startRunnerPerformance, collectDisplayPerformance };
