import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  PasswordInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconBuilding,
  IconCheck,
  IconCloudNetwork,
  IconCopy,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconServer,
  IconTrash,
} from '@tabler/icons-react';
import {
  useEffect,
  useState,
} from 'react';

import { api } from '../api';
import { useAuth } from '../auth';


type InfrastructureNode = {
  id?: number;
  infrastructure_id?: number;
  node_name: string;
  host: string | null;
  enabled?: boolean;
  status?: string | null;
  cpu?: number | null;
  maxcpu?: number | null;
  mem?: number | null;
  maxmem?: number | null;
  uptime?: number | null;
};


type Infrastructure = {
  id: number;
  uuid: string;
  name: string;
  type: 'cluster' | 'standalone';
  description?: string | null;
  enabled: boolean;
  api_endpoints: string[];
  api_token_id: string;
  verify_ssl: boolean;
  ssh_user: string;
  ssh_key: string;
  ssh_port: number;
  proxmox_cluster_name?: string | null;
  nodes: InfrastructureNode[];
};


type InfrastructureListResponse = {
  infrastructures: Infrastructure[];
};


type DiscoveryResult = {
  ok: boolean;
  endpoint: string;
  type: 'cluster' | 'standalone';
  cluster_name?: string | null;
  suggested_name: string;
  version?: {
    version?: string;
    release?: string;
    repoid?: string;
  } | null;
  nodes: InfrastructureNode[];
  storages: Array<{
    storage?: string | null;
    node?: string | null;
    plugintype?: string | null;
    content?: string | null;
    status?: string | null;
  }>;
};


function extractErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
          };
        };
      }
    ).response;

    if (
      typeof response?.data?.detail ===
      'string'
    ) {
      return response.data.detail;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}


