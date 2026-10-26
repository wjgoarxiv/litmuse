// Bounded response bodies: a fetch that buffers a body reads the stream in pieces
// and aborts past the limit, so a chunked response without (or lying about)
// content-length cannot fill the heap before the size check runs.
export const readCapped = async (response, limit, url) => {
  const chunks = [];
  let size = 0;
  if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) {
        try {
          await response.body.cancel();
        } catch {
          // Already closed by the reader.
        }
        throw new Error(`${url} is larger than ${limit} bytes`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const whole = Buffer.from(await response.arrayBuffer());
  if (whole.length > limit) throw new Error(`${url} is larger than ${limit} bytes`);
  return whole;
};
