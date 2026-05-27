export const NATIVE_ASSET_MANIFEST_VERSION = 1;

export function buildManifestKey(target) {
  return `native/${target}/manifest.json`;
}

export function isManifestVersionSupported(version) {
  return version === NATIVE_ASSET_MANIFEST_VERSION;
}

export function buildAssetKey(target, packageRoot, relativePath) {
  return `native/${target}/${packageRoot}/${relativePath}`;
}
