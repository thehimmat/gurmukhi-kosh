// Prints the files a fresh database runs, in order (tests/db/replay.ts), one per line.
import { allFiles } from "../../tests/db/replay";

console.log(allFiles().join("\n"));
