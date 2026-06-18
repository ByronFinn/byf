export interface Transport {
  onMessage(handler: (frame: string) => void): void;
  send(frame: string): void;
  close(): void;
}