import { runtimeConfig } from "@/lib/runtime-config";
import { createAppProvider } from "@/api/providers";

const providerId = runtimeConfig.backendProvider || "rest";

let providerPromise = null;

const loadProvider = () => {
  if (!providerPromise) {
    providerPromise = createAppProvider(providerId);
  }

  return providerPromise;
};

const withProviderMethod = (selector) => {
  return (...args) =>
    loadProvider().then((provider) => {
      const method = selector(provider);

      if (typeof method !== "function") {
        throw new Error("Requested provider method is not available.");
      }

      return method(...args);
    });
};

const createLazyEntityProxy = () => {
  const entityCache = new Map();

  const createEntityAdapter = (entityName) => ({
    list: withProviderMethod((provider) => provider.appApi.entities[entityName]?.list),
    filter: withProviderMethod((provider) => provider.appApi.entities[entityName]?.filter),
    create: withProviderMethod((provider) => provider.appApi.entities[entityName]?.create),
    update: withProviderMethod((provider) => provider.appApi.entities[entityName]?.update),
    delete: withProviderMethod((provider) => provider.appApi.entities[entityName]?.delete),
    subscribe: (handler) => {
      let active = true;
      let unsubscribe = () => {};

      loadProvider()
        .then((provider) => {
          if (!active) {
            return;
          }

          const subscribeMethod = provider.appApi.entities[entityName]?.subscribe;

          if (typeof subscribeMethod !== "function") {
            throw new Error(
              `Subscribe is not available for entity "${entityName}".`
            );
          }

          unsubscribe = subscribeMethod(handler);
        })
        .catch((error) => {
          console.error(
            `[api] Failed to initialize subscription for entity "${entityName}".`,
            error
          );
        });

      return () => {
        active = false;
        unsubscribe();
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

export const activeApiProvider = providerId;

export const appApi = {
  auth: {
    me: withProviderMethod((provider) => provider.appApi.auth?.me),
    logout: withProviderMethod((provider) => provider.appApi.auth?.logout),
    redirectToLogin: withProviderMethod(
      (provider) => provider.appApi.auth?.redirectToLogin
    ),
    updateMe: withProviderMethod((provider) => provider.appApi.auth?.updateMe),
    setAccessToken: withProviderMethod(
      (provider) => provider.appApi.auth?.setAccessToken
    ),
    switchOrganization: withProviderMethod(
      (provider) => provider.appApi.auth?.switchOrganization
    ),
  },
  account: {
    deleteMe: withProviderMethod((provider) => provider.appApi.account?.deleteMe),
  },
  users: {
    invite: withProviderMethod((provider) => provider.appApi.users?.invite),
  },
  organizations: {
    list: withProviderMethod((provider) => provider.appApi.organizations?.list),
    ownerOverview: withProviderMethod(
      (provider) => provider.appApi.organizations?.ownerOverview
    ),
    current: withProviderMethod((provider) => provider.appApi.organizations?.current),
    create: withProviderMethod((provider) => provider.appApi.organizations?.create),
    createUser: withProviderMethod(
      (provider) => provider.appApi.organizations?.createUser
    ),
    deleteUser: withProviderMethod(
      (provider) => provider.appApi.organizations?.deleteUser
    ),
    pauseLicense: withProviderMethod(
      (provider) => provider.appApi.organizations?.pauseLicense
    ),
    activateLicense: withProviderMethod(
      (provider) => provider.appApi.organizations?.activateLicense
    ),
    listPlans: withProviderMethod(
      (provider) => provider.appApi.organizations?.listPlans
    ),
    switch: withProviderMethod((provider) => provider.appApi.organizations?.switch),
    hardDeleteOrganization: withProviderMethod(
      (provider) => provider.appApi.organizations?.hardDeleteOrganization
    ),
  },
  entities: createLazyEntityProxy(),
  files: {
    uploadPublic: withProviderMethod(
      (provider) => provider.appApi.files?.uploadPublic
    ),
    uploadPrivate: withProviderMethod(
      (provider) => provider.appApi.files?.uploadPrivate
    ),
    createSignedUrl: withProviderMethod(
      (provider) => provider.appApi.files?.createSignedUrl
    ),
  },
  ai: {
    invoke: withProviderMethod((provider) => provider.appApi.ai?.invoke),
  },
  email: {
    getSettings: withProviderMethod((provider) => provider.appApi.email?.getSettings),
    updateSettings: withProviderMethod(
      (provider) => provider.appApi.email?.updateSettings
    ),
    sendTest: withProviderMethod((provider) => provider.appApi.email?.sendTest),
  },
  business: {
    sendInterventionClientEmail: withProviderMethod(
      (provider) => provider.appApi.business?.sendInterventionClientEmail
    ),
    notifyMaterialRequestApprovers: withProviderMethod(
      (provider) => provider.appApi.business?.notifyMaterialRequestApprovers
    ),
  },
  functions: {
    invoke: withProviderMethod((provider) => provider.appApi.functions?.invoke),
  },
  billing: {
    summary: withProviderMethod((provider) => provider.appApi.billing?.summary),
    checkout: withProviderMethod((provider) => provider.appApi.billing?.checkout),
    assignPlan: withProviderMethod((provider) => provider.appApi.billing?.assignPlan),
    contactSales: withProviderMethod(
      (provider) => provider.appApi.billing?.contactSales
    ),
    portal: withProviderMethod((provider) => provider.appApi.billing?.portal),
  },
};

export const apiClient = appApi;
