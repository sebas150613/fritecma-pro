import {
  clearRuntimeAccessToken,
  getStoredAuthToken,
  runtimeConfig,
  setRuntimeAccessToken,
} from "@/lib/runtime-config";

const buildBaseUrl = () => {
  const baseUrl = runtimeConfig.apiUrl?.trim();
  return baseUrl ? baseUrl.replace(/\/+$/, "") : "";
};

const joinUrl = (baseUrl, path) => {
  if (!baseUrl) {
    return path;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
};

const buildBackendUrl = (path) => {
  const baseUrl = buildBaseUrl();
  return joinUrl(baseUrl, path);
};

const withQuery = (path, params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (contentType.includes("text/")) {
    return response.text();
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? { message: text } : null;
};

const createHttpClient = () => {
  const baseUrl = buildBaseUrl();

  const request = async (path, { method = "GET", body, headers = {} } = {}) => {
    const isMultipartBody = body instanceof FormData;

    const finalHeaders = {
      Accept: "application/json",
      ...headers,
    };

    if (!isMultipartBody) {
      finalHeaders["Content-Type"] = "application/json";
    }

    const authToken = getStoredAuthToken();
    if (authToken) {
      finalHeaders.Authorization = `Bearer ${authToken}`;
    }

    if (runtimeConfig.appId) {
      finalHeaders["X-App-Id"] = runtimeConfig.appId;
    }

    const response = await fetch(joinUrl(baseUrl, path), {
      method,
      headers: finalHeaders,
      credentials: "include",
      body:
        body === undefined || isMultipartBody
          ? body
          : JSON.stringify(body),
    });

    const parsedBody = await parseResponseBody(response);

    if (!response.ok) {
      const error = new Error(
        parsedBody?.message || `Request failed with status ${response.status}`
      );
      error.status = response.status;
      error.data = parsedBody;
      throw error;
    }

    return parsedBody;
  };

  const upload = async (path, filePayload) => {
    const formData = new FormData();

    Object.entries(filePayload || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    return request(path, {
      method: "POST",
      body: formData,
      headers: {},
    });
  };

  return {
    request,
    upload,
  };
};

const createEntityProxy = (http) => {
  const entityCache = new Map();
  const DEFAULT_SUBSCRIBE_POLL_MS = 10000;
  const serializeItems = (items) => JSON.stringify(items || []);

  const createEntityAdapter = (entityName) => ({
    list: (sort, limit) =>
      http.request(
        withQuery(`/api/entities/${entityName}`, {
          sort,
          limit,
        })
      ),
    filter: (where, sort, limit) =>
      http.request(`/api/entities/${entityName}/query`, {
        method: "POST",
        body: {
          filter: where ?? {},
          sort,
          limit,
        },
      }),
    create: (data) =>
      http.request(`/api/entities/${entityName}`, {
        method: "POST",
        body: data,
      }),
    update: (id, data) =>
      http.request(`/api/entities/${entityName}/${id}`, {
        method: "PATCH",
        body: data,
      }),
    delete: (id) =>
      http.request(`/api/entities/${entityName}/${id}`, {
        method: "DELETE",
      }),
    subscribe: (handler) => {
      let active = true;
      let lastSnapshot = null;

      const poll = async () => {
        try {
          const items = await http.request(
            withQuery(`/api/entities/${entityName}`, { limit: 1000 })
          );
          const snapshot = serializeItems(items);

          if (lastSnapshot !== null && snapshot !== lastSnapshot) {
            handler({
              type: "sync",
              entity: entityName,
              items,
            });
          }

          lastSnapshot = snapshot;
        } catch (error) {
          console.warn(
            `[api:rest] subscribe() polling failed for entity "${entityName}".`,
            error
          );
        }
      };

      poll();
      const intervalId = window.setInterval(() => {
        if (!active) {
          return;
        }
        poll();
      }, DEFAULT_SUBSCRIBE_POLL_MS);

      return () => {
        active = false;
        window.clearInterval(intervalId);
        void handler;
      };
    },
  });

  return new Proxy(
    {},
    {
      get: (_, entityName) => {
        if (typeof entityName !== "string") {
          return undefined;
        }

        if (!entityCache.has(entityName)) {
          entityCache.set(entityName, createEntityAdapter(entityName));
        }

        return entityCache.get(entityName);
      },
    }
  );
};

const buildLogoutUrl = (redirectTo) => {
  const configuredLogoutUrl =
    runtimeConfig.logoutUrl?.trim() || buildBackendUrl("/api/auth/logout-page");
  const url = new URL(configuredLogoutUrl, window.location.origin);
  if (redirectTo) {
    const normalizedRedirectTo = /^https?:\/\//i.test(redirectTo)
      ? redirectTo
      : new URL(redirectTo, window.location.origin).toString();
    url.searchParams.set("redirect_uri", normalizedRedirectTo);
  }
  return url.toString();
};

export const createRestProvider = () => {
  const http = createHttpClient();

  const auth = {
    me: () => http.request("/api/auth/me"),
    updateMe: (data) =>
      http.request("/api/auth/me", {
        method: "PATCH",
        body: data,
      }),
    logout: async (redirectTo, options = {}) => {
      const useLogoutPage =
        options?.useLogoutPage === true ||
        (typeof redirectTo === "object" && redirectTo?.useLogoutPage === true);

      const resolvedRedirect =
        typeof redirectTo === "string"
          ? redirectTo
          : typeof redirectTo === "object"
            ? redirectTo?.redirectTo
            : undefined;

      try {
        await http.request("/api/auth/logout", {
          method: "POST",
          body: {},
        });
      } catch (error) {
        if (!error?.status || error.status >= 500) {
          console.warn("[api:rest] logout request failed", error);
        }
      } finally {
        clearRuntimeAccessToken();
      }

      if (
        useLogoutPage &&
        typeof window !== "undefined" &&
        resolvedRedirect !== undefined
      ) {
        window.location.assign(buildLogoutUrl(resolvedRedirect));
      }
    },
    loginWithCredentials: async (email, password, redirectUri) => {
      const baseUrl = buildBaseUrl();
      if (!baseUrl) {
        throw new Error("API base URL is not configured.");
      }

      const resolvedRedirect =
        redirectUri ||
        (typeof window !== "undefined"
          ? `${window.location.origin}/`
          : "http://127.0.0.1:5173/");

      const response = await fetch(joinUrl(baseUrl, "/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(runtimeConfig.appId ? { "X-App-Id": runtimeConfig.appId } : {}),
        },
        body: JSON.stringify({
          email,
          password,
          redirect_uri: resolvedRedirect,
        }),
      });

      const parsedBody = await parseResponseBody(response);

      if (!response.ok) {
        const error = new Error(
          parsedBody?.message || `Login failed (${response.status})`
        );
        error.status = response.status;
        error.data = parsedBody;
        throw error;
      }

      if (parsedBody?.access_token) {
        setRuntimeAccessToken(parsedBody.access_token);
      }

      return parsedBody;
    },
    loginPrivateWithCredentials: async (email, password, redirectUri) => {
      const baseUrl = buildBaseUrl();
      if (!baseUrl) {
        throw new Error("API base URL is not configured.");
      }

      const resolvedRedirect =
        redirectUri ||
        (typeof window !== "undefined"
          ? `${window.location.origin}/`
          : "http://127.0.0.1:5173/");

      const response = await fetch(joinUrl(baseUrl, "/api/auth/private-login"), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(runtimeConfig.appId ? { "X-App-Id": runtimeConfig.appId } : {}),
        },
        body: JSON.stringify({
          email,
          password,
          redirect_uri: resolvedRedirect,
        }),
      });

      const parsedBody = await parseResponseBody(response);

      if (!response.ok) {
        const error = new Error(
          parsedBody?.message || `Login failed (${response.status})`
        );
        error.status = response.status;
        error.data = parsedBody;
        throw error;
      }

      if (parsedBody?.access_token) {
        setRuntimeAccessToken(parsedBody.access_token);
      }

      return parsedBody;
    },
    signupRequestOtp: async ({ organizationName, fullName, email }) => {
      const baseUrl = buildBaseUrl();
      if (!baseUrl) throw new Error("API base URL is not configured.");

      const response = await fetch(joinUrl(baseUrl, "/api/auth/signup/request"), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(runtimeConfig.appId ? { "X-App-Id": runtimeConfig.appId } : {}),
        },
        body: JSON.stringify({
          organization_name: organizationName,
          full_name: fullName,
          email,
        }),
      });

      const parsedBody = await parseResponseBody(response);
      if (!response.ok) {
        const error = new Error(parsedBody?.message || `Request failed (${response.status})`);
        error.status = response.status;
        error.data = parsedBody;
        throw error;
      }
      return parsedBody; // { pending_id }
    },
    signupVerifyOtp: async ({ pendingId, otp, password }) => {
      const baseUrl = buildBaseUrl();
      if (!baseUrl) throw new Error("API base URL is not configured.");

      const response = await fetch(joinUrl(baseUrl, "/api/auth/signup/verify"), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(runtimeConfig.appId ? { "X-App-Id": runtimeConfig.appId } : {}),
        },
        body: JSON.stringify({ pending_id: pendingId, otp, password }),
      });

      const parsedBody = await parseResponseBody(response);
      if (!response.ok) {
        const error = new Error(parsedBody?.message || `Verification failed (${response.status})`);
        error.status = response.status;
        error.data = parsedBody;
        throw error;
      }

      if (parsedBody?.access_token) {
        setRuntimeAccessToken(parsedBody.access_token);
      }
      return parsedBody;
    },
    redirectToLogin: () => {
      if (typeof window === "undefined") {
        return;
      }

      const target = `${window.location.origin}/login`;
      window.location.assign(target);
    },
    setAccessToken: (token) => {
      setRuntimeAccessToken(token);
    },
    switchOrganization: async (organizationId) => {
      const response = await http.request("/api/auth/switch-organization", {
        method: "POST",
        body: {
          organization_id: organizationId,
        },
      });

      if (response?.access_token) {
        setRuntimeAccessToken(response.access_token);
      }

      return response;
    },
  };

  const appApi = {
    auth,
    account: {
      deleteMe: () =>
        http.request("/api/account/me", {
          method: "DELETE",
        }),
    },
    users: {
      invite: (email, role) =>
        http.request("/api/users/invite", {
          method: "POST",
          body: { email, role },
        }),
    },
    organizations: {
      list: () => http.request("/api/organizations"),
      ownerOverview: () => http.request("/api/organizations/owner-overview"),
      current: () => http.request("/api/organizations/current"),
      create: async (payload) => {
        const response = await http.request("/api/organizations", {
          method: "POST",
          body: payload,
        });

        if (response?.access_token) {
          setRuntimeAccessToken(response.access_token);
        }

        return response;
      },
      updateOwnerProfile: (organizationId, payload) =>
        http.request(`/api/organizations/${encodeURIComponent(organizationId)}/owner-profile`, {
          method: "PATCH",
          body: payload,
        }),
      createUser: (organizationId, payload) =>
        http.request(`/api/organizations/${encodeURIComponent(organizationId)}/users`, {
          method: "POST",
          body: payload,
        }),
      deleteUser: (organizationId, userId) =>
        http.request(
          `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(
            userId
          )}`,
          { method: "DELETE" }
        ),
      pauseLicense: (organizationId) =>
        http.request(
          `/api/organizations/${encodeURIComponent(organizationId)}/license/pause`,
          {
            method: "POST",
            body: {},
          }
        ),
      activateLicense: (organizationId) =>
        http.request(
          `/api/organizations/${encodeURIComponent(organizationId)}/license/activate`,
          {
            method: "POST",
            body: {},
          }
        ),
      listPlans: () => http.request("/api/organizations/plans"),
      switch: async (organizationId) => {
        const response = await http.request("/api/organizations/switch", {
          method: "POST",
          body: {
            organization_id: organizationId,
          },
        });

        if (response?.access_token) {
          setRuntimeAccessToken(response.access_token);
        }

        return response;
      },
      hardDeleteOrganization: (organizationId) =>
        http.request(
          `/api/organizations/${encodeURIComponent(organizationId)}/hard-delete`,
          { method: "DELETE" }
        ),
    },
    addressAutocomplete: {
      search: (q) =>
        http.request(
          withQuery("/api/address-autocomplete", {
            q: String(q || "").trim(),
          })
        ),
    },
    entities: createEntityProxy(http),
    files: {
      uploadPublic: (payload) => http.upload("/api/files/public", payload),
      uploadPrivate: (payload) => http.upload("/api/files/private", payload),
      createSignedUrl: (payload) =>
        http.request("/api/files/signed-url", {
          method: "POST",
          body: payload,
        }),
    },
    ai: {
      invoke: (payload) =>
        http.request("/api/ai/invoke", {
          method: "POST",
          body: payload,
        }),
    },
    email: {
      getSettings: () => http.request("/api/email/settings"),
      updateSettings: (payload) =>
        http.request("/api/email/settings", {
          method: "PATCH",
          body: payload,
        }),
      sendTest: (payload = {}) =>
        http.request("/api/email/test", {
          method: "POST",
          body: payload,
        }),
    },
    business: {
      sendInterventionClientEmail: (interventionId) =>
        http.request(
          `/api/business/interventions/${encodeURIComponent(interventionId)}/send-client-email`,
          { method: "POST", body: {} }
        ),
      notifyMaterialRequestApprovers: (requestId) =>
        http.request(
          `/api/business/material-requests/${encodeURIComponent(requestId)}/notify-approvers`,
          { method: "POST", body: {} }
        ),
    },
    functions: {
      invoke: (name, payload) =>
        http.request(`/api/functions/${name}`, {
          method: "POST",
          body: payload,
        }),
    },
    purchaseOrders: {
      list: () => http.request("/api/purchase-orders"),
      send: (payload) =>
        http.request("/api/purchase-orders/send", {
          method: "POST",
          body: payload,
        }),
      updateStatus: (id, payload) =>
        http.request(`/api/purchase-orders/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          body: payload,
        }),
      testSmtp: (payload = {}) =>
        http.request("/api/purchase-orders/test-smtp", {
          method: "POST",
          body: payload,
        }),
    },
    billing: {
      summary: (organizationId) =>
        http.request(
          organizationId
            ? `/api/billing/summary?organization_id=${encodeURIComponent(organizationId)}`
            : "/api/billing/summary"
        ),
      checkout: (payload) =>
        http.request("/api/billing/checkout", {
          method: "POST",
          body: payload,
        }),
      assignPlan: (payload) =>
        http.request("/api/billing/assign-plan", {
          method: "POST",
          body: payload,
        }),
      contactSales: (payload) =>
        http.request("/api/billing/contact-sales", {
          method: "POST",
          body: payload,
        }),
      portal: (payload = {}) =>
        http.request("/api/billing/portal", {
          method: "POST",
          body: payload,
        }),
    },
  };

  return {
    id: "rest",
    rawClient: appApi,
    appApi,
  };
};
