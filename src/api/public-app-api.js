import { getStoredAuthToken, runtimeConfig } from "@/lib/runtime-config";

const buildPublicApiUrl = (path) => {
  const baseUrl =
    runtimeConfig.backendProvider === "rest" && runtimeConfig.apiUrl
      ? runtimeConfig.apiUrl.replace(/\/+$/, "")
      : "";

  return baseUrl ? `${baseUrl}${path}` : path;
};

const buildHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
    "X-App-Id": runtimeConfig.appId,
  };

  const authToken = getStoredAuthToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
};

export const publicAppApi = {
  async getPublicSettings(appId = runtimeConfig.appId) {
    const response = await fetch(
      buildPublicApiUrl(`/api/apps/public/prod/public-settings/by-id/${appId}`),
      {
        method: "GET",
        headers: buildHeaders(),
      }
    );

    const body = await parseResponseBody(response);

    if (!response.ok) {
      throw Object.assign(
        new Error(
          body?.message || `Failed to load app public settings (${response.status})`
        ),
        {
          status: response.status,
          data: body,
        }
      );
    }

    return body;
  },
};
