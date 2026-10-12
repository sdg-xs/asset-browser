import { rename } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

export async function replaceFile({ temporary, destination }: { temporary: string; destination: string }) {
  for (let attempt = 0; ; attempt++) {
    try { await rename(temporary, destination); return; }
    catch (error) {
      const locked = process.platform === "win32" && error instanceof Error && "code" in error &&
        (error.code === "EPERM" || error.code === "EBUSY");
      if (!locked || attempt === 4) throw error;
      await setTimeout(25 * 2 ** attempt);
    }
  }
}
