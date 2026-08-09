import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Pagination,
  ScrollArea,
  MultiSelect,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconDownload,
  IconRefresh,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { useAuth } from '../auth';
import {
  InfrastructureSelectOption,
} from '../components/InfrastructureSelectOption';
import { useDashboard } from '../hooks/useDashboard';
import {
  getInfrastructureHealth,
  getInfrastructureHealthLabel,
} from '../utils/infrastructureHealth';
import {
  type AuditEvent,
  type AuditResult,
  type AuditSeverity,
  useAuditLog,
  useClearAuditLog,
  useUpdateAuditRetention,
} from '../hooks/useAuditLog';

const PAGE_SIZE = 50;

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'medium',
    },
  ).format(date);
}

function severityColor(
  severity: AuditSeverity,
): string {
  if (severity === 'error') {
    return 'red';
  }

  if (severity === 'warning') {
    return 'yellow';
  }

  return 'blue';
}

function resultColor(
  result: AuditResult,
): string {
  return result === 'success'
    ? 'green'
    : 'red';
}

function prettyDetails(
  details: AuditEvent['details'],
): string {
  if (!details) {
    return 'No additional details.';
  }

  if (typeof details === 'string') {
    return details;
  }

  return JSON.stringify(
    details,
    null,
    2,
  );
}

