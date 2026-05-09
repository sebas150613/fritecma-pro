import { MapPin } from "lucide-react";

/**
 * Renders a clickable address that opens Google Maps.
 * Pass `address` as a full text string, or `lat` + `lng` for coordinates.
 */
export default function MapLink({
  address,
  lat = null,
  lng = null,
  className = "",
}) {
  if (!address && lat == null) {
    return null;
  }

  const buildUrl = () => {
    if (lat != null && lng != null) {
      return `https://maps.google.com/?q=${lat},${lng}`;
    }

    return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
  };

  return (
    <a
      href={buildUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline transition-colors ${className}`}
      title="Abrir en Google Maps"
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" />
      <span className="truncate">
        {address || `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`}
      </span>
    </a>
  );
}
