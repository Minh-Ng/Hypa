import test from "node:test";
import assert from "node:assert/strict";
import { registerHypaExtension } from "../extensions/index.js";

function createPiMock() {
  const tools: string[] = [];
  const events: string[] = [];
  const commands = new Map<string, any>();
  const pi = {
    registerTool(definition: { name: string }) {
      tools.push(definition.name);
    },
    registerCommand(name: string, definition: any) {
      commands.set(name, definition);
    },
    on(event: string, _handler: unknown) {
      events.push(event);
    },
    getActiveTools() {
      return [...tools];
    },
    setActiveTools(_names: string[]) {},
    async exec() {
      throw new Error("exec must not run while registering the extension");
    },
  };
  return { pi, tools, events, commands };
}

const expectedTools = ["hypa_shell", "hypa_read", "hypa_grep", "hypa_find", "hypa_ls"];

test("rewrite opt-out keeps explicit tools and omits only the Bash listener", async () => {
  const mock = createPiMock();
  registerHypaExtension(mock.pi as any, {
    HYPA_PI_CONFIG: "none",
    HYPA_PI_REWRITE_BASH: "false",
  });

  assert.deepEqual(mock.tools, expectedTools);
  assert.equal(mock.events.includes("tool_call"), false);
  assert.ok(mock.commands.has("hypa"));

  const notifications: string[] = [];
  await mock.commands.get("hypa").handler("", {
    ui: { notify: (message: string) => notifications.push(message) },
  });
  assert.match(notifications[0], /Bash rewrite\/policy interception: disabled \(Deny\/Ask not enforced\)/);
  assert.match(notifications[0], /Active Hypa tools: hypa_shell, hypa_read, hypa_grep, hypa_find, hypa_ls/);
});

test("default configuration registers Bash rewrite and policy interception", () => {
  const mock = createPiMock();
  registerHypaExtension(mock.pi as any, { HYPA_PI_CONFIG: "none" });

  assert.deepEqual(mock.tools, expectedTools);
  assert.equal(mock.events.filter((event) => event === "tool_call").length, 1);
});
