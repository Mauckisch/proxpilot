import { Group, Image, Stack, Text } from '@mantine/core';

type ProxPilotBrandProps = {
  compact?: boolean;
};

export function ProxPilotBrand({
  compact = false,
}: ProxPilotBrandProps) {
  if (compact) {
    return (
      <Image
        src="/branding/proxpilot-icon.svg"
        alt="ProxPilot"
        w={38}
        h={38}
        fit="contain"
      />
    );
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <Image
        src="/branding/proxpilot-icon.svg"
        alt="ProxPilot"
        w={40}
        h={40}
        fit="contain"
      />

      <Stack gap={0}>
        <Text fw={700} size="lg" lh={1.1}>
          Prox
          <Text
            component="span"
            inherit
            c="blue.5"
          >
            Pilot
          </Text>
        </Text>

        <Text size="xs" c="dimmed" lh={1.2}>
          Proxmox Homelab Control
        </Text>
      </Stack>
    </Group>
  );
}
