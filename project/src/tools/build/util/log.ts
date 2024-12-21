/**
 * Logs a formatted header message to the console.
 *
 * @param header - The header message to be logged.
 */
export function header(header: string) {
    console.log(`\n\x1b[35m===\x1b[37m ${header.toUpperCase()} \x1b[35m===\x1b[37m`);
}
