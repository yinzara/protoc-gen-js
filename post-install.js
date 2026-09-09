const { unzipSync } = require("fflate");
const fs = require("fs");
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

// The target platform/arch normally follow the running Node, but can be pinned
// with PROTOC_GEN_JS_PLATFORM / PROTOC_GEN_JS_ARCH (values as reported by
// `process.platform` / `process.arch`). CI uses this to exercise the real
// download + extract path for targets that cannot be run on a hosted runner
// (linux ia32/ppc64/s390x, win32 ia32); it is also handy for pre-seeding a
// cross-arch install.
const TARGET_PLATFORM = process.env.PROTOC_GEN_JS_PLATFORM || process.platform;
const TARGET_ARCH = process.env.PROTOC_GEN_JS_ARCH || process.arch;

const EXT = TARGET_PLATFORM === "win32" ? ".exe" : "";
const PLATFORM_NAME =
  TARGET_PLATFORM === "win32"
    ? "win"
    : TARGET_PLATFORM === "darwin"
    ? "osx-"
    : "linux-";
const ARCH =
  TARGET_PLATFORM === "win32"
    ? TARGET_ARCH === "ia32"
      ? "32"
      : "64"
    : TARGET_ARCH === "ppc64"
    ? "ppcle_64"
    : TARGET_ARCH === "arm64"
    ? "aarch_64"
    : TARGET_ARCH === "s390x"
    ? "s390_64"
    : TARGET_ARCH === "ia32"
    ? "x86_32"
    : "x86_64";

// Node 24+ can honor the standard HTTP(S)_PROXY / NO_PROXY environment
// variables for the global `fetch` on its own, but only when opted in via
// `NODE_USE_ENV_PROXY=1` or the `--use-env-proxy` flag. On older releases (and
// when that opt-in is absent) we reproduce the exact same behaviour with an
// undici `EnvHttpProxyAgent`, which reads the very same variables:
//   HTTP_PROXY / http_proxy, HTTPS_PROXY / https_proxy, NO_PROXY / no_proxy
//
// Returns the `fetch` implementation to call plus an optional `dispatcher`.
// When we use the undici agent we must also call undici's *own* `fetch`: the
// runtime's built-in `fetch` uses its own bundled undici whose internal
// dispatcher handler contract can differ from the standalone `undici` package
// (e.g. Node 26 rejects a v6 dispatcher with "invalid onError method").
function getProxyFetch() {
  const nodeMajor = parseInt(process.versions.node, 10);
  const nativeEnvProxy =
    nodeMajor >= 24 &&
    (process.env.NODE_USE_ENV_PROXY === "1" ||
      process.execArgv.includes("--use-env-proxy"));

  if (nativeEnvProxy) {
    // The runtime already applies the proxy environment variables to `fetch`.
    return { fetch: globalThis.fetch, dispatcher: undefined };
  }

  const proxyConfigured = [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
  ].some((name) => process.env[name]);

  if (!proxyConfigured) {
    // Nothing to proxy through - keep the default global fetch.
    return { fetch: globalThis.fetch, dispatcher: undefined };
  }

  try {
    const undici = require("undici");
    return {
      fetch: undici.fetch,
      dispatcher: new undici.EnvHttpProxyAgent(),
    };
  } catch (err) {
    console.warn(
      "Unable to load 'undici' for HTTP proxy support; continuing with a direct connection.",
      err && err.message ? err.message : err
    );
    return { fetch: globalThis.fetch, dispatcher: undefined };
  }
}

async function download(url, attempts = 4) {
  const { fetch: fetchImpl, dispatcher } = getProxyFetch();
  // `fetch` follows redirects (302) automatically, so the GitHub release ->
  // asset host hop no longer needs handling here.
  const options = dispatcher ? { dispatcher } : undefined;

  for (let attempt = 1; ; attempt++) {
    let err;
    let retryable = false;
    try {
      const res = await fetchImpl(url, options);
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
      err = new Error(
        `Failed to download ${url}: ${res.status} ${res.statusText}`
      );
      // GitHub's release CDN intermittently 5xx's / 429's under load; those
      // are worth retrying, a 4xx (e.g. 404 for a bad version) is not.
      retryable = res.status >= 500 || res.status === 429;
    } catch (e) {
      // Network-level failure: DNS, connection reset, TLS, proxy unreachable.
      err = e;
      retryable = true;
    }

    if (!retryable || attempt >= attempts) {
      throw err;
    }
    const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
    console.warn(
      `Download attempt ${attempt}/${attempts} failed: ${err.message}. ` +
        `Retrying in ${delayMs}ms`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function run() {
  if (
    TARGET_ARCH === "ppc" ||
    TARGET_ARCH === "arm" ||
    TARGET_ARCH === "mips" ||
    TARGET_ARCH === "mipsel" ||
    TARGET_ARCH === "s390"
  ) {
    throw new Error(`Unsupported arch: ${TARGET_ARCH}`);
  }

  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);
  const zipFilename = `protobuf-javascript-${version}-${PLATFORM_NAME}${ARCH}.zip`;

  const downloadUrl = DL_PREFIX + version + "/" + zipFilename;

  console.log("Downloading", downloadUrl);
  const buffer = await download(downloadUrl);

  // Entry may live at bin/protoc-gen-js or, since 3.21.4 on Windows, inside a
  // folder named for the version. Try both; the `filter` means only the matched
  // entry is actually inflated.
  const candidateEntries = [
    `bin/protoc-gen-js${EXT}`,
    `protobuf-javascript-${version}-${PLATFORM_NAME}${ARCH}/bin/protoc-gen-js${EXT}`,
  ];
  const wanted = new Set(candidateEntries);
  const entries = unzipSync(new Uint8Array(buffer), {
    filter: (file) => wanted.has(file.name),
  });

  const match = candidateEntries.find((name) => entries[name]);
  if (!match) {
    throw new Error(
      `Could not find protoc-gen-js${EXT} inside ${zipFilename}`
    );
  }

  fs.writeFileSync(PLUGIN, Buffer.from(entries[match]));
  fs.chmodSync(PLUGIN, "0755");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
