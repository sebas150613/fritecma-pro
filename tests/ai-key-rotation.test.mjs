import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { serverConfig } from "../server/config.js";
import { invokeAi } from "../server/services/ai-service.js";

// Respuestas de éxito según el formato de cada proveedor.
const openaiText = (text) => ({ ok: true, status: 200, json: async () => ({ output_text: text }) });
const anthropicText = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: "text", text }] }),
});
const anthropicTool = (input) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: "tool_use", name: "emitir_datos", input }] }),
});
const deepseekText = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] }),
});
const errResponse = (status, message) => ({
  ok: false,
  status,
  json: async () => ({ error: { message } }),
});

const providerOf = (url) => {
  if (url.includes("/responses")) return "openai";
  if (url.includes("/messages")) return "anthropic";
  if (url.includes("/chat/completions")) return "deepseek";
  return "unknown";
};

describe("invokeAi — conmutación entre proveedores de IA", () => {
  let originalFetch;
  let snapshot;

  beforeEach(() => {
    originalFetch = global.fetch;
    snapshot = {
      order: serverConfig.aiProviderOrder,
      openai: serverConfig.aiApiKeys,
      anthropic: serverConfig.anthropicApiKeys,
      deepseek: serverConfig.deepseekApiKeys,
    };
    serverConfig.aiProviderOrder = ["openai", "anthropic", "deepseek"];
    serverConfig.aiApiKeys = [];
    serverConfig.anthropicApiKeys = [];
    serverConfig.deepseekApiKeys = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
    serverConfig.aiProviderOrder = snapshot.order;
    serverConfig.aiApiKeys = snapshot.openai;
    serverConfig.anthropicApiKeys = snapshot.anthropic;
    serverConfig.deepseekApiKeys = snapshot.deepseek;
  });

  test("usa OpenAI cuando responde y no toca los demás proveedores", async () => {
    serverConfig.aiApiKeys = ["oai"];
    serverConfig.anthropicApiKeys = ["ant"];
    const used = [];
    global.fetch = async (url) => {
      used.push(providerOf(url));
      return openaiText("hola desde openai");
    };
    const result = await invokeAi({ prompt: "hi" });
    assert.equal(result, "hola desde openai");
    assert.deepEqual(used, ["openai"]);
  });

  test("si OpenAI se queda sin saldo (429), cae a Anthropic", async () => {
    serverConfig.aiApiKeys = ["oai"];
    serverConfig.anthropicApiKeys = ["ant"];
    const used = [];
    global.fetch = async (url) => {
      used.push(providerOf(url));
      return providerOf(url) === "openai"
        ? errResponse(429, "insufficient_quota")
        : anthropicText("respondo yo, anthropic");
    };
    const result = await invokeAi({ prompt: "hi" });
    assert.equal(result, "respondo yo, anthropic");
    assert.deepEqual(used, ["openai", "anthropic"]);
  });

  test("OCR (con imagen): DeepSeek se excluye por no tener visión", async () => {
    serverConfig.aiApiKeys = ["oai"];
    serverConfig.deepseekApiKeys = ["ds"];
    const used = [];
    global.fetch = async (url) => {
      used.push(providerOf(url));
      return providerOf(url) === "openai"
        ? errResponse(500, "server error")
        : deepseekText("no debería usarse");
    };
    // Con imagen y solo OpenAI(falla)+DeepSeek(sin visión) → 503, sin tocar DeepSeek.
    await assert.rejects(
      () => invokeAi({ prompt: "lee esto", file_urls: ["data:image/png;base64,AAAA"] }),
      (err) => {
        assert.equal(err.status, 503);
        return true;
      }
    );
    assert.deepEqual(used, ["openai"]);
  });

  test("Anthropic estructurado: devuelve el input del tool_use", async () => {
    serverConfig.anthropicApiKeys = ["ant"];
    global.fetch = async () => anthropicTool({ supplier: "ACME", lines: [{ code: "A1" }] });
    const result = await invokeAi({
      prompt: "extrae",
      file_urls: ["data:image/png;base64,AAAA"],
      response_json_schema: {
        type: "object",
        properties: { supplier: { type: "string" }, lines: { type: "array", items: { type: "object", properties: { code: { type: "string" } } } } },
      },
    });
    assert.equal(result.supplier, "ACME");
    assert.equal(result.lines[0].code, "A1");
  });

  test("solo DeepSeek configurado y petición de texto: lo usa", async () => {
    serverConfig.deepseekApiKeys = ["ds"];
    const used = [];
    global.fetch = async (url) => {
      used.push(providerOf(url));
      return deepseekText("hola desde deepseek");
    };
    const result = await invokeAi({ prompt: "hola" });
    assert.equal(result, "hola desde deepseek");
    assert.deepEqual(used, ["deepseek"]);
  });

  test("si todos los proveedores fallan → 503 con mensaje para el usuario", async () => {
    serverConfig.aiApiKeys = ["oai"];
    serverConfig.anthropicApiKeys = ["ant"];
    serverConfig.deepseekApiKeys = ["ds"];
    global.fetch = async () => errResponse(401, "invalid key");
    await assert.rejects(
      () => invokeAi({ prompt: "hi" }),
      (err) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /no está disponible/i);
        return true;
      }
    );
  });

  test("varias claves del mismo proveedor: rota antes de cambiar de proveedor", async () => {
    serverConfig.aiApiKeys = ["oai-1", "oai-2"];
    serverConfig.anthropicApiKeys = ["ant"];
    const authHeaders = [];
    global.fetch = async (url, opts) => {
      if (providerOf(url) === "openai") {
        authHeaders.push(opts.headers.Authorization);
        return opts.headers.Authorization === "Bearer oai-1"
          ? errResponse(429, "quota")
          : openaiText("ok con segunda clave openai");
      }
      return anthropicText("no debería llegar aquí");
    };
    const result = await invokeAi({ prompt: "hi" });
    assert.equal(result, "ok con segunda clave openai");
    assert.deepEqual(authHeaders, ["Bearer oai-1", "Bearer oai-2"]);
  });

  test("sin ningún proveedor configurado: fallback vacío (contrato smoke)", async () => {
    let called = false;
    global.fetch = async () => {
      called = true;
      return openaiText("no");
    };
    const structured = await invokeAi({
      prompt: "hi",
      response_json_schema: { type: "object", properties: { supplier: { type: "string" } } },
    });
    assert.equal(typeof structured, "object");
    assert.equal(structured.supplier, "");
    const text = await invokeAi({ prompt: "hi" });
    assert.equal(typeof text, "string");
    assert.equal(called, false);
  });
});
