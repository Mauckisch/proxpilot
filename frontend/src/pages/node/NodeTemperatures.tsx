import {
  Alert,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';

import {
  IconAlertCircle,
  IconTemperature,
} from '@tabler/icons-react';

import type { HostDetails } from '../../hooks/useHostDetails';

function getColor(temp?: number) {
  if (temp === undefined || temp === null) {
    return 'gray';
  }

  if (temp >= 85) {
    return 'red';
  }

  if (temp >= 70) {
    return 'yellow';
  }

  return 'green';
}

export function NodeTemperatures({
  details,
}: {
  details: HostDetails;
}) {
  if (!details.temperatures.available) {
    return (
      <Alert
        color="yellow"
        icon={<IconAlertCircle size={18} />}
        title="No sensors found"
      >
        This node does not expose any readable
        hardware temperature sensors.
      </Alert>
    );
  }

  return (
    <SimpleGrid
      cols={{
        base: 1,
        sm: 2,
        xl: 3,
      }}
    >
      {details.temperatures.sensors.map(
        (sensor, index) => (
          <Card
            key={`${sensor.chip}-${sensor.label}-${index}`}
            withBorder
            radius="md"
          >
            <Stack>
              <Group justify="space-between">
                <Group>
                  <ThemeIcon
                    variant="light"
                    color={getColor(
                      sensor.temperature_celsius,
                    )}
                  >
                    <IconTemperature size={20} />
                  </ThemeIcon>

                  <div>
                    <Title order={5}>
                      {sensor.label}
                    </Title>

                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      {sensor.chip}
                    </Text>
                  </div>
                </Group>

                <Text
                  fw={700}
                  size="xl"
                  c={getColor(
                    sensor.temperature_celsius,
                  )}
                >
                  {sensor.temperature_celsius?.toFixed(
                    1,
                  )}{' '}
                  °C
                </Text>
              </Group>

              <Text
                size="xs"
                c="dimmed"
              >
                Source: {sensor.source}
              </Text>
            </Stack>
          </Card>
        ),
      )}
    </SimpleGrid>
  );
}
