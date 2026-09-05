export function terminateCli(code: number, exitFn?: (code: number) => void): void {
  if (exitFn) {
    exitFn(code);
    return;
  }
  process.exit(code);
}
