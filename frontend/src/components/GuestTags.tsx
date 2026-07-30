import {
  Badge,
  Group,
} from '@mantine/core';

type GuestTagsProps = {
  tags?: string;
};

export function GuestTags({
  tags,
}: GuestTagsProps) {
  if (!tags) {
    return null;
  }

  const values = tags
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  return (
    <Group gap={6}>
      {values.map((tag) => (
        <Badge
          key={tag}
          size="sm"
          variant="dot"
          color="gray"
        >
          {tag}
        </Badge>
      ))}
    </Group>
  );
}
