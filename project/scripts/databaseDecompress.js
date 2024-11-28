// This script removes the contents of the locations directory and then decompresses
// the locations database from a 7z archive.

const Seven = require("node-7z");
const path = require("node:path");
const fs = require("fs-extra");
const { path7za } = require("7zip-bin");

const archivePath = path.resolve(__dirname, "../assets/compressed/database/locations.7z");
const databaseDir = path.resolve(__dirname, "../assets/database/locations");

(async () => {
    try {
        const archiveExists = await fs.pathExists(archivePath);
        if (!archiveExists) {
            console.error("Error: Archive file does not exist:", archivePath);
            process.exit(1);
        }

        const locationsDir = path.join(databaseDir, "locations");
        if (await fs.pathExists(locationsDir)) {
            await fs.remove(locationsDir);
            console.log("Existing locations directory removed.");
        }

        let hadError = false;

        const myStream = Seven.extractFull(archivePath, databaseDir, {
            $bin: path7za,
            overwrite: "a",
        });

        myStream.on("end", () => {
            if (!hadError) {
                console.log("Decompression completed successfully.");
            }
        });

        myStream.on("error", (err) => {
            hadError = true;
            console.error(`Error decompressing locations: ${err}`);
        });
    } catch (err) {
        console.error(`Error during decompression: ${err}`);
        process.exit(1);
    }
})();
