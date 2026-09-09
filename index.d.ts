/**
 * Absolute path to the `protoc-gen-js` executable that was downloaded for the
 * current platform and architecture by this package's install script.
 *
 * @example
 * ```ts
 * import protocGenJsBinaryPath from "protoc-gen-js";
 * // or: const protocGenJsBinaryPath = require("protoc-gen-js");
 * execFileSync("protoc", [`--plugin=protoc-gen-js=${protocGenJsBinaryPath}`, ...]);
 * ```
 */
declare const protocGenJsBinaryPath: string;

export = protocGenJsBinaryPath;
