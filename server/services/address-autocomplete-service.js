const MIN_QUERY = 3;
const DEFAULT_COUNTRY = String(process.env.ADDRESS_AUTOCOMPLETE_COUNTRY || "ES").trim() || "ES";

const normalizeItem = (raw) => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const a = raw.address || {};
  const road = [a.road, a.house_number].filter(Boolean).join(" ").trim();
  const line1 = road || raw.display_name?.split(",")[0]?.trim() || "";
  return {
    label: String(raw.display_name || line1 || "").trim(),
    address_line1: line1,
    postal_code: a.postcode || "",
    city: a.city || a.town || a.village || a.municipality || "",
    region: a.state || a.county || "",
    country: a.country || "",
    country_code: (a.country_code || "").toUpperCase() || DEFAULT_COUNTRY,
    provider_place_id: String(raw.place_id ?? raw.osm_id ?? ""),
  };
};

const searchNominatim = async (q) => {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("q", q);
  if (DEFAULT_COUNTRY) {
    url.searchParams.set("countrycodes", DEFAULT_COUNTRY.toLowerCase());
  }

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "FRIGEST/1.0 (address-autocomplete; contact: support via owner panel)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(normalizeItem).filter((x) => x && x.label);
};

const searchGoogleGeocode = async (q, key) => {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", q);
  url.searchParams.set("key", key);
  url.searchParams.set("region", DEFAULT_COUNTRY.toLowerCase());

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    return [];
  }

  const results = data.results || [];
  return results.slice(0, 6).map((r) => {
    const comps = {};
    for (const c of r.address_components || []) {
      for (const t of c.types || []) {
        if (!comps[t]) {
          comps[t] = c.long_name;
        }
        if (!comps[`${t}_short`]) {
          comps[`${t}_short`] = c.short_name;
        }
      }
    }
    const street = [comps.route, comps.street_number].filter(Boolean).join(" ").trim();
    const line1 = street || String(r.formatted_address || "").split(",")[0]?.trim() || "";
    return {
      label: String(r.formatted_address || line1 || "").trim(),
      address_line1: line1,
      postal_code: comps.postal_code || "",
      city:
        comps.locality ||
        comps.postal_town ||
        comps.administrative_area_level_3 ||
        "",
      region: comps.administrative_area_level_2 || comps.administrative_area_level_1 || "",
      country: comps.country || "",
      country_code: String(comps.country_short || DEFAULT_COUNTRY).toUpperCase(),
      provider_place_id: String(r.place_id || ""),
    };
  }).filter((x) => x.label);
};

const searchMapbox = async (q, token) => {
  const encoded = encodeURIComponent(q);
  const country = DEFAULT_COUNTRY.toLowerCase();
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${encodeURIComponent(
    token
  )}&country=${encodeURIComponent(country)}&limit=6`;

  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  const feats = data?.features || [];
  return feats
    .map((f) => {
      const ctx = {};
      for (const c of f.context || []) {
        const id = String(c.id || "");
        if (id.startsWith("postcode.")) {
          ctx.postcode = c.text;
        }
        if (id.startsWith("place.")) {
          ctx.city = c.text;
        }
        if (id.startsWith("region.")) {
          ctx.region = c.text;
        }
        if (id.startsWith("country.")) {
          ctx.country = c.text;
          ctx.country_code = (c.short_code || "").toUpperCase();
        }
      }
      const props = f.properties || {};
      return {
        label: String(f.place_name || f.text || "").trim(),
        address_line1: String(f.text || props.address || "").trim(),
        postal_code: props.postcode || ctx.postcode || "",
        city: ctx.city || "",
        region: ctx.region || "",
        country: ctx.country || "",
        country_code: ctx.country_code || DEFAULT_COUNTRY,
        provider_place_id: String(f.id || ""),
      };
    })
    .filter((x) => x.label);
};

const searchLocationIQ = async (q, token) => {
  const url = new URL("https://us1.locationiq.com/v1/autocomplete");
  url.searchParams.set("key", token);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", DEFAULT_COUNTRY.toLowerCase());
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("normalizecity", "1");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", Referer: "https://app.frigest.es" },
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(normalizeItem).filter((x) => x && x.label);
};

/**
 * @param {string} query
 * @returns {Promise<Array<{ label, address_line1, postal_code, city, region, country, country_code, provider_place_id }>>}
 */
export const searchAddressSuggestions = async (query) => {
  const q = String(query || "").trim();
  if (q.length < MIN_QUERY) {
    return [];
  }

  const provider = String(process.env.ADDRESS_AUTOCOMPLETE_PROVIDER || "")
    .trim()
    .toLowerCase();
  const apiKey = String(process.env.ADDRESS_AUTOCOMPLETE_API_KEY || "").trim();

  if (!provider) {
    return [];
  }

  try {
    if (provider === "locationiq") {
      const token = String(process.env.LOCATIONIQ_TOKEN || "").trim();
      if (!token) {
        return [];
      }
      return await searchLocationIQ(q, token);
    }
    if (provider === "mapbox") {
      if (!apiKey) {
        return [];
      }
      return await searchMapbox(q, apiKey);
    }
    if (provider === "google") {
      if (!apiKey) {
        return [];
      }
      return await searchGoogleGeocode(q, apiKey);
    }
    if (provider === "nominatim") {
      return await searchNominatim(q);
    }
    return [];
  } catch {
    return [];
  }
};
