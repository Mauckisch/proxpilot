import {
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Image,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconBrandGithub,
  IconCode,
  IconExternalLink,
  IconScale,
  IconServer,
} from '@tabler/icons-react';

type AboutDialogProps = {
  opened: boolean;
  onClose: () => void;
};

type InformationItemProps = {
  icon: typeof IconCode;
  label: string;
  value: string;
};

function InformationItem({
  icon: Icon,
  label,
  value,
}: InformationItemProps) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon
          variant="light"
          color="blue"
          radius="md"
          size="lg"
        >
          <Icon size={19} stroke={1.8} />
        </ThemeIcon>

        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>

          <Text fw={600} size="sm">
            {value}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export function AboutDialog({
  opened,
  onClose,
}: AboutDialogProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="ProxPilot"
      centered
      size="lg"
      radius="lg"
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3,
      }}
    >
      <Stack gap="lg">
        <Group
          justify="center"
          align="center"
          wrap="nowrap"
          gap="lg"
        >
          <Image
            src="/branding/proxpilot-icon.svg"
            alt="ProxPilot"
            w={92}
            h={92}
            fit="contain"
          />

          <Stack gap={4}>
            <Title order={2}>
              Prox
              <Text
                component="span"
                inherit
                c="blue.5"
              >
                Pilot
              </Text>
            </Title>

            <Badge
              variant="light"
              color="blue"
              size="lg"
              w="fit-content"
            >
              Version {__APP_VERSION__}
            </Badge>

            <Text c="dimmed" size="sm">
              Modern dashboard for Proxmox VE clusters.
            </Text>
          </Stack>
        </Group>

        <Divider />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <InformationItem
            icon={IconCode}
            label="Frontend"
            value="React + Mantine"
          />

          <InformationItem
            icon={IconServer}
            label="Backend"
            value="FastAPI"
          />

          <InformationItem
            icon={IconScale}
            label="License"
            value="MIT"
          />

          <InformationItem
            icon={IconBrandGithub}
            label="Project"
            value="ProxPilot"
          />
        </SimpleGrid>

        <Paper withBorder radius="md" p="md">
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Copyright
            </Text>

            <Text fw={600} size="sm">
              © 2026 Dennis Mauckisch
            </Text>
          </Stack>
        </Paper>

        <Divider />

        <Group justify="space-between">
          <Anchor
            href="https://github.com/dennigma/proxpilot"
            target="_blank"
            rel="noreferrer"
            underline="never"
          >
            <Button
              variant="light"
              leftSection={<IconBrandGithub size={18} />}
              rightSection={<IconExternalLink size={15} />}
            >
              GitHub
            </Button>
          </Anchor>

          <Button onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
