import fs from "node:fs/promises";
import path from "node:path";
import { serverConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", serverConfig.host]);
const IMAGE_MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const isOpenAiModelName = (value) =>
  typeof value === "string" &&
  /^(gpt|o[1-9]|o3|o4|chatgpt)/i.test(value.trim());

const withStrictJsonSchema = (schema) => {
  if (!schema || typeof schema !== "object") {
    return { type: "object", additionalProperties: false, properties: {}, required: [] };
  }

  if (schema.type === "object") {
    const properties = Object.fromEntries(
      Object.entries(schema.properties || {}).map(([key, value]) => [
        key,
        withStrictJsonSchema(value),
      ])
    );

    return {
      ...schema,
      additionalProperties:
        schema.additionalProperties === undefined
          ? false
          : schema.additionalProperties,
      properties,
      required: Array.isArray(schema.required)
        ? schema.required
        : Object.keys(properties),
    };
  }

  if (schema.type === "array") {
    return {
      ...schema,
      items: withStrictJsonSchema(schema.items || {}),
    };
  }

  return schema;
};

const buildFallbackValueFromSchema = (schema) => {
  if (!schema || typeof schema !== "object") {
    return null;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return Object.fromEntries(
        Object.entries(schema.properties || {}).map(([key, value]) => [
          key,
          buildFallbackValueFromSchema(value),
        ])
      );
    default:
      return null;
  }
};

const extractResponseText = (responseBody) => {
  if (typeof responseBody?.output_text === "string" && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  const chunks = [];

  for (const outputItem of responseBody?.output || []) {
    for (const contentItem of outputItem?.content || []) {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        chunks.push(contentItem.text.trim());
      }
    }
  }

  return chunks.join("\n\n").trim();
};

const extractStructuredResponse = (responseBody, schema) => {
  const directParsed =
    responseBody?.output_parsed ??
    responseBody?.parsed ??
    responseBody?.output?.[0]?.content?.[0]?.parsed;

  if (directParsed && typeof directParsed === "object") {
    return directParsed;
  }

  const text = extractResponseText(responseBody);
  if (!text) {
    return buildFallbackValueFromSchema(schema);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(502, "The AI provider returned invalid JSON for a structured response.", {
      cause: error.message,
      raw_response: text,
    });
  }
};

const guessMimeType = (filePath) =>
  IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";

const resolveUploadPath = (pathname) => {
  const relativePath = pathname.replace(/^\/+/, "").replace(/^uploads\//, "");
  const absolutePath = path.resolve(serverConfig.uploadsDir, relativePath);
  const uploadsRoot = path.resolve(serverConfig.uploadsDir);

  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`) && absolutePath !== uploadsRoot) {
    throw new HttpError(400, "Invalid upload path.");
  }

  return absolutePath;
};

/** True si la ruta (relativa a /uploads/) pertenece a la organización dada. */
const uploadPathBelongsToOrg = (uploadPathname, context) => {
  if (context?.isOwner) {
    return true;
  }
  const orgId = context?.organizationId;
  if (!orgId) {
    return false;
  }
  const relative = uploadPathname.replace(/^\/+/, "").replace(/^uploads\//, "");
  return (
    relative.startsWith(`public/${orgId}/`) ||
    relative.startsWith(`private/${orgId}/`)
  );
};

const localFileUrlToDataUrl = async (fileUrl, context = {}) => {
  if (!fileUrl || typeof fileUrl !== "string" || fileUrl.startsWith("data:")) {
    return fileUrl;
  }

  let url;

  try {
    url = fileUrl.startsWith("http://") || fileUrl.startsWith("https://")
      ? new URL(fileUrl)
      : new URL(fileUrl, `http://${serverConfig.host}:${serverConfig.port}`);
  } catch (_error) {
    return fileUrl;
  }

  if (!LOCAL_HOSTS.has(url.hostname) || !url.pathname.startsWith("/uploads/")) {
    return fileUrl;
  }

  // El fichero local debe pertenecer a la organización del solicitante:
  // evita lectura cruzada entre organizaciones a través de la visión IA.
  if (!uploadPathBelongsToOrg(url.pathname, context)) {
    throw new HttpError(403, "No autorizado para acceder a ese fichero.");
  }

  const filePath = resolveUploadPath(url.pathname);
  const buffer = await fs.readFile(filePath);
  const mimeType = guessMimeType(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
};

const normalizeInputFileUrls = async (fileUrls = [], context = {}) => {
  const results = [];

  for (const fileUrl of fileUrls) {
    if (!fileUrl) {
      continue;
    }

    results.push(await localFileUrlToDataUrl(fileUrl, context));
  }

  return results;
};

const resolveOpenAiModel = ({ requestedModel, hasVisionInput }) => {
  if (isOpenAiModelName(requestedModel)) {
    return requestedModel.trim();
  }
  return hasVisionInput ? serverConfig.aiVisionModel : serverConfig.aiModel;
};

const buildFallbackText = () =>
  "La IA del backend REST no esta configurada todavia. Configura al menos un proveedor (OPENAI_API_KEY, ANTHROPIC_API_KEY o DEEPSEEK_API_KEY) para activar respuestas reales.";

// Mensaje único que ve el usuario cuando ningún proveedor de IA responde.
const AI_UNAVAILABLE_MESSAGE =
  "El servicio con IA no está disponible en estos momentos. Inténtelo de nuevo más tarde.";

// Un 400/404/422 es un problema de NUESTRA petición a ESE proveedor (schema
// no aceptado, imagen no soportada...). Reintentar con otra clave del mismo
// proveedor daría el mismo error, así que se salta al siguiente proveedor
// (cuya API puede aceptar la petición). Los demás fallos (401/403 clave
// inválida, 429 sin saldo/rate-limit, 5xx, red/timeout) justifican probar la
// siguiente clave del mismo proveedor.
const isOurRequestError = (status) =>
  status === 400 || status === 404 || status === 422;

const parseDataUrl = (dataUrl) => {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl || ""));
  return match ? { mediaType: match[1], data: match[2] } : null;
};

