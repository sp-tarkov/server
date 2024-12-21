import minimist from "minimist";

interface BuildOptions {
    type: string;
    arch: string;
    platform: string;
    start: boolean;
}

/**
 * Parses the command line arguments and returns the build options.
 *
 * @param args - The command line arguments.
 * @returns The build options: `type`, `arch`, `platform`, and `start`.
 */
export const getBuildOptions = (args: string[]): BuildOptions => {
    const options = minimist(args, {
        string: ["type", "arch", "platform", "start"],
        default: { type: "debug", arch: process.arch, platform: process.platform, start: false },
    });
    return {
        type: options.type,
        arch: options.arch,
        platform: options.platform,
        start: options.start,
    } as BuildOptions;
};
