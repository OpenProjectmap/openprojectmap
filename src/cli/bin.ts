// The `openprojectmap` and `opmap` executable.
import { mainAsync } from './index.js';

process.exitCode = await mainAsync(process.argv.slice(2));
