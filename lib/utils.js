export function formatDistanceToNow(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function estimateTokens(text) {
  if (!text) return 0;
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
