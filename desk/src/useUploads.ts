import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isSignedOut } from "./api";
import { newId } from "./pageModel";
import { isCancel, uploadErrorMessage, uploadFile, type Phase, type UploadKind, type Uploaded } from "./uploads";

export type UploadEntry = {
  id: string;
  name: string;
  kind: UploadKind;
  progress: number;
  phase: Phase | "error";
  error: string;
  preview: string | null;
};

type Job = { file: File; kind: UploadKind; controller: AbortController; preview: string | null };

type Options = {
  token: string;
  onDone: (id: string, result: Uploaded) => void;
  onSignedOut: () => void;
};

export type Uploads = ReturnType<typeof useUploads>;

export function useUploads({ token, onDone, onSignedOut }: Options) {
  const [entries, setEntries] = useState<Record<string, UploadEntry>>({});
  const jobs = useRef(new Map<string, Job>());
  const previews = useRef(new Map<string, string>());
  const doneRef = useRef(onDone);
  const signedOutRef = useRef(onSignedOut);

  useLayoutEffect(() => {
    doneRef.current = onDone;
    signedOutRef.current = onSignedOut;
  }, [onDone, onSignedOut]);

  const patch = useCallback((id: string, changes: Partial<UploadEntry>) => {
    setEntries((current) => (current[id] ? { ...current, [id]: { ...current[id], ...changes } } : current));
  }, []);

  const run = useCallback(
    (id: string) => {
      const job = jobs.current.get(id);
      if (!job) return;
      const controller = new AbortController();
      job.controller = controller;
      patch(id, { phase: "waiting", progress: 0, error: "" });
      let shown = -1;
      uploadFile(token, job.file, job.kind, {
        signal: controller.signal,
        onProgress: (fraction) => {
          const percent = Math.round(fraction * 100);
          if (percent === shown) return;
          shown = percent;
          patch(id, { progress: fraction });
        },
        onPhase: (phase) => patch(id, { phase }),
      }).then(
        (result) => {
          if (jobs.current.get(id) !== job) return;
          jobs.current.delete(id);
          if (job.preview) previews.current.set(result.src, job.preview);
          setEntries((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
          doneRef.current(id, result);
        },
        (error) => {
          if (isCancel(error) || jobs.current.get(id) !== job) return;
          if (isSignedOut(error)) signedOutRef.current();
          patch(id, { phase: "error", error: uploadErrorMessage(error) });
        },
      );
    },
    [token, patch],
  );

  const start = useCallback(
    (file: File, kind: UploadKind) => {
      const id = newId();
      const preview = kind === "image" || kind === "video" || kind === "audio" ? URL.createObjectURL(file) : null;
      jobs.current.set(id, { file, kind, controller: new AbortController(), preview });
      setEntries((current) => ({
        ...current,
        [id]: { id, name: file.name, kind, progress: 0, phase: "waiting", error: "", preview },
      }));
      run(id);
      return id;
    },
    [run],
  );

  const cancel = useCallback((id: string) => {
    const job = jobs.current.get(id);
    if (!job) return;
    jobs.current.delete(id);
    job.controller.abort();
    if (job.preview) URL.revokeObjectURL(job.preview);
    setEntries((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    const all = jobs.current;
    const shown = previews.current;
    return () => {
      all.forEach((job) => {
        job.controller.abort();
        if (job.preview) URL.revokeObjectURL(job.preview);
      });
      shown.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const previewFor = useCallback((src: string) => previews.current.get(src) ?? null, []);

  return useMemo(() => {
    const list = Object.values(entries);
    return {
      entries,
      active: list.filter((entry) => entry.phase !== "error").length,
      failed: list.filter((entry) => entry.phase === "error").length,
      start,
      retry: run,
      cancel,
      previewFor,
    };
  }, [entries, start, run, cancel, previewFor]);
}
