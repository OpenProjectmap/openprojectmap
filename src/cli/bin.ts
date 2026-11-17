// The `openprojectmap` and `opmap` executable.
import { main } from './index.js';

process.exitCode = main(process.argv.slice(2));
