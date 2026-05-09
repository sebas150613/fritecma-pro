const loadProviderFactory = async (providerId) => {
  switch (providerId) {
    case "rest": {
      const module = await import("@/api/providers/rest-provider");
      return module.createRestProvider;
    }
    default:
      console.warn(`[api] Unknown provider "${providerId}", falling back to "rest".`);
      return loadProviderFactory("rest");
  }
};

export const createAppProvider = async (providerId = "rest") => {
  const factory = await loadProviderFactory(providerId);
  return factory();
};
