# protoc-gen-js binary for npm

[![Test and Publish](https://github.com/yinzara/protoc-gen-js/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/yinzara/protoc-gen-js/actions/workflows/publish.yml)

This package provides the official [js protoc plugin](https://github.com/protocolbuffers/protobuf-javascript), downloaded from [protobuf-javascript releases](https://github.com/protocolbuffers/protobuf-javascript/releases).

# Installation

This package can be installed in a package.json's devDependencies to make the `protoc-gen-js` plugin available within "scripts" of that package.json
```shell
npm install -D protoc-gen-js
```

OR

It can be installed globally to make it available throughout the system:
```shell
npm install --global protoc-gen-js
```

On install, a `postinstall` script downloads the matching `protoc-gen-js`
binary for the current platform and architecture from the upstream
protobuf-javascript release.

## Allowing the install script (npm 11.16+ / npm 12+)

The `postinstall` script is how the binary gets onto disk, so it has to be
allowed to run. Recent npm versions gate dependency lifecycle scripts behind an
`allowScripts` allowlist in your `package.json`:

- **npm 11.16 – 11.x** – advisory only: the script still runs, but `npm install`
  ends with a summary listing `protoc-gen-js` as unreviewed. Record the approval
  to silence it:

  ```sh
  npm approve-scripts protoc-gen-js
  # equivalently, on npm 11.19+:  npm install-scripts approve protoc-gen-js
  ```

- **npm 12+** – enforced: unapproved scripts are **skipped**, so the binary is
  never downloaded and the plugin will not work. Approve it and then run the
  script:

  ```sh
  npm install-scripts approve protoc-gen-js
  npm rebuild protoc-gen-js        # or just re-run `npm install`
  ```

`npm install-scripts ls` shows the current state; `approve --all` allows every
dependency. If you install with `--ignore-scripts`, the same `npm rebuild
protoc-gen-js` step is needed afterwards.

Other package managers:

- **pnpm** – add `protoc-gen-js` to `pnpm.onlyBuiltDependencies` in
  `package.json`, or run `pnpm approve-builds`.
- **Yarn** (Berry) – set `dependenciesMeta["protoc-gen-js"].built = true`.

# Programmatic use

The package's main export is the absolute path to the downloaded binary, so it
can be wired into a build script without shelling out to find it:

```js
// CommonJS
const protocGenJsBinaryPath = require("protoc-gen-js");
```

```ts
// ES modules / TypeScript
import protocGenJsBinaryPath from "protoc-gen-js";
```

```js
const { execFileSync } = require("node:child_process");

execFileSync("protoc", [
  `--plugin=protoc-gen-js=${protocGenJsBinaryPath}`,
  "--js_out=import_style=commonjs:.",
  "path/to/your.proto",
]);
```

Type definitions ship with the package (`index.d.ts`); the export is typed as
`string`. The `import ... from` form relies on `esModuleInterop` (or
`allowSyntheticDefaultImports`) in your `tsconfig.json`; otherwise use
`import protocGenJsBinaryPath = require("protoc-gen-js")`.

# Supported Node.js versions

Node.js **18 or newer** is required (the install script uses the built-in
global `fetch`). Every release is tested in CI against Node.js **18, 20, 22, 24
and 26**.

# Supported platforms and architectures

Each CI run downloads and extracts the real upstream binary for every target
below. The five that can execute on a GitHub-hosted runner additionally run a
full `protoc` code-generation; the rest are verified by asserting the extracted
executable's format.

| OS | Architectures |
| --- | --- |
| Linux | x64, arm64, ia32, ppc64 (ppc64le), s390x |
| macOS | x64 (Intel), arm64 (Apple Silicon) |
| Windows | x64, ia32 |

`process.arch` values `ppc`, `arm`, `mips`, `mipsel` and `s390` are explicitly
unsupported and cause the install to fail with a clear message.

# Proxy configuration

The install script honors the standard proxy environment variables, so it
works behind a corporate HTTP/HTTPS proxy with no extra configuration:

| Variable | Purpose |
| --- | --- |
| `HTTPS_PROXY` / `https_proxy` | Proxy URL for the `https://` download |
| `HTTP_PROXY` / `http_proxy` | Proxy URL for any `http://` request / fallback |
| `ALL_PROXY` / `all_proxy` | Proxy URL used when the scheme-specific ones are unset |
| `NO_PROXY` / `no_proxy` | Comma-separated hosts/domains to reach directly |

```shell
HTTPS_PROXY=http://proxy.example.com:8080 npm install -D protoc-gen-js
```

How it is applied:

- **Node.js 24+** with `NODE_USE_ENV_PROXY=1` (or `--use-env-proxy`): Node's
  own native proxy support for `fetch` is used and the script does nothing
  extra.
- **Otherwise** (Node 18–22, or Node 24+ without the opt-in): the script
  routes the download through [`undici`](https://www.npmjs.com/package/undici)'s
  `EnvHttpProxyAgent`, which reads the exact same variables. `undici` is an
  `optionalDependency`; if it is not present the download falls back to a
  direct connection.

## Credits

Forked from [hronro-protoc-gen-grpc-web](https://www.npmjs.com/package/protoc-gen-grpc-web).