export function AuditLogPage() {
  const { isAdmin } = useAuth();
  const dashboard = useDashboard();

  const [page, setPage] =
    useState(1);

  const [search, setSearch] =
    useState('');

  const [username, setUsername] =
    useState<string[]>([]);

  const [role, setRole] =
    useState<string[]>([]);

  const [source, setSource] =
    useState<string[]>([]);

  const [action, setAction] =
    useState<string[]>([]);

  const [result, setResult] =
    useState<AuditResult[]>([]);

  const [severity, setSeverity] =
    useState<AuditSeverity[]>([]);

  const [node, setNode] =
    useState<string[]>([]);

  const [
    infrastructureId,
    setInfrastructureId,
  ] = useState<string[]>([]);

  const [targetType, setTargetType] =
    useState<string[]>([]);

  const [dateFrom, setDateFrom] =
    useState('');

  const [dateTo, setDateTo] =
    useState('');

  const [selectedEvent, setSelectedEvent] =
    useState<AuditEvent | null>(null);

  const [exportError, setExportError] =
    useState<string | null>(null);

  const [exportingFormat, setExportingFormat] =
    useState<'csv' | 'json' | null>(null);

  const [
    clearOpened,
    clearModal,
  ] = useDisclosure(false);

  const [
    retentionOpened,
    retentionModal,
  ] = useDisclosure(false);

  const [
    retentionDays,
    setRetentionDays,
  ] = useState<number | string>(90);

  const audit = useAuditLog({
    limit: PAGE_SIZE,
    offset:
      (page - 1) * PAGE_SIZE,
    search:
      search.trim() || null,
    username,
    role,
    source,
    action,
    result,
    severity,
    node,
    infrastructure_id:
      infrastructureId
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value > 0,
        ),
    target_type: targetType,
    date_from:
      dateFrom
        ? new Date(
            `${dateFrom}T00:00:00`,
          ).toISOString()
        : null,
    date_to:
      dateTo
        ? new Date(
            `${dateTo}T23:59:59.999`,
          ).toISOString()
        : null,
  });

  const updateRetention =
    useUpdateAuditRetention();

  const clearAudit =
    useClearAuditLog();

  const pageCount = Math.max(
    1,
    Math.ceil(
      (audit.data?.total ?? 0)
      / PAGE_SIZE,
    ),
  );

  const usernameOptions =
    useMemo(
      () =>
        (
          audit.data?.filters
            .usernames ?? []
        ).map((value) => ({
          value,
          label: value,
        })),
      [
        audit.data?.filters
          .usernames,
      ],
    );

  const roleOptions =
    useMemo(
      () =>
        (
          audit.data?.filters.roles
          ?? []
        ).map((value) => ({
          value,
          label:
            value === 'admin'
              ? 'Administrator'
              : value === 'operator'
                ? 'Operator'
                : value === 'viewer'
                  ? 'Viewer'
                  : value,
        })),
      [
        audit.data?.filters.roles,
      ],
    );

  const sourceOptions =
    useMemo(
      () =>
        (
          audit.data?.filters.sources
          ?? []
        ).map((value) => ({
          value,
          label:
            value === 'local'
              ? 'Local'
              : value === 'ldap'
                ? 'LDAP'
                : value,
        })),
      [
        audit.data?.filters.sources,
      ],
    );

  const actionOptions =
    useMemo(
      () =>
        (
          audit.data?.filters
            .actions ?? []
        ).map((value) => ({
          value,
          label: value,
        })),
      [
        audit.data?.filters.actions,
      ],
    );

  const nodeOptions =
    useMemo(
      () =>
        (
          audit.data?.filters.nodes
          ?? []
        ).map((value) => ({
          value,
          label: value,
        })),
      [
        audit.data?.filters.nodes,
      ],
    );

  const infrastructureOptions =
    useMemo(
      () =>
        (
          audit.data?.infrastructures
          ?? []
        ).map((infrastructure) => {
          const health =
            getInfrastructureHealth(
              (
                dashboard.data?.nodes
                ?? []
              ).filter(
                (node) =>
                  node.infrastructure_id ===
                  infrastructure.id,
              ),
            );

          return {
            value: String(
              infrastructure.id,
            ),
            label:
              `${infrastructure.name} · ${
                infrastructure.type ===
                'cluster'
                  ? 'Cluster'
                  : 'Standalone'
              } · ${
                getInfrastructureHealthLabel(
                  health,
                )
              }`,
            health,
          };
        }),
      [
        audit.data?.infrastructures,
        dashboard.data?.nodes,
      ],
    );

  const targetTypeOptions =
    useMemo(
      () =>
        (
          audit.data?.filters
            .target_types ?? []
        ).map((value) => ({
          value,
          label: value,
        })),
      [
        audit.data?.filters
          .target_types,
      ],
    );

  function resetFilters() {
    setSearch('');
    setUsername([]);
    setRole([]);
    setSource([]);
    setAction([]);
    setResult([]);
    setSeverity([]);
    setNode([]);
    setInfrastructureId([]);
    setTargetType([]);
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  function openRetention() {
    setRetentionDays(
      audit.data?.retention_days
        ?? 90,
    );

    retentionModal.open();
  }

  async function saveRetention() {
    const value =
      typeof retentionDays ===
      'number'
        ? retentionDays
        : Number(retentionDays);

    if (
      !Number.isFinite(value)
      || value < 1
      || value > 3650
    ) {
      return;
    }

    await updateRetention.mutateAsync(
      value,
    );

    retentionModal.close();
  }

  async function deleteAll() {
    await clearAudit.mutateAsync();

    clearModal.close();
    setPage(1);
  }

  async function exportAudit(
    format: 'csv' | 'json',
  ) {
    setExportError(null);
    setExportingFormat(format);

    try {
      const params =
        new URLSearchParams();

      if (search.trim()) {
        params.set(
          'search',
          search.trim(),
        );
      }

      const appendValues = (
        key: string,
        values: string[],
      ) => {
        for (const value of values) {
          params.append(
            key,
            value,
          );
        }
      };

      appendValues(
        'username',
        username,
      );

      appendValues(
        'role',
        role,
      );

      appendValues(
        'source',
        source,
      );

      appendValues(
        'action',
        action,
      );

      appendValues(
        'result',
        result,
      );

      appendValues(
        'severity',
        severity,
      );

      appendValues(
        'node',
        node,
      );

      appendValues(
        'infrastructure_id',
        infrastructureId,
      );

      appendValues(
        'target_type',
        targetType,
      );

      if (dateFrom) {
        params.set(
          'date_from',
          new Date(
            `${dateFrom}T00:00:00`,
          ).toISOString(),
        );
      }

      if (dateTo) {
        params.set(
          'date_to',
          new Date(
            `${dateTo}T23:59:59.999`,
          ).toISOString(),
        );
      }

      const query =
        params.toString();

      const response = await fetch(
        `/api/audit/export/${format}${query ? `?${query}` : ''}`,
        {
          credentials: 'include',
        },
      );

      if (!response.ok) {
        let detail:
          | string
          | undefined;

        try {
          const body = await response.json();

          if (
            body
            && typeof body === 'object'
            && 'detail' in body
            && typeof body.detail === 'string'
          ) {
            detail = body.detail;
          }
        } catch {
          // Response war kein JSON.
        }

        throw new Error(
          detail
          ?? `Export failed with HTTP ${response.status}.`,
        );
      }

      const blob =
        await response.blob();

      const contentDisposition =
        response.headers.get(
          'content-disposition',
        );

      const match =
        contentDisposition?.match(
          /filename="([^"]+)"/,
        );

      const filename =
        match?.[1]
        ?? `proxpilot-audit.${format}`;

      const url =
        window.URL.createObjectURL(
          blob,
        );

      const anchor =
        document.createElement('a');

      anchor.href = url;
      anchor.download = filename;

      document.body.appendChild(
        anchor,
      );

      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(
        url,
      );

      await audit.refetch();
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : 'The audit export could not be created.',
      );
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <Stack gap="lg">
      <Group
        justify="space-between"
        align="flex-start"
      >
        <div>
          <Title order={2}>
            Audit Log
          </Title>

          <Text c="dimmed" mt={4}>
            Administrative and
            operational actions performed
            in ProxPilot.
          </Text>
        </div>

        <Group>
          <Button
            variant="default"
            leftSection={
              <IconRefresh size={16} />
            }
            loading={audit.isFetching}
            onClick={() =>
              void audit.refetch()
            }
          >
            Refresh
          </Button>

          <Button
            variant="light"
            leftSection={
              <IconDownload size={16} />
            }
            loading={
              exportingFormat === 'csv'
            }
            disabled={
              exportingFormat !== null
            }
            onClick={() =>
              void exportAudit('csv')
            }
          >
            CSV
          </Button>

          <Button
            variant="light"
            leftSection={
              <IconDownload size={16} />
            }
            loading={
              exportingFormat === 'json'
            }
            disabled={
              exportingFormat !== null
            }
            onClick={() =>
              void exportAudit('json')
            }
          >
            JSON
          </Button>

          {isAdmin && (
            <>
              <Button
                variant="light"
                onClick={openRetention}
              >
                Retention
              </Button>

              <Button
                color="red"
                variant="light"
                leftSection={
                  <IconTrash size={16} />
                }
                onClick={
                  clearModal.open
                }
              >
                Delete logs
              </Button>
            </>
          )}
        </Group>
      </Group>

      {exportError && (
        <Alert
          color="red"
          icon={
            <IconAlertCircle
              size={18}
            />
          }
          title="Audit export failed"
          withCloseButton
          onClose={() =>
            setExportError(null)
          }
        >
          {exportError}
        </Alert>
      )}

      <SimpleGrid
        cols={{
          base: 1,
          sm: 2,
          lg: 3,
          xl: 6,
        }}
      >
        <Card withBorder radius="lg" p="md">
          <Text size="xs" c="dimmed">
            Entries
          </Text>
          <Text fw={700} size="xl">
            {audit.data?.summary.total ?? 0}
          </Text>
        </Card>

        <Card withBorder radius="lg" p="md">
          <Text size="xs" c="dimmed">
            Retention
          </Text>
          <Text fw={700} size="xl">
            {audit.data?.retention_days ?? 90} days
          </Text>
        </Card>

        <Card withBorder radius="lg" p="md">
          <Text size="xs" c="dimmed">
            Failed
          </Text>
          <Text fw={700} size="xl">
            {audit.data?.summary.failed_count ?? 0}
          </Text>
        </Card>

        <Card withBorder radius="lg" p="md">
          <Text size="xs" c="dimmed">
            Warnings
          </Text>
          <Text fw={700} size="xl">
            {audit.data?.summary.warning_count ?? 0}
          </Text>
        </Card>

        <Card withBorder radius="lg" p="md">
          <Text size="xs" c="dimmed">
            Errors
          </Text>
          <Text fw={700} size="xl">
            {audit.data?.summary.error_count ?? 0}
          </Text>
        </Card>

        <Card withBorder radius="lg" p="md">
          <Text size="xs" c="dimmed">
            Oldest entry
          </Text>
          <Text fw={700} size="sm">
            {audit.data?.summary.oldest_entry
              ? formatDate(
                  audit.data.summary.oldest_entry,
                )
              : '—'}
          </Text>
        </Card>
      </SimpleGrid>

      <Card
        withBorder
        radius="lg"
        p="lg"
      >
        <Stack gap="md">
          <Group
            justify="space-between"
          >
            <Text fw={600}>
              {audit.data?.total ?? 0}
              {' '}
              entries
            </Text>

            <Text
              size="sm"
              c="dimmed"
            >
              Retention:{' '}
              {audit.data
                ?.retention_days ?? 90}
              {' '}
              days
            </Text>
          </Group>

          <TextInput
            leftSection={
              <IconSearch size={16} />
            }
            placeholder="Search user, action, target, node, IP or details"
            value={search}
            onChange={(event) => {
              setSearch(
                event.currentTarget
                  .value,
              );
              setPage(1);
            }}
          />

          <SimpleGrid
            cols={{
              base: 1,
              sm: 2,
              lg: 4,
            }}
          >
            <MultiSelect
              label="User"
              placeholder="All users"
              searchable
              clearable
              value={username}
              data={usernameOptions}
              onChange={(values) => {
                setUsername(values);
                setPage(1);
              }}
            />

            <MultiSelect
              label="Role"
              placeholder="All roles"
              searchable
              clearable
              value={role}
              data={roleOptions}
              onChange={(values) => {
                setRole(values);
                setPage(1);
              }}
            />

            <MultiSelect
              label="Source"
              placeholder="All sources"
              searchable
              clearable
              value={source}
              data={sourceOptions}
              onChange={(values) => {
                setSource(values);
                setPage(1);
              }}
            />

            <MultiSelect
              label="Node"
              placeholder="All nodes"
              searchable
              clearable
              value={node}
              data={nodeOptions}
              onChange={(values) => {
                setNode(values);
                setPage(1);
              }}
            />

            <MultiSelect
              label="Infrastructure"
              placeholder="All infrastructures"
              searchable
              clearable
              value={infrastructureId}
              data={infrastructureOptions}
              renderOption={({ option }) => {
                const infrastructure =
                  infrastructureOptions.find(
                    (item) =>
                      item.value ===
                      option.value,
                  );

                return (
                  <InfrastructureSelectOption
                    label={option.label}
                    health={
                      infrastructure?.health ??
                      'disconnected'
                    }
                  />
                );
              }}
              onChange={(values) => {
                setInfrastructureId(
                  values,
                );
                setPage(1);
              }}
            />

            <MultiSelect
              label="Action"
              placeholder="All actions"
              searchable
              clearable
              value={action}
              data={actionOptions}
              onChange={(values) => {
                setAction(values);
                setPage(1);
              }}
            />

            <MultiSelect
              label="Result"
              placeholder="All results"
              clearable
              value={result}
              data={
                (
                  audit.data?.filters.results
                  ?? []
                ).map((value) => ({
                  value,
                  label:
                    value === 'success'
                      ? 'Success'
                      : value === 'failed'
                        ? 'Failed'
                        : value,
                }))
              }
              onChange={(values) => {
                setResult(
                  values.filter(
                    (
                      value,
                    ): value is AuditResult =>
                      value === 'success'
                      || value === 'failed',
                  ),
                );

                setPage(1);
              }}
            />

            <MultiSelect
              label="Severity"
              placeholder="All severities"
              clearable
              value={severity}
              data={[
                {
                  value: 'info',
                  label: 'Info',
                },
                {
                  value: 'warning',
                  label: 'Warning',
                },
                {
                  value: 'error',
                  label: 'Error',
                },
              ]}
              onChange={(values) => {
                setSeverity(
                  values.filter(
                    (
                      value,
                    ): value is AuditSeverity =>
                      value === 'info'
                      || value === 'warning'
                      || value === 'error',
                  ),
                );

                setPage(1);
              }}
            />

            <MultiSelect
              label="Target type"
              placeholder="All target types"
              searchable
              clearable
              value={targetType}
              data={targetTypeOptions}
              onChange={(values) => {
                setTargetType(values);
                setPage(1);
              }}
            />
          </SimpleGrid>

          <Group grow>
            <TextInput
              label="From"
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(
                  event.currentTarget.value,
                );
                setPage(1);
              }}
            />

            <TextInput
              label="To"
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(
                  event.currentTarget.value,
                );
                setPage(1);
              }}
            />
          </Group>

          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          </Group>
        </Stack>
      </Card>

      {audit.isError && (
        <Alert
          color="red"
          icon={
            <IconAlertCircle
              size={18}
            />
          }
          title="Audit log could not be loaded"
        >
          {audit.error instanceof Error
            ? audit.error.message
            : 'Unknown error'}
        </Alert>
      )}

      <Card
        withBorder
        radius="lg"
        p={0}
      >
        <ScrollArea>
          <Table
            striped
            highlightOnHover
            miw={1250}
            verticalSpacing="sm"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  Time
                </Table.Th>
                <Table.Th>
                  User
                </Table.Th>
                <Table.Th>
                  Role
                </Table.Th>
                <Table.Th>
                  Action
                </Table.Th>
                <Table.Th>
                  Target
                </Table.Th>
                <Table.Th>
                  Node
                </Table.Th>

                <Table.Th>
                  Infrastructure
                </Table.Th>
                <Table.Th>
                  Result
                </Table.Th>
                <Table.Th>
                  Severity
                </Table.Th>
                <Table.Th>
                  IP
                </Table.Th>
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {(audit.data?.events ?? [])
                .map((event) => (
                  <Table.Tr
                    key={event.id}
                    style={{
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      setSelectedEvent(
                        event,
                      )
                    }
                  >
                    <Table.Td>
                      {formatDate(
                        event.created_at,
                      )}
                    </Table.Td>

                    <Table.Td>
                      {event.username
                        ?? '—'}
                    </Table.Td>

                    <Table.Td>
                      {event.role ?? '—'}
                    </Table.Td>

                    <Table.Td>
                      <Text fw={600}>
                        {event.action}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      {event.target
                        ?? '—'}
                    </Table.Td>

                    <Table.Td>
                      {event.node ?? '—'}
                    </Table.Td>

                    <Table.Td>
                      {event.infrastructure_name ? (
                        <Stack gap={2}>
                          <Text fw={600}>
                            {event.infrastructure_name}
                          </Text>

                          <Text
                            size="xs"
                            c="dimmed"
                          >
                            {event.infrastructure_type ===
                            'cluster'
                              ? 'Cluster'
                              : event.infrastructure_type ===
                                  'standalone'
                                ? 'Standalone'
                                : event.infrastructure_id
                                  ? `ID ${event.infrastructure_id}`
                                  : '—'}
                          </Text>
                        </Stack>
                      ) : event.infrastructure_id ? (
                        <Text>
                          ID {event.infrastructure_id}
                        </Text>
                      ) : (
                        <Text c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>

                    <Table.Td>
                      <Badge
                        color={resultColor(
                          event.result,
                        )}
                        variant="light"
                      >
                        {event.result}
                      </Badge>
                    </Table.Td>

                    <Table.Td>
                      <Badge
                        color={severityColor(
                          event.severity,
                        )}
                        variant="light"
                      >
                        {event.severity}
                      </Badge>
                    </Table.Td>

                    <Table.Td>
                      {event.ip_address
                        ?? '—'}
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {(audit.data?.events
          .length ?? 0) === 0
          && !audit.isLoading && (
            <Text
              c="dimmed"
              ta="center"
              py="xl"
            >
              No audit entries found.
            </Text>
          )}
      </Card>

      {pageCount > 1 && (
        <Group justify="center">
          <Pagination
            value={page}
            total={pageCount}
            onChange={setPage}
          />
        </Group>
      )}

      <Modal
        opened={
          selectedEvent !== null
        }
        onClose={() =>
          setSelectedEvent(null)
        }
        title="Audit event details"
        size="lg"
      >
        {selectedEvent && (
          <Stack gap="sm">
            <Text>
              <b>Action:</b>{' '}
              {selectedEvent.action}
            </Text>

            <Text>
              <b>User:</b>{' '}
              {selectedEvent.username
                ?? '—'}
            </Text>

            <Text>
              <b>Role:</b>{' '}
              {selectedEvent.role
                ?? '—'}
            </Text>

            <Text>
              <b>Source:</b>{' '}
              {selectedEvent.source
                ?? '—'}
            </Text>

            <Text>
              <b>IP:</b>{' '}
              {selectedEvent.ip_address
                ?? '—'}
            </Text>

            <Text>
              <b>Target:</b>{' '}
              {selectedEvent.target
                ?? '—'}
            </Text>

            <Text>
              <b>Node:</b>{' '}
              {selectedEvent.node
                ?? '—'}
            </Text>

            <Text>
              <b>Time:</b>{' '}
              {formatDate(
                selectedEvent.created_at,
              )}
            </Text>

            <Text fw={600}>
              Details
            </Text>

            <pre
              style={{
                whiteSpace:
                  'pre-wrap',
                overflowWrap:
                  'anywhere',
                margin: 0,
              }}
            >
              {prettyDetails(
                selectedEvent.details,
              )}
            </pre>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={retentionOpened}
        onClose={
          retentionModal.close
        }
        title="Audit retention"
        centered
      >
        <Stack>
          <NumberInput
            label="Retention days"
            description="Audit entries older than this value are removed automatically."
            min={1}
            max={3650}
            value={retentionDays}
            onChange={
              setRetentionDays
            }
          />

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={
                retentionModal.close
              }
            >
              Cancel
            </Button>

            <Button
              loading={
                updateRetention
                  .isPending
              }
              onClick={() =>
                void saveRetention()
              }
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={clearOpened}
        onClose={clearModal.close}
        title="Delete audit log"
        centered
      >
        <Stack>
          <Alert
            color="red"
            icon={
              <IconAlertCircle
                size={18}
              />
            }
            title="This action cannot be undone"
          >
            All existing audit entries
            will be deleted. The deletion
            itself will be written as a new
            audit entry.
          </Alert>

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={
                clearModal.close
              }
            >
              Cancel
            </Button>

            <Button
              color="red"
              loading={
                clearAudit.isPending
              }
              onClick={() =>
                void deleteAll()
              }
            >
              Delete all logs
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
