// This script sets the execute permission on the 7za binary if you're on macOS or Linux.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const platform = os.platform();
const arch = os.arch();

let sevenZipPath;

if (platform === "darwin") {
    // macOS
    sevenZipPath = path.join(__dirname, "..", "node_modules", "7zip-bin", "mac", arch, "7za");
} else if (platform === "linux") {
    // Linux
    sevenZipPath = path.join(__dirname, "..", "node_modules", "7zip-bin", "linux", arch, "7za");
} else {
    // Windows (or other)
    process.exit(0);
}

fs.chmod(sevenZipPath, 0o755, (err) => {
    if (err) {
        console.error("Failed to set execute permission on 7za:", err);
        process.exit(1);
    } else {
        console.log("Execute permission set on 7za.");
    }
});
