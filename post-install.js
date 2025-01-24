const AdmZip = require("adm-zip");
const fs = require("fs");
const https = require("https");
const path = require("path");
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

const resHandler = (resolve, reject, res) => {
  if (res.statusCode === 302) {
    https
      .get(res.headers.location, (res2) => resHandler(resolve, reject, res2))
      .on("error", reject);
  } else {
    const data = [];
    res
      .on("data", (chunk) => {
        data.push(chunk);
      })
      .on("end", () => {
        resolve(Buffer.concat(data));
      });
  }
};

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
  const buffer = await new Promise((resolve, reject) => {
    https
      .get(downloadUrl, (res) => resHandler(resolve, reject, res))
      .on("error", reject);
  });

  let exeFilename = `bin/protoc-gen-js${EXT}`;
  const zipFile = new AdmZip(buffer);
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
  fs.chmodSync(PLUGIN, "0755");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
