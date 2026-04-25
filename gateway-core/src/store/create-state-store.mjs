import { FileStateStore } from "./file-state-store.mjs";
import { SqliteStateStore } from "./sqlite-state-store.mjs";

export function createStateStore(runtimeConfig) {
  const driver = runtimeConfig.storeDriver ?? "file";

  if (driver === "file") {
    return new FileStateStore({ stateFile: runtimeConfig.stateFile });
  }

  if (driver === "sqlite") {
    return new SqliteStateStore({ sqliteFile: runtimeConfig.sqliteFile });
  }

  throw new Error(`Unsupported runtime.storeDriver ${driver}`);
}
