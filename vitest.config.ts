import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// The suite runs against the live Supabase project, where the anon role has a
// 3s statement timeout. Unbounded file parallelism makes the heavier count
// queries trip that timeout under contention, so cap the workers and allow one
// retry for transient DB/network flakes.
export default defineConfig({
  // tsconfig's "@/*" path, so server components that use it can be rendered in tests.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // Worktrees (.claude/worktrees/*, or any */worktrees/*) hold a whole second
    // checkout; `vitest run tests/` would run every test twice (#167).
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/worktrees/**"],
    maxWorkers: 4,
    retry: 1,
  },
});