export function InfrastructureSettingsCard() {
  const {
    isAdmin,
  } = useAuth();

  const [
    infrastructures,
    setInfrastructures,
  ] = useState<Infrastructure[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState<string | null>(null);

  const [
    modalOpened,
    modal,
  ] = useDisclosure(false);

  const [
    endpoint,
    setEndpoint,
  ] = useState('');

  const [
    tokenId,
    setTokenId,
  ] = useState('');

  const [
    tokenSecret,
    setTokenSecret,
  ] = useState('');

  const [
    verifySsl,
    setVerifySsl,
  ] = useState(false);

  const [
    name,
    setName,
  ] = useState('');

  const [
    description,
    setDescription,
  ] = useState('');

  const [
    sshUser,
    setSshUser,
  ] = useState('root');

  const [
    sshPort,
    setSshPort,
  ] = useState('22');

  const [
    sshPublicKey,
    setSshPublicKey,
  ] = useState('');

  const [
    sshPublicKeyLoading,
    setSshPublicKeyLoading,
  ] = useState(false);

  const [
    sshPublicKeyError,
    setSshPublicKeyError,
  ] = useState<string | null>(null);

  const [
    sshPublicKeyCopied,
    setSshPublicKeyCopied,
  ] = useState(false);

  const [
    discovery,
    setDiscovery,
  ] = useState<DiscoveryResult | null>(
    null,
  );

  const [
    discovering,
    setDiscovering,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    formError,
    setFormError,
  ] = useState<string | null>(
    null,
  );

  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(
    null,
  );

  const [
    renameOpened,
    renameModal,
  ] = useDisclosure(false);

  const [
    renameInfrastructure,
    setRenameInfrastructure,
  ] = useState<Infrastructure | null>(
    null,
  );

  const [
    renameValue,
    setRenameValue,
  ] = useState('');

  const [
    renameError,
    setRenameError,
  ] = useState<string | null>(
    null,
  );

  const [
    renaming,
    setRenaming,
  ] = useState(false);


  async function loadInfrastructures() {
    setLoading(true);
    setLoadError(null);

    try {
      const response =
        await api.get<InfrastructureListResponse>(
          '/infrastructures',
        );

      setInfrastructures(
        response.data.infrastructures ??
          [],
      );
    } catch (error) {
      setLoadError(
        extractErrorMessage(
          error,
          'Infrastructure list could not be loaded.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void loadInfrastructures();
  }, []);


  async function loadSshPublicKey() {
    setSshPublicKeyLoading(true);
    setSshPublicKeyError(null);

    try {
      const response =
        await api.get<{
          algorithm: string;
          public_key: string;
          private_key_path: string;
        }>(
          '/ssh/public-key',
        );

      setSshPublicKey(
        response.data.public_key ?? '',
      );
    } catch (error) {
      setSshPublicKey('');

      setSshPublicKeyError(
        extractErrorMessage(
          error,
          'ProxPilot SSH public key could not be loaded.',
        ),
      );
    } finally {
      setSshPublicKeyLoading(false);
    }
  }


  function resetForm() {
    setEndpoint('');
    setTokenId('');
    setTokenSecret('');
    setVerifySsl(false);
    setName('');
    setDescription('');
    setSshUser('root');
    setSshPort('22');
    setSshPublicKeyError(null);
    setSshPublicKeyCopied(false);
    setDiscovery(null);
    setFormError(null);
  }


  function openCreateModal() {
    resetForm();
    modal.open();
    void loadSshPublicKey();
  }


  async function discover() {
    setFormError(null);
    setDiscovery(null);

    if (!endpoint.trim()) {
      setFormError(
        'Enter a Proxmox API endpoint.',
      );
      return;
    }

    if (!tokenId.trim()) {
      setFormError(
        'Enter the API token ID.',
      );
      return;
    }

    if (!tokenSecret.trim()) {
      setFormError(
        'Enter the API token secret.',
      );
      return;
    }

    setDiscovering(true);

    try {
      const response =
        await api.post<DiscoveryResult>(
          '/infrastructures/discover',
          {
            endpoint:
              endpoint.trim(),
            token_id:
              tokenId.trim(),
            token_secret:
              tokenSecret,
            verify_ssl:
              verifySsl,
          },
        );

      const result =
        response.data;

      setDiscovery(result);

      setName(
        result.suggested_name ??
          '',
      );
    } catch (error) {
      setFormError(
        extractErrorMessage(
          error,
          'Infrastructure discovery failed.',
        ),
      );
    } finally {
      setDiscovering(false);
    }
  }


  function updateNodeHost(
    index: number,
    host: string,
  ) {
    setDiscovery((current) => {
      if (!current) {
        return current;
      }

      const nodes = [
        ...current.nodes,
      ];

      nodes[index] = {
        ...nodes[index],
        host,
      };

      return {
        ...current,
        nodes,
      };
    });
  }


  function openRename(
    infrastructure: Infrastructure,
  ) {
    setRenameInfrastructure(
      infrastructure,
    );

    setRenameValue(
      infrastructure.name,
    );

    setRenameError(null);

    renameModal.open();
  }


  async function saveRename() {
    if (!renameInfrastructure) {
      return;
    }

    const cleanName =
      renameValue.trim();

    if (!cleanName) {
      setRenameError(
        'Enter an infrastructure name.',
      );
      return;
    }

    setRenaming(true);
    setRenameError(null);

    try {
      await api.put(
        `/infrastructures/${renameInfrastructure.id}`,
        {
          name: cleanName,
          description:
            renameInfrastructure.description ??
            null,
          enabled:
            renameInfrastructure.enabled,
          verify_ssl:
            renameInfrastructure.verify_ssl,
          ssh_user:
            renameInfrastructure.ssh_user,
          ssh_key:
            renameInfrastructure.ssh_key,
          ssh_port:
            renameInfrastructure.ssh_port,
        },
      );

      renameModal.close();
      setRenameInfrastructure(null);
      setRenameValue('');

      await loadInfrastructures();
    } catch (error) {
      setRenameError(
        extractErrorMessage(
          error,
          'Infrastructure could not be renamed.',
        ),
      );
    } finally {
      setRenaming(false);
    }
  }


  async function deleteInfrastructure(
    infrastructure: Infrastructure,
  ) {
    const confirmed =
      window.confirm(
        (
          `Delete infrastructure ` +
          `"${infrastructure.name}"?\n\n` +
          `This removes it from ProxPilot only. ` +
          `The Proxmox system itself will not be modified.`
        ),
      );

    if (!confirmed) {
      return;
    }

    const operationId =
      `infrastructure-${infrastructure.id}`;

    setDeletingId(operationId);
    setLoadError(null);

    try {
      await api.delete(
        `/infrastructures/${infrastructure.id}`,
      );

      await loadInfrastructures();
    } catch (error) {
      setLoadError(
        extractErrorMessage(
          error,
          'Infrastructure could not be deleted.',
        ),
      );
    } finally {
      setDeletingId(null);
    }
  }


  async function deleteNode(
    infrastructure: Infrastructure,
    node: InfrastructureNode,
  ) {
    if (!node.id) {
      setLoadError(
        'The selected node has no database ID.',
      );
      return;
    }

    const confirmed =
      window.confirm(
        (
          `Remove node "${node.node_name}" ` +
          `from "${infrastructure.name}"?\n\n` +
          `This removes the node from ProxPilot only. ` +
          `The Proxmox node itself will not be modified.`
        ),
      );

    if (!confirmed) {
      return;
    }

    const operationId =
      `node-${node.id}`;

    setDeletingId(operationId);
    setLoadError(null);

    try {
      await api.delete(
        (
          `/infrastructures/${infrastructure.id}` +
          `/nodes/${node.id}`
        ),
      );

      await loadInfrastructures();
    } catch (error) {
      setLoadError(
        extractErrorMessage(
          error,
          'Node could not be removed.',
        ),
      );
    } finally {
      setDeletingId(null);
    }
  }


  async function saveInfrastructure() {
    setFormError(null);

    if (!discovery) {
      setFormError(
        'Run discovery before saving.',
      );
      return;
    }

    if (!name.trim()) {
      setFormError(
        'Enter an infrastructure name.',
      );
      return;
    }

    const parsedSshPort =
      Number(sshPort);

    if (
      !Number.isInteger(
        parsedSshPort,
      ) ||
      parsedSshPort < 1 ||
      parsedSshPort > 65535
    ) {
      setFormError(
        'Enter a valid SSH port.',
      );
      return;
    }

    const incompleteNode =
      discovery.nodes.find(
        (node) =>
          !node.host?.trim(),
      );

    if (incompleteNode) {
      setFormError(
        `Enter a reachable host for node "${incompleteNode.node_name}".`,
      );
      return;
    }

    setSaving(true);

    try {
      await api.post(
        '/infrastructures',
        {
          name: name.trim(),
          type: discovery.type,
          description:
            description.trim() ||
            null,
          enabled: true,
          api_endpoints: [
            discovery.endpoint,
          ],
          api_token_id:
            tokenId.trim(),
          api_token_secret:
            tokenSecret,
          verify_ssl:
            verifySsl,
          ssh_user:
            sshUser.trim() ||
            'root',
          ssh_key:
            '/app/ssh/id_ed25519',
          ssh_port:
            parsedSshPort,
          proxmox_cluster_name:
            discovery.cluster_name ??
            null,
          nodes:
            discovery.nodes.map(
              (node) => ({
                node_name:
                  node.node_name,
                host:
                  node.host?.trim() ??
                  '',
              }),
            ),
        },
      );

      modal.close();
      resetForm();

      await loadInfrastructures();
    } catch (error) {
      setFormError(
        extractErrorMessage(
          error,
          'Infrastructure could not be saved.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }


  return (
    <>
      <Card
        withBorder
        radius="lg"
        p="lg"
      >
        <Stack gap="lg">
          <Group
            justify="space-between"
            align="flex-start"
          >
            <Group>
              <ThemeIcon
                variant="light"
                size="lg"
              >
                <IconCloudNetwork
                  size={20}
                />
              </ThemeIcon>

              <div>
                <Text fw={600}>
                  Infrastructure
                </Text>

                <Text
                  size="sm"
                  c="dimmed"
                >
                  Manage Proxmox clusters
                  and standalone hosts
                </Text>
              </div>
            </Group>

            {isAdmin && (
              <Button
                leftSection={
                  <IconPlus size={16} />
                }
                onClick={
                  openCreateModal
                }
              >
                Add Infrastructure
              </Button>
            )}
          </Group>

          <Divider />

          {loadError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle
                  size={18}
                />
              }
              title="Unable to load infrastructure"
            >
              {loadError}
            </Alert>
          )}

          {!loadError &&
            loading && (
              <Text c="dimmed">
                Loading infrastructure...
              </Text>
            )}

          {!loading &&
            !loadError &&
            infrastructures.length ===
              0 && (
              <Text c="dimmed">
                No Proxmox infrastructure
                has been configured yet.
              </Text>
            )}

          {!loading &&
            !loadError &&
            infrastructures.length >
              0 && (
              <SimpleGrid
                cols={{
                  base: 1,
                  xl: 2,
                }}
              >
                {infrastructures.map(
                  (item) => (
                    <Card
                      key={item.id}
                      withBorder
                      radius="md"
                      p="md"
                    >
                      <Stack gap="sm">
                        <Group
                          justify="space-between"
                          align="flex-start"
                        >
                          <Group>
                            <ThemeIcon
                              variant="light"
                              color={
                                item.type ===
                                'cluster'
                                  ? 'blue'
                                  : 'grape'
                              }
                            >
                              {item.type ===
                              'cluster' ? (
                                <IconBuilding
                                  size={
                                    17
                                  }
                                />
                              ) : (
                                <IconServer
                                  size={
                                    17
                                  }
                                />
                              )}
                            </ThemeIcon>

                            <div>
                              <Text
                                fw={600}
                              >
                                {
                                  item.name
                                }
                              </Text>

                              <Text
                                size="xs"
                                c="dimmed"
                              >
                                {item.type ===
                                'cluster'
                                  ? `${item.nodes.length} node cluster`
                                  : 'Standalone host'}
                              </Text>
                            </div>
                          </Group>

                          <Badge
                            color={
                              item.enabled
                                ? 'green'
                                : 'gray'
                            }
                            variant="light"
                          >
                            {item.enabled
                              ? 'Enabled'
                              : 'Disabled'}
                          </Badge>
                        </Group>

                        <Divider />

                        <Group
                          gap="xs"
                          wrap="wrap"
                        >
                          <Badge
                            variant="outline"
                          >
                            {item.type ===
                            'cluster'
                              ? 'Cluster'
                              : 'Standalone'}
                          </Badge>

                          {item
                            .proxmox_cluster_name && (
                            <Badge
                              variant="outline"
                              color="blue"
                            >
                              {
                                item.proxmox_cluster_name
                              }
                            </Badge>
                          )}
                        </Group>

                        <Stack gap={4}>
                          {item.nodes.map(
                            (node) => (
                              <Group
                                key={
                                  node.id ??
                                  `${item.id}-${node.node_name}`
                                }
                                justify="space-between"
                                wrap="nowrap"
                              >
                                <div>
                                  <Text
                                    size="sm"
                                  >
                                    {
                                      node.node_name
                                    }
                                  </Text>

                                  <Text
                                    size="xs"
                                    c="dimmed"
                                  >
                                    {
                                      node.host
                                    }
                                  </Text>
                                </div>

                                {isAdmin &&
                                  item.type ===
                                    'cluster' && (
                                  <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="red"
                                    leftSection={
                                      <IconTrash
                                        size={
                                          13
                                        }
                                      />
                                    }
                                    loading={
                                      deletingId ===
                                      `node-${node.id}`
                                    }
                                    onClick={() =>
                                      void deleteNode(
                                        item,
                                        node,
                                      )
                                    }
                                  >
                                    Remove
                                  </Button>
                                )}
                              </Group>
                            ),
                          )}
                        </Stack>

                        <Text
                          size="xs"
                          c="dimmed"
                        >
                          API:{' '}
                          {item
                            .api_endpoints[0] ??
                            '—'}
                        </Text>

                        {isAdmin && (
                          <>
                            <Divider />

                            <Group
                              justify="flex-end"
                            >
                              <Button
                                size="xs"
                                variant="subtle"
                                leftSection={
                                  <IconEdit
                                    size={14}
                                  />
                                }
                                onClick={() =>
                                  openRename(
                                    item,
                                  )
                                }
                              >
                                Rename
                              </Button>

                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                leftSection={
                                  <IconTrash
                                    size={14}
                                  />
                                }
                                loading={
                                  deletingId ===
                                  `infrastructure-${item.id}`
                                }
                                onClick={() =>
                                  void deleteInfrastructure(
                                    item,
                                  )
                                }
                              >
                                Delete Infrastructure
                              </Button>
                            </Group>
                          </>
                        )}
                      </Stack>
                    </Card>
                  ),
                )}
              </SimpleGrid>
            )}
        </Stack>
      </Card>

      {isAdmin && (
        <Modal
          opened={renameOpened}
        onClose={() => {
          renameModal.close();
          setRenameInfrastructure(null);
          setRenameValue('');
          setRenameError(null);
        }}
        title="Rename Infrastructure"
        size="md"
      >
        <Stack>
          {renameError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle
                  size={18}
                />
              }
            >
              {renameError}
            </Alert>
          )}

          <TextInput
            label="Infrastructure name"
            description="This is the display name used throughout ProxPilot. It does not change the Proxmox cluster or node name."
            required
            value={renameValue}
            onChange={(event) =>
              setRenameValue(
                event.currentTarget
                  .value,
              )
            }
          />

          <Group
            justify="flex-end"
            mt="sm"
          >
            <Button
              variant="default"
              onClick={() => {
                renameModal.close();
                setRenameInfrastructure(
                  null,
                );
                setRenameValue('');
                setRenameError(null);
              }}
            >
              Cancel
            </Button>

            <Button
              loading={renaming}
              onClick={() =>
                void saveRename()
              }
            >
              Save
            </Button>
          </Group>
        </Stack>
        </Modal>
      )}

      {isAdmin && (
        <Modal
          opened={modalOpened}
        onClose={() => {
          modal.close();
          resetForm();
        }}
        title="Add Infrastructure"
        size="xl"
      >
        <Stack gap="lg">
          {formError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle
                  size={18}
                />
              }
            >
              {formError}
            </Alert>
          )}

          <div>
            <Title order={5}>
              Proxmox API
            </Title>

            <Text
              size="sm"
              c="dimmed"
              mt={4}
            >
              Enter one reachable
              Proxmox endpoint. ProxPilot
              will detect whether it is a
              cluster or a standalone
              host.
            </Text>
          </div>

          <TextInput
            label="API endpoint"
            placeholder="https://192.168.1.10:8006"
            required
            value={endpoint}
            onChange={(event) =>
              setEndpoint(
                event.currentTarget
                  .value,
              )
            }
          />

          <SimpleGrid
            cols={{
              base: 1,
              sm: 2,
            }}
          >
            <TextInput
              label="Token ID"
              placeholder="dashboard@pve!dashboard"
              required
              value={tokenId}
              onChange={(event) =>
                setTokenId(
                  event.currentTarget
                    .value,
                )
              }
            />

            <PasswordInput
              label="Token secret"
              required
              value={tokenSecret}
              onChange={(event) =>
                setTokenSecret(
                  event.currentTarget
                    .value,
                )
              }
            />
          </SimpleGrid>

          <Switch
            checked={verifySsl}
            onChange={(event) =>
              setVerifySsl(
                event.currentTarget
                  .checked,
              )
            }
            label="Verify TLS certificate"
            description="Enable this when the Proxmox API certificate is trusted by the backend container."
          />

          <Button
            variant="light"
            leftSection={
              <IconRefresh size={16} />
            }
            loading={discovering}
            onClick={() =>
              void discover()
            }
          >
            Test & Discover
          </Button>

          {discovery && (
            <>
              <Divider />

              <Alert
                color="green"
                icon={
                  <IconCheck
                    size={18}
                  />
                }
                title="Infrastructure detected"
              >
                Proxmox API authentication
                succeeded.
              </Alert>

              <SimpleGrid
                cols={{
                  base: 1,
                  sm: 3,
                }}
              >
                <Card
                  withBorder
                  radius="md"
                  p="md"
                >
                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Type
                  </Text>

                  <Text
                    fw={600}
                    mt={4}
                  >
                    {discovery.type ===
                    'cluster'
                      ? 'Cluster'
                      : 'Standalone'}
                  </Text>
                </Card>

                <Card
                  withBorder
                  radius="md"
                  p="md"
                >
                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Cluster name
                  </Text>

                  <Text
                    fw={600}
                    mt={4}
                  >
                    {discovery
                      .cluster_name ??
                      '—'}
                  </Text>
                </Card>

                <Card
                  withBorder
                  radius="md"
                  p="md"
                >
                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Nodes
                  </Text>

                  <Text
                    fw={600}
                    mt={4}
                  >
                    {
                      discovery.nodes
                        .length
                    }
                  </Text>
                </Card>
              </SimpleGrid>

              <TextInput
                label="Infrastructure name"
                required
                value={name}
                onChange={(event) =>
                  setName(
                    event.currentTarget
                      .value,
                  )
                }
              />

              <TextInput
                label="Description"
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.currentTarget
                      .value,
                  )
                }
              />

              <div>
                <Title order={5}>
                  Nodes
                </Title>

                <Text
                  size="sm"
                  c="dimmed"
                  mt={4}
                >
                  Confirm the address that
                  ProxPilot should use for
                  API and SSH access to each
                  node.
                </Text>
              </div>

              <Stack gap="sm">
                {discovery.nodes.map(
                  (node, index) => (
                    <Card
                      key={
                        node.node_name
                      }
                      withBorder
                      radius="md"
                      p="md"
                    >
                      <Group
                        align="flex-end"
                        grow
                      >
                        <TextInput
                          label="Node"
                          value={
                            node.node_name
                          }
                          readOnly
                        />

                        <TextInput
                          label="Reachable host / IP"
                          required
                          value={
                            node.host ??
                            ''
                          }
                          onChange={(
                            event,
                          ) =>
                            updateNodeHost(
                              index,
                              event
                                .currentTarget
                                .value,
                            )
                          }
                        />
                      </Group>
                    </Card>
                  ),
                )}
              </Stack>

              <Divider />

              <div>
                <Title order={5}>
                  SSH
                </Title>

                <Text
                  size="sm"
                  c="dimmed"
                  mt={4}
                >
                  Host-level functions use
                  SSH in addition to the
                  Proxmox API.
                </Text>
              </div>

              <SimpleGrid
                cols={{
                  base: 1,
                  sm: 2,
                }}
              >
                <TextInput
                  label="SSH user"
                  value={sshUser}
                  onChange={(event) =>
                    setSshUser(
                      event
                        .currentTarget
                        .value,
                    )
                  }
                />

                <TextInput
                  label="SSH port"
                  value={sshPort}
                  onChange={(event) =>
                    setSshPort(
                      event
                        .currentTarget
                        .value,
                    )
                  }
                />
              </SimpleGrid>

              <Stack gap="xs">
                <Text
                  size="sm"
                  fw={500}
                >
                  ProxPilot SSH setup command
                </Text>

                <Text
                  size="xs"
                  c="dimmed"
                >
                  Copy and run this command as the
                  configured SSH user on every Proxmox
                  node managed by this infrastructure.
                  The command creates the SSH directory
                  if necessary and adds the ProxPilot
                  public key only when it is not already
                  present.
                </Text>

                {sshPublicKeyError ? (
                  <Alert
                    color="red"
                    icon={
                      <IconAlertCircle
                        size={18}
                      />
                    }
                  >
                    {sshPublicKeyError}
                  </Alert>
                ) : (
                  <Group
                    align="flex-end"
                    wrap="nowrap"
                  >
                    <TextInput
                      value={
                        sshPublicKey
                          ? [
                              'mkdir -p ~/.ssh',
                              'chmod 700 ~/.ssh',
                              'touch ~/.ssh/authorized_keys',
                              (
                                "grep -qxF '"
                                + sshPublicKey.replace(
                                  /'/g,
                                  "'\\\"'\\\"'",
                                )
                                + "' ~/.ssh/authorized_keys"
                                + " || printf '%s\\n' '"
                                + sshPublicKey.replace(
                                  /'/g,
                                  "'\\\"'\\\"'",
                                )
                                + "' >> ~/.ssh/authorized_keys"
                              ),
                              'chmod 600 ~/.ssh/authorized_keys',
                            ].join(' && ')
                          : ''
                      }
                      readOnly
                      style={{
                        flex: 1,
                      }}
                      placeholder={
                        sshPublicKeyLoading
                          ? 'Loading SSH setup command...'
                          : 'SSH setup command unavailable'
                      }
                    />

                    <Button
                      variant="light"
                      leftSection={
                        sshPublicKeyCopied
                          ? (
                            <IconCheck
                              size={16}
                            />
                          )
                          : (
                            <IconCopy
                              size={16}
                            />
                          )
                      }
                      disabled={
                        !sshPublicKey ||
                        sshPublicKeyLoading
                      }
                      onClick={() => {
                        if (!sshPublicKey) {
                          return;
                        }

                        const escapedKey =
                          sshPublicKey.replace(
                            /'/g,
                            "'\\\"'\\\"'",
                          );

                        const setupCommand = [
                          'mkdir -p ~/.ssh',
                          'chmod 700 ~/.ssh',
                          'touch ~/.ssh/authorized_keys',
                          (
                            "grep -qxF '"
                            + escapedKey
                            + "' ~/.ssh/authorized_keys"
                            + " || printf '%s\\n' '"
                            + escapedKey
                            + "' >> ~/.ssh/authorized_keys"
                          ),
                          'chmod 600 ~/.ssh/authorized_keys',
                        ].join(' && ');

                        void navigator.clipboard
                          .writeText(
                            setupCommand,
                          )
                          .then(() => {
                            setSshPublicKeyCopied(
                              true,
                            );

                            window.setTimeout(
                              () =>
                                setSshPublicKeyCopied(
                                  false,
                                ),
                              2000,
                            );
                          });
                      }}
                    >
                      {sshPublicKeyCopied
                        ? 'Copied'
                        : 'Copy command'}
                    </Button>
                  </Group>
                )}
              </Stack>

              <Group
                justify="flex-end"
                mt="sm"
              >
                <Button
                  variant="default"
                  onClick={() => {
                    modal.close();
                    resetForm();
                  }}
                >
                  Cancel
                </Button>

                <Button
                  loading={saving}
                  onClick={() =>
                    void saveInfrastructure()
                  }
                >
                  Save Infrastructure
                </Button>
              </Group>
            </>
          )}
        </Stack>
        </Modal>
      )}
    </>
  );
}
