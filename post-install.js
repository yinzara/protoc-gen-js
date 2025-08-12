const AdmZip = require("adm-zip");
const fs = require("fs");
const fetch = require("node-fetch");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const PLUGIN = require("./");

let { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf-8")
); // read the version from the package.json

if (version.includes('-')) {
  version = version.substring(0, version.indexOf('-'))
}
const DL_PREFIX =
  "https://github.com/protocolbuffers/protobuf-javascript/releases/download/v";
const BIN_DIR = path.resolve(__dirname, "bin");
const EXT = process.platform === "win32" ? ".exe" : "";
const PLATFORM_NAME =
  process.platform === "win32"
    ? "win"
    : process.platform === "darwin"
    ? "osx-"
    : "linux-";
const ARCH =
  process.platform === "win32"
    ? process.arch === "ia32"
      ? "32"
      : "64"
    : process.arch === "ppc64"
    ? "ppcle_64"
    : process.arch === "arm64"
    ? "aarch_64"
    : process.arch === "s390x"
    ? "s390_64"
    : process.arch === "ia32"
    ? "x86_32"
    : "x86_64";

async function run() {
  if (
    process.arch === "ppc" ||
    process.arch === "arm" ||
    process.arch === "mips" ||
    process.arch === "mipsel" ||
    process.arch === "s390"
  ) {
    throw new Error(`Unsupported arch: ${process.arch}`);
  }

  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);
  const zipFilename = `protobuf-javascript-${version}-${PLATFORM_NAME}${ARCH}.zip`;

  const downloadUrl = DL_PREFIX + version + "/" + zipFilename;

  console.log("Downloading", downloadUrl);
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.statusText}`);
  }

  let exeFilename = `bin/protoc-gen-js${EXT}`;

  const tmpZipPath = path.join(__dirname, zipFilename + ".tmp");
  const streamPipeline = promisify(pipeline);
  await streamPipeline(res.body, fs.createWriteStream(tmpZipPath));
  const zipFile = new AdmZip(tmpZipPath);
  try {
    zipFile.extractEntryTo(
      exeFilename,
      path.dirname(PLUGIN),
      false,
      true,
      false,
      path.basename(PLUGIN)
    );
  } catch (error) {
    // 3.21.4 moved the file to be located in a nested folder named for the version in windows
    exeFilename = `protobuf-javascript-${version}-${PLATFORM_NAME}${ARCH}/bin/protoc-gen-js${EXT}`
    zipFile.extractEntryTo(
      exeFilename,
      path.dirname(PLUGIN),
      false,
      true,
      false,
      path.basename(PLUGIN)
    );
  }
  fs.unlinkSync(tmpZipPath);
  fs.chmodSync(PLUGIN, "0755");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
