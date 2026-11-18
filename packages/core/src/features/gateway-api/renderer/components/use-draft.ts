/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { isEqual } from "es-toolkit";
import { useEffect, useRef, useState } from "react";

// Values may come from observable objects, which structuredClone refuses.
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/**
 * A local copy of a value read from an object for editing. A watch event
 * that leaves the value as it was (labels, status, managed fields) keeps
 * the edits; a change of the value itself replaces the copy only when there
 * are no edits, and is reported otherwise.
 */
export const useDraft = <T>(source: T) => {
  const [draft, setDraft] = useState<T>(() => clone(source));
  const base = useRef<T>(clone(source));
  const applying = useRef(false);
  const [changedInCluster, setChangedInCluster] = useState(false);
  const dirty = !isEqual(clone(draft), base.current);

  useEffect(() => {
    const next = clone(source);

    if (isEqual(next, base.current)) return;

    // Unedited, or the object changed because of our own apply (the API
    // server may have added defaults to what was sent).
    if (applying.current || isEqual(clone(draft), base.current) || isEqual(clone(draft), next)) {
      applying.current = false;
      base.current = next;
      setDraft(clone(next));
      setChangedInCluster(false);
    } else {
      setChangedInCluster(true);
    }
  }, [source]);

  const reset = () => {
    base.current = clone(source);
    setDraft(clone(source));
    setChangedInCluster(false);
  };

  /** Runs an apply; the next value from the cluster replaces the draft. */
  const apply = async (run: () => Promise<void>) => {
    applying.current = true;

    try {
      await run();
    } catch (error) {
      applying.current = false;
      throw error;
    }
  };

  return { draft, setDraft, dirty, changedInCluster, reset, apply };
};
