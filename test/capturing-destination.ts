export type LogEntry = Record<string, unknown>;

export function createCapturingDestination() {
  const entries: LogEntry[] = [];
  const destination = {
    write: (serializedLine: string) => {
      entries.push(JSON.parse(serializedLine) as LogEntry);
    },
  };
  return { entries, destination };
}
