// Open a file with the OS opener, through execFile (never a shell).
import { execFile } from 'node:child_process';

export type Opener = (file: string) => void;

export function openerCommand(
  platform: NodeJS.Platform,
  file: string,
): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [file] };
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', file] };
  return { cmd: 'xdg-open', args: [file] };
}

export const openFile: Opener = (file) => {
  const { cmd, args } = openerCommand(process.platform, file);
  execFile(cmd, args, { windowsHide: true }, () => undefined);
};
