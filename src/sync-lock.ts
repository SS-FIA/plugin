export class SyncLock {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return this.release.bind(this);
    }
    return new Promise<() => void>(resolve => {
      this.queue.push(() => {
        this.locked = true;
        resolve(this.release.bind(this));
      });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get queueLength(): number {
    return this.queue.length;
  }
}
