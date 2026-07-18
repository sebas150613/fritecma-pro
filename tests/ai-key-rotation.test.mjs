import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { serverConfig } from "../server/config.js";
import { invokeAi } from "../server/services/ai-service.js";

const okText = (text) => ({ ok: true, status: 200, json: async () => ({ output_text: text }) });
const errResponse = (status, message) => ({
  ok: false,
  status,
  json: async () => ({ error: { message } }),
});

describe("invokeAi — conmutación por error entre claves de IA", () => {
  let originalFetch;
  let originalKeys;
  let originalProvider;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalKeys = serverConfig.aiApiKeys;
    originalProvider = serverConfig.aiProvider;
    serverConfig.aiProvider = "openai";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    serverConfig.aiApiKeys = originalKeys;
    serverConfig.aiProvider = originalProvider;
  });

  test("usa la primera clave válida y no prueba el resto", async () => {
    serverConfig.aiApiKeys = ["key-a", "key-b"];
    const used = [];
    global.fetch = async (_url, opts) => {
      used.push(opts.headers.Authorization);
      return okText("hola");
    };
    const result = await invokeAi({ prompt: "hi" });
    assert.equal(result, "hola");
    assert.deepEqual(used, ["Bearer key-a"]);
  });

  test("salta a la siguiente clave cuando la primera falla sin saldo (429)", async () => {
    serverConfig.aiApiKeys = ["key-a", "key-b"];
    const used = [];
    global.fetch = async (_url, opts) => {
      used.push(opts.headers.Authorization);
      return opts.headers.Authorization === "Bearer key-a"
        ? errResponse(429, "insufficient_quota")
        : okText("ok con B");
    };
    const result = await invokeAi({ prompt: "hi" });
    assert.equal(result, "ok con B");
    assert.deepEqual(used, ["Bearer key-a", "Bearer key-b"]);
  });

  test("salta a la siguiente clave ante error de red / timeout", async () => {
    serverConfig.aiApiKeys = ["key-a", "key-b"];
    const used = [];
    global.fetch = async (_url, opts) => {
      used.push(opts.headers.Authorization);
      if (opts.headers.Authorization === "Bearer key-a") {
        throw new Error("network down");
      }
      return okText("recuperado");
    };
    const result = await invokeAi({ prompt: "hi" });
    assert.equal(result, "recuperado");
    assert.deepEqual(used, ["Bearer key-a", "Bearer key-b"]);
  });

  test("si todas las claves fallan, lanza 503 con mensaje para el usuario", async () => {
    serverConfig.aiApiKeys = ["key-a", "key-b"];
    global.fetch = async () => errResponse(401, "invalid api key");
    await assert.rejects(
      () => invokeAi({ prompt: "hi" }),
      (err) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /no está disponible/i);
        return true;
      }
    );
  });

  test("un 400 (petición nuestra) no rota claves y se propaga tal cual", async () => {
    serverConfig.aiApiKeys = ["key-a", "key-b"];
    const used = [];
    global.fetch = async (_url, opts) => {
      used.push(opts.headers.Authorization);
      return errResponse(400, "bad schema");
    };
    await assert.rejects(
      () => invokeAi({ prompt: "hi" }),
      (err) => {
        assert.equal(err.status, 400);
        return true;
      }
    );
    assert.deepEqual(used, ["Bearer key-a"]);
  });
});
