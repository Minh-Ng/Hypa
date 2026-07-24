import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const packageRoot = resolve(import.meta.dirname, "..");
const postinstall = join(packageRoot, "scripts", "postinstall.js");

function runForcedPostinstall(home: string) {
  const result = spawnSync(process.execPath, [postinstall], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      HYPA_PI_FORCE_CLI_INSTALL: "1",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test("forced postinstall refreshes a legacy pi-hypa shim", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-hypa-postinstall-"));
  try {
    const binDir = join(home, ".local", "bin");
    const shim = join(binDir, "hypa");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(shim, `#!/usr/bin/env sh
SELF="$(realpath "$0")"
real_candidate="$(realpath "$candidate")"
exec node '/obsolete/npm/node_modules/@hypabolic/hypa/bin.js' "$@"
`);

    const result = runForcedPostinstall(home);
    const refreshed = readFileSync(shim, "utf8");
    assert.match(result.stderr, /Updated Hypa CLI shim/);
    assert.match(refreshed, /Managed by @hypabolic\/pi-hypa/);
    assert.doesNotMatch(refreshed, /obsolete\/npm/);

    const competingBin = join(home, "other-bin");
    mkdirSync(competingBin);
    writeFileSync(
      join(competingBin, "hypa"),
      "#!/usr/bin/env sh\n# Managed by @hypabolic/pi-hypa\nexit 99\n",
      { mode: 0o755 },
    );
    const invocation = spawnSync(shim, ["--version"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${competingBin}:${process.env.PATH}` },
      timeout: 5_000,
    });
    assert.equal(invocation.status, 0, invocation.stderr || invocation.stdout);
    assert.match(invocation.stdout, /0\.1\.3/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("forced postinstall preserves an arbitrary user-owned shim", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-hypa-postinstall-"));
  try {
    const binDir = join(home, ".local", "bin");
    const shim = join(binDir, "hypa");
    const custom = "#!/usr/bin/env sh\necho custom-hypa\n";
    mkdirSync(binDir, { recursive: true });
    writeFileSync(shim, custom);

    const result = runForcedPostinstall(home);
    assert.match(result.stderr, /leaving it unchanged/);
    assert.equal(readFileSync(shim, "utf8"), custom);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
