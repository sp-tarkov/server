// This script compresses the locations database into a 7z archive.

const Seven = require("node-7z");
const path = require("node:path");
const { path7za } = require("7zip-bin");

const archivePath = path.resolve(__dirname, "../assets/compressed/database/locations.7z");
const locationsDir = path.resolve(__dirname, "../assets/database/locations/*.json");

let hadError = false;

const myStream = Seven.add(archivePath, locationsDir, {
    recursive: true,
    $bin: path7za,
    method: ["0=LZMA2"],
    compressionLevel: 9,
});

myStream.on("end", () => {
    if (!hadError) {
        console.log("Compression completed successfully.");
    }
});

myStream.on("error", (err) => {
    hadError = true;
    console.error(`Error compressing locations: ${err}`);
});
