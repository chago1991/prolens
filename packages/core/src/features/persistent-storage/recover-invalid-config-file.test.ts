/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { observable, runInAction } from "mobx";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import directoryForUserDataInjectable from "../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import readJsonSyncInjectable from "../../common/fs/read-json-sync.injectable";
import writeJsonSyncInjectable from "../../common/fs/write-json-sync.injectable";
import fakeConfigurationFileModel from "../../common/get-configuration-file-model/get-configuration-file-model.global-override-for-injectable";
import getConfigurationFileModelInjectable from "../../common/get-configuration-file-model/get-configuration-file-model.injectable";
import { getDiForUnitTesting } from "../../main/getDiForUnitTesting";
import createPersistentStorageInjectable from "./common/create.injectable";
import recoverInvalidConfigFileInjectable from "./main/recover-invalid-config-file.injectable";

import type { DiContainer } from "@ogre-tools/injectable";

import type { GetConfigurationFileModel } from "../../common/get-configuration-file-model/get-configuration-file-model.injectable";

interface State {
  value: string;
}

describe("persistent storage with a store file that is not valid JSON", () => {
  let di: DiContainer;
  let recover: Mock<(filePath: string) => boolean>;
  let failures: number;

  const createStorage = (state: { value: string }) =>
    di.inject(createPersistentStorageInjectable)<State>({
      configName: "some-store",
      projectVersion: "1.0.0",
      defaults: { value: "default" },
      fromStore: (data) => {
        runInAction(() => {
          state.value = data.value ?? "default";
        });
      },
      toJSON: () => ({ value: state.value }),
    });

  beforeEach(() => {
    di = getDiForUnitTesting();
    di.override(directoryForUserDataInjectable, () => "/some-user-data");

    // The real conf throws a SyntaxError for a file that is not valid JSON;
    // the fake used by every test reads one as empty, so it is wrapped.
    failures = 0;
    di.override(getConfigurationFileModelInjectable, (di): GetConfigurationFileModel => {
      const fake = fakeConfigurationFileModel.overridingInstantiate(
        di,
        undefined as never,
      ) as GetConfigurationFileModel;

      return (options) => {
        if (failures > 0) {
          failures -= 1;

          throw new SyntaxError("The config file `/some-user-data/some-store.json` is not valid JSON.");
        }

        return fake(options);
      };
    });

    recover = vi.fn((_filePath: string) => true);
    di.override(recoverInvalidConfigFileInjectable, () => recover);
  });

  it("moves the file aside and starts from the defaults instead of failing", () => {
    const state = observable({ value: "unset" });

    failures = 1;
    createStorage(state).loadAndStartSyncing();

    expect(recover).toHaveBeenCalledWith("/some-user-data/some-store.json");
    expect(state.value).toBe("default");
  });

  it("keeps failing when the file cannot be moved aside", () => {
    recover.mockReturnValue(false);
    failures = 1;

    expect(() => createStorage(observable({ value: "unset" })).loadAndStartSyncing()).toThrow(SyntaxError);
  });

  it("does not recover from an error other than invalid JSON", () => {
    di.override(
      getConfigurationFileModelInjectable,
      (): GetConfigurationFileModel => () => {
        throw new Error("EACCES: permission denied");
      },
    );

    expect(() => createStorage(observable({ value: "unset" })).loadAndStartSyncing()).toThrow("EACCES");
    expect(recover).not.toHaveBeenCalled();
  });

  it("writes a change of the state to the file in one write", () => {
    const state = observable({ value: "unset" });
    const writeJsonSync = di.inject(writeJsonSyncInjectable);

    writeJsonSync("/some-user-data/some-store.json", { value: "stored", unrelated: 1 });
    createStorage(state).loadAndStartSyncing();
    expect(state.value).toBe("stored");

    runInAction(() => {
      state.value = "changed";
    });

    expect(di.inject(readJsonSyncInjectable)("/some-user-data/some-store.json")).toMatchObject({
      value: "changed",
      unrelated: 1,
    });
  });
});