// Registro de proveedores. Cada uno declara si soporta visión, de dónde saca
// sus claves, cómo construir la petición HTTP y cómo extraer la respuesta
// (texto suelto o estructurada según el esquema).
const PROVIDERS = {
  openai: {
    id: "openai",
    label: "OpenAI",
    supportsVision: true,
    getKeys: () => serverConfig.aiApiKeys,
    build: ({ prompt, imageDataUrls, jsonSchema, maxTokens, requestedModel }) => ({
      url: `${serverConfig.aiBaseUrl}/responses`,
      headers: (key) => ({
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      }),
      body: {
        model: resolveOpenAiModel({
          requestedModel,
          hasVisionInput: imageDataUrls.length > 0,
        }),
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              ...imageDataUrls.map((url) => ({ type: "input_image", image_url: url })),
            ],
          },
        ],
        max_output_tokens: maxTokens,
        text: jsonSchema
          ? {
              format: {
                type: "json_schema",
                name: "frigest_structured_response",
                strict: true,
                schema: jsonSchema,
              },
            }
          : undefined,
      },
    }),
    parse: (responseBody, jsonSchema) =>
      jsonSchema
        ? extractStructuredResponse(responseBody, jsonSchema)
        : extractResponseText(responseBody) || buildFallbackText(),
    errorMessage: (body) => body?.error?.message || body?.message,
  },

  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    supportsVision: true,
    getKeys: () => serverConfig.anthropicApiKeys,
    build: ({ prompt, imageDataUrls, jsonSchema, maxTokens }) => {
      const imageBlocks = imageDataUrls
        .map(parseDataUrl)
        .filter(Boolean)
        .map(({ mediaType, data }) => ({
          type: "image",
          source: { type: "base64", media_type: mediaType, data },
        }));
      const body = {
        model:
          imageDataUrls.length > 0
            ? serverConfig.anthropicVisionModel
            : serverConfig.anthropicModel,
        max_tokens: maxTokens,
        messages: [
          { role: "user", content: [{ type: "text", text: prompt }, ...imageBlocks] },
        ],
      };
      if (jsonSchema) {
        // Anthropic no tiene json_schema nativo: se fuerza una herramienta cuya
        // entrada ES el esquema y se lee el bloque tool_use de la respuesta.
        body.tools = [
          {
            name: "emitir_datos",
            description: "Devuelve la respuesta estructurada solicitada.",
            input_schema: jsonSchema,
          },
        ];
        body.tool_choice = { type: "tool", name: "emitir_datos" };
      }
      return {
        url: `${serverConfig.anthropicBaseUrl}/messages`,
        headers: (key) => ({
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        }),
        body,
      };
    },
    parse: (responseBody, jsonSchema) => {
      const content = Array.isArray(responseBody?.content) ? responseBody.content : [];
      if (jsonSchema) {
        const tool = content.find((block) => block?.type === "tool_use");
        if (tool?.input && typeof tool.input === "object") {
          return tool.input;
        }
        const text = content
          .filter((block) => block?.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        if (text) {
          try {
            return JSON.parse(text);
          } catch {
            // cae al fallback del esquema
          }
        }
        return buildFallbackValueFromSchema(jsonSchema);
      }
      const text = content
        .filter((block) => block?.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return text || buildFallbackText();
    },
    errorMessage: (body) => body?.error?.message || body?.message,
  },

  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    // DeepSeek (deepseek-chat) NO acepta imágenes: solo participa en
    // peticiones de texto, nunca en el OCR de albaranes.
    supportsVision: false,
    getKeys: () => serverConfig.deepseekApiKeys,
    build: ({ prompt, jsonSchema, maxTokens }) => {
      // El modo response_format:json_object de DeepSeek exige que el prompt
      // contenga la palabra "json" y que se describa el formato esperado; se
      // añade el esquema al prompt para guiar la salida.
      const finalPrompt = jsonSchema
        ? `${prompt}\n\nResponde ÚNICAMENTE con un objeto JSON válido que cumpla este esquema:\n${JSON.stringify(
            jsonSchema
          )}`
        : prompt;
      return {
        url: `${serverConfig.deepseekBaseUrl}/chat/completions`,
        headers: (key) => ({
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        }),
        body: {
          model: serverConfig.deepseekModel,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: finalPrompt }],
          ...(jsonSchema ? { response_format: { type: "json_object" } } : {}),
        },
      };
    },
    parse: (responseBody, jsonSchema) => {
      const text = responseBody?.choices?.[0]?.message?.content;
      if (jsonSchema) {
        if (typeof text !== "string" || !text.trim()) {
          return buildFallbackValueFromSchema(jsonSchema);
        }
        try {
          return JSON.parse(text);
        } catch {
          return buildFallbackValueFromSchema(jsonSchema);
        }
      }
      return typeof text === "string" && text.trim() ? text.trim() : buildFallbackText();
    },
    errorMessage: (body) => body?.error?.message || body?.message,
  },
};

