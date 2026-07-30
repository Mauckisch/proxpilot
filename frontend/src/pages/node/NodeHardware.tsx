import {
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconCpu,
  IconDeviceDesktop,
  IconGauge,
} from '@tabler/icons-react';

import type { HostDetails } from '../../hooks/useHostDetails';
import {
  NodeInfoCard,
  NodeKeyValueTable,
} from './NodeInfoComponents';
import {
  calculatePercentage,
  formatBytes,
  getUsageColor,
} from './format';

export function NodeHardware({
  details,
}: {
  details: HostDetails;
}) {
  const system = details.hardware.system;
  const cpu = details.hardware.cpu;
  const memory = details.hardware.memory;

  const memoryUsage = calculatePercentage(
    memory?.used,
    memory?.total,
  );

  const swapUsage = calculatePercentage(
    memory?.swap_used,
    memory?.swap_total,
  );

  return (
    <Stack gap="lg">
      <SimpleGrid
        cols={{
          base: 1,
          lg: 2,
        }}
      >
        <Paper withBorder radius="md" p="lg">
          <Stack>
            <Group>
              <ThemeIcon variant="light">
                <IconDeviceDesktop size={18} />
              </ThemeIcon>

              <Title order={4}>Platform</Title>
            </Group>

            <NodeKeyValueTable
              values={[
                [
                  'Manufacturer',
                  system?.manufacturer,
                ],
                ['Model', system?.product_name],
                [
                  'Product version',
                  system?.product_version,
                ],
                [
                  'Serial number',
                  system?.product_serial,
                ],
                ['UUID', system?.product_uuid],
                [
                  'Mainboard manufacturer',
                  system?.board_manufacturer,
                ],
                [
                  'Mainboard',
                  system?.board_name,
                ],
                [
                  'Mainboard version',
                  system?.board_version,
                ],
                [
                  'Mainboard serial',
                  system?.board_serial,
                ],
                [
                  'BIOS vendor',
                  system?.bios_vendor,
                ],
                [
                  'BIOS version',
                  system?.bios_version,
                ],
                [
                  'BIOS date',
                  system?.bios_date,
                ],
              ]}
            />
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="lg">
          <Stack>
            <Group>
              <ThemeIcon variant="light">
                <IconCpu size={18} />
              </ThemeIcon>

              <Title order={4}>Processor</Title>
            </Group>

            <NodeKeyValueTable
              values={[
                ['Model', cpu?.model_name],
                ['Vendor', cpu?.vendor],
                [
                  'Architecture',
                  cpu?.architecture,
                ],
                ['Sockets', cpu?.sockets],
                [
                  'Physical cores',
                  cpu?.physical_cores,
                ],
                [
                  'Logical CPUs',
                  cpu?.logical_cpus,
                ],
                [
                  'Cores per socket',
                  cpu?.cores_per_socket,
                ],
                [
                  'Threads per core',
                  cpu?.threads_per_core,
                ],
                ['NUMA nodes', cpu?.numa_nodes],
                [
                  'Minimum frequency',
                  cpu?.minimum_mhz
                    ? `${cpu.minimum_mhz.toFixed(
                        0,
                      )} MHz`
                    : undefined,
                ],
                [
                  'Maximum frequency',
                  cpu?.maximum_mhz
                    ? `${cpu.maximum_mhz.toFixed(
                        0,
                      )} MHz`
                    : undefined,
                ],
                [
                  'Virtualization',
                  cpu?.virtualization,
                ],
              ]}
            />
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="md" p="lg">
        <Stack>
          <Group>
            <ThemeIcon variant="light">
              <IconDeviceDesktop size={18} />
            </ThemeIcon>

            <Title order={4}>Memory</Title>
          </Group>

          <SimpleGrid
            cols={{
              base: 1,
              md: 2,
            }}
          >
            <Stack>
              <Group justify="space-between">
                <Text fw={600}>RAM</Text>

                <Text size="sm">
                  {memoryUsage.toFixed(1)}%
                </Text>
              </Group>

              <Progress
                value={memoryUsage}
                color={getUsageColor(
                  memoryUsage,
                )}
                size="lg"
              />

              <NodeKeyValueTable
                values={[
                  [
                    'Total',
                    formatBytes(memory?.total),
                  ],
                  [
                    'Used',
                    formatBytes(memory?.used),
                  ],
                  [
                    'Available',
                    formatBytes(
                      memory?.available,
                    ),
                  ],
                  [
                    'Free',
                    formatBytes(memory?.free),
                  ],
                  [
                    'Buffers',
                    formatBytes(
                      memory?.buffers,
                    ),
                  ],
                  [
                    'Cached',
                    formatBytes(
                      memory?.cached,
                    ),
                  ],
                ]}
              />
            </Stack>

            <Stack>
              <Group justify="space-between">
                <Text fw={600}>Swap</Text>

                <Text size="sm">
                  {swapUsage.toFixed(1)}%
                </Text>
              </Group>

              <Progress
                value={swapUsage}
                color={getUsageColor(swapUsage)}
                size="lg"
              />

              <NodeKeyValueTable
                values={[
                  [
                    'Swap total',
                    formatBytes(
                      memory?.swap_total,
                    ),
                  ],
                  [
                    'Swap used',
                    formatBytes(
                      memory?.swap_used,
                    ),
                  ],
                  [
                    'Swap free',
                    formatBytes(
                      memory?.swap_free,
                    ),
                  ],
                ]}
              />

              <NodeInfoCard
                label="Memory status"
                value={
                  memoryUsage >= 90
                    ? 'Critical usage'
                    : memoryUsage >= 75
                      ? 'Elevated usage'
                      : 'Normal'
                }
                icon={<IconGauge size={18} />}
              />
            </Stack>
          </SimpleGrid>
        </Stack>
      </Paper>
    </Stack>
  );
}
