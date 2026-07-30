export function formatBytes(
  bytes?: number | null,
): string {
  if (bytes === undefined || bytes === null) {
    return 'Unknown';
  }

  if (bytes === 0) {
    return '0 B';
  }

  const units = [
    'B',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
    'PiB',
  ];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** index;

  return `${value.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

export function formatUptime(
  seconds?: number,
): string {
  if (!seconds || seconds <= 0) {
    return 'Unknown';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(
    (seconds % 86400) / 3600,
  );
  const minutes = Math.floor(
    (seconds % 3600) / 60,
  );

  if (days > 0) {
    return `${days} days, ${hours} hours`;
  }

  if (hours > 0) {
    return `${hours} hours, ${minutes} minutes`;
  }

  return `${minutes} minutes`;
}

export function formatNumber(
  value?: number | null,
  digits = 2,
): string {
  if (value === undefined || value === null) {
    return 'Unknown';
  }

  return value.toFixed(digits);
}

export function calculatePercentage(
  used?: number | null,
  total?: number | null,
): number {
  if (
    used === undefined ||
    used === null ||
    total === undefined ||
    total === null ||
    total <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (used / total) * 100),
  );
}

export function getUsageColor(
  value: number,
): string {
  if (value >= 90) {
    return 'red';
  }

  if (value >= 75) {
    return 'yellow';
  }

  return 'blue';
}

export function getTemperatureColor(
  value?: number | null,
): string {
  if (value === undefined || value === null) {
    return 'gray';
  }

  if (value >= 85) {
    return 'red';
  }

  if (value >= 70) {
    return 'yellow';
  }

  return 'green';
}