// Proveedores en el orden configurado que tienen al menos una clave.
const configuredProviders = () =>
  serverConfig.aiProviderOrder
    .map((id) => PROVIDERS[id])
    .filter((provider) => provider && provider.getKeys().length > 0);

const isConfigured = () => configuredProviders().length > 0;

export const invokeAi = async (payload = {}, context = {}) => {
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const responseJsonSchema =
    payload.response_json_schema && typeof payload.response_json_schema === "object"
      ? withStrictJsonSchema(payload.response_json_schema)
      : null;

  if (!prompt) {
    throw new HttpError(400, 'AI payload requires a non-empty "prompt".');
  }

  // Sin ningún proveedor configurado se mantiene el fallback silencioso
  // (contrato del smoke test y del entorno de desarrollo sin claves).
  if (!isConfigured()) {
    return responseJsonSchema
      ? buildFallbackValueFromSchema(responseJsonSchema)
      : buildFallbackText();
  }

  const imageDataUrls = await normalizeInputFileUrls(payload.file_urls, context);
  const needsVision = imageDataUrls.length > 0;
  const maxTokens = Number(payload.max_output_tokens || 2000);

  // Cadena de proveedores a probar: si la petición lleva imagen, se descartan
  // los que no soportan visión (DeepSeek).
  const chain = configuredProviders().filter(
    (provider) => !needsVision || provider.supportsVision
  );

  if (chain.length === 0) {
    // Hay proveedores configurados pero ninguno con visión para un OCR.
    throw new HttpError(503, AI_UNAVAILABLE_MESSAGE);
  }

  let lastError = null;

  for (const provider of chain) {
    const built = provider.build({
      prompt,
      imageDataUrls,
      jsonSchema: responseJsonSchema,
      maxTokens,
      requestedModel: payload.model,
    });

    for (const key of provider.getKeys()) {
      let response;
      try {
        response = await fetch(built.url, {
          method: "POST",
          headers: built.headers(key),
          body: JSON.stringify(built.body),
          signal: AbortSignal.timeout(serverConfig.aiTimeoutMs),
        });
      } catch (networkError) {
        // Red caída o timeout: probar la siguiente clave / proveedor.
        lastError = networkError;
        continue;
      }

      const responseBody = await response.json().catch(() => null);

      if (response.ok) {
        return provider.parse(responseBody, responseJsonSchema);
      }

      lastError = new HttpError(
        response.status,
        provider.errorMessage(responseBody) || `${provider.label} error`,
        responseBody
      );

      // Petición rechazada por este proveedor: sus otras claves fallarían
      // igual, así que se pasa directamente al siguiente proveedor.
      if (isOurRequestError(response.status)) {
        break;
      }
    }
  }

  console.error(
    `[ai-service] Todos los proveedores de IA fallaron (${chain
      .map((provider) => provider.id)
      .join(", ")}).`,
    lastError?.message || lastError
  );
  throw new HttpError(503, AI_UNAVAILABLE_MESSAGE);
};
