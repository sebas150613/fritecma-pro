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

const resolveModel = ({ requestedModel, hasVisionInput }) => {
  if (isOpenAiModelName(requestedModel)) {
    return requestedModel.trim();
  }

  return hasVisionInput ? serverConfig.aiVisionModel : serverConfig.aiModel;
};

const isConfigured = () =>
  serverConfig.aiProvider === "openai" && serverConfig.aiApiKeys.length > 0;

const buildFallbackText = () =>
  "La IA del backend REST no esta configurada todavia. Define OPENAI_API_KEY para activar respuestas reales.";

// Mensaje único que ve el usuario cuando la IA no responde con ninguna clave.
const AI_UNAVAILABLE_MESSAGE =
  "El servicio con IA no está disponible en estos momentos. Inténtelo de nuevo más tarde.";

// Un 400/404/422 es un problema de NUESTRA petición (schema, imagen no
// soportada, etc.): reintentar con otra clave daría el mismo error, así que se
// propaga tal cual. Cualquier otro fallo (401/403 clave inválida, 429 sin
// saldo o rate-limit, 5xx, red/timeout) es específico de la clave o transitorio
// y justifica probar la siguiente clave.
const isOurRequestError = (status) =>
  status === 400 || status === 404 || status === 422;

export const invokeAi = async (payload = {}, context = {}) => {
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const responseJsonSchema =
    payload.response_json_schema && typeof payload.response_json_schema === "object"
      ? withStrictJsonSchema(payload.response_json_schema)
      : null;

  if (!prompt) {
    throw new HttpError(400, 'AI payload requires a non-empty "prompt".');
  }

  if (!isConfigured()) {
    return responseJsonSchema
      ? buildFallbackValueFromSchema(responseJsonSchema)
      : buildFallbackText();
  }

  const fileUrls = await normalizeInputFileUrls(payload.file_urls, context);
  const model = resolveModel({
    requestedModel: payload.model,
    hasVisionInput: fileUrls.length > 0,
  });

  const requestBody = {
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...fileUrls.map((fileUrl) => ({
            type: "input_image",
            image_url: fileUrl,
          })),
        ],
      },
    ],
    max_output_tokens: Number(payload.max_output_tokens || 2000),
    text: responseJsonSchema
      ? {
          format: {
            type: "json_schema",
            name: "frigest_structured_response",
            strict: true,
            schema: responseJsonSchema,
          },
        }
      : undefined,
  };

  // Conmutación por error entre claves: se prueban en orden y se salta a la
  // siguiente ante fallos de clave o transitorios. Si ninguna responde, se
  // devuelve un 503 con un mensaje único para el usuario.
  const keys = serverConfig.aiApiKeys;
  let lastError = null;

  for (let index = 0; index < keys.length; index += 1) {
    let response;
    try {
      response = await fetch(`${serverConfig.aiBaseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keys[index]}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(serverConfig.aiTimeoutMs),
      });
    } catch (networkError) {
      // Red caída o timeout: intentar con la siguiente clave.
      lastError = networkError;
      continue;
    }

    const responseBody = await response.json().catch(() => null);

    if (response.ok) {
      return responseJsonSchema
        ? extractStructuredResponse(responseBody, responseJsonSchema)
        : extractResponseText(responseBody) || buildFallbackText();
    }

    // Error de nuestra petición: reintentar con otra clave no ayudaría.
    if (isOurRequestError(response.status)) {
      throw new HttpError(
        response.status,
        responseBody?.error?.message ||
          responseBody?.message ||
          "The AI provider rejected the request.",
        responseBody
      );
    }

    // Fallo específico de la clave (401/403/429) o del proveedor (5xx):
    // registrar y probar la siguiente clave disponible.
    lastError = new HttpError(
      response.status,
      responseBody?.error?.message || responseBody?.message || "AI provider error",
      responseBody
    );
  }

  console.error(
    `[ai-service] Todas las claves de IA fallaron (${keys.length}).`,
    lastError?.message || lastError
  );
  throw new HttpError(503, AI_UNAVAILABLE_MESSAGE);
};
