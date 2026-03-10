export const formatTimestamp = (value) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
};

export const normalizeStatus = (value) =>
  value === "published" || value === "unlisted" || value === "draft"
    ? value
    : "published";
