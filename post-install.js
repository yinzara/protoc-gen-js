const path = require('path');
const AdmZip = require('adm-zip');

const fs = require('fs');
const download = require('download');
const PLUGIN = require('./');
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')); // read the version from the package.json

const DL_PREFIX = 'https://github.com/protocolbuffers/protobuf-javascript/releases/download/v';
const BIN_DIR = path.resolve(__dirname, 'bin');
const EXT = process.platform === 'win32' ? '.exe' : '';
const PLATFORM_NAME = process.platform === 'win32' ? '' : process.platform === 'darwin' ? 'osx-' : 'linux-';
const ARCH = process.platform === 'win32' ? process.arch === 'ia32' ? 'win32' : 'win64' :
            process.arch === 'ppc64' ? 'ppcle_64' :
            process.arch === 'arm64' ? 'aarch_64' :
            process.arch === 's390x' ? 's390_64' :
            process.arch === 'ia32' ? 'x86_32' : 'x86_64';

async function run() {
  if (process.arch === 'ppc' || process.arch === 'arm' || process.arch === 'mips' || process.arch === 'mipsel' || process.arch === 's390') {
    throw new Error(
      `Unsupported arch: ${process.arch}`
    );
  }

  if (!fs.existsSync(BIN_DIR))
    fs.mkdirSync(BIN_DIR)
  const zipFilename = `protobuf-javascript-${version}-${PLATFORM_NAME}${ARCH}.zip`;

  const downloadUrl = DL_PREFIX + version + '/' + zipFilename;

  console.log('Downloading', downloadUrl);
  const buffer = await download(downloadUrl).catch(err => {
    console.error(err.message);
    process.exit(1);
  });

  const exeFilename = `bin/protoc-gen-js${EXT}`;
  const zipFile = new AdmZip(buffer);
  zipFile.extractEntryTo(
    exeFilename,
    path.dirname(PLUGIN),
    false,
    true,
    false,
    path.basename(PLUGIN));
  fs.chmodSync(PLUGIN, '0755');
}

run().catch(e => {
  console.error(e)
  process.exit(1)
});

