/**
 * Converts a ReadableStream of Uint8Array to a string.
 *
 * @param stream - The ReadableStream to convert. If null, the function returns null.
 * @returns A promise that resolves to the string representation of the stream's content, or null if the stream is null.
 */
export async function streamToString(stream: ReadableStream<Uint8Array> | null): Promise<string | null> {
    if (!stream) {
        return null;
    }

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (value) {
                chunks.push(value);
            }
        }
    } catch (error) {
        console.error("Error reading stream:", error);
        return null;
    }

    const allChunks = new Uint8Array(chunks.flatMap((chunk) => Array.from(chunk)));
    return new TextDecoder().decode(allChunks);
}
