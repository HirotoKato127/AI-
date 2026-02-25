+function resolveTeleapoHandoverMemo(candidate) {
+  const logs = Array.isArray(candidate?.teleapoLogs) ? candidate.teleapoLogs : [];
+  if (!logs.length) return "";
+  const memoEntries = logs
+    .map((log, index) => {
+      const memo = String(log?.memo ?? log?.note ?? "").trim();
+      if (!memo) return null;
+      const rawDate = log?.calledAt ?? log?.called_at ?? log?.datetime ?? "";
+      const ts = rawDate ? new Date(rawDate).getTime() : NaN;
+      return { memo, ts: Number.isNaN(ts) ? null : ts, index };
+    })
+    .filter(Boolean);
+  if (!memoEntries.length) return "";
+  memoEntries.sort((a, b) => {
+    if (a.ts !== null && b.ts !== null) return b.ts - a.ts;
+    if (a.ts !== null) return -1;
+    if (b.ts !== null) return 1;
+    return a.index - b.index;
+  });
+  return memoEntries[0].memo;
+}