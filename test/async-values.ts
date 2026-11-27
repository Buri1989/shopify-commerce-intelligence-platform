export async function collectAsyncValues<Value>(
  values: AsyncIterable<Value>,
): Promise<Value[]> {
  const collected: Value[] = [];
  for await (const value of values) {
    collected.push(value);
  }
  return collected;
}
