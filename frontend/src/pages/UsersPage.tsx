import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconEdit,
  IconKey,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';

import { useAuth } from '../auth';
import {
  type ProxPilotUser,
  type UserRole,
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUpdateUserPassword,
  useUsers,
} from '../hooks/useUsers';

function formatDate(value: string | null): string {
  if (!value) {
    return 'Never';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getErrorMessage(
  error: unknown,
  fallback = 'The operation could not be completed.',
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

    return response?.data?.detail ?? fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function UsersPage() {
  const { user: authenticatedUser } = useAuth();

  const users = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const updatePassword = useUpdateUserPassword();
  const deleteUser = useDeleteUser();

  const [createOpened, createModal] =
    useDisclosure(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] =
    useState<UserRole>('viewer');
  const [createError, setCreateError] =
    useState<string | null>(null);

  const [editUser, setEditUser] =
    useState<ProxPilotUser | null>(null);
  const [editUsername, setEditUsername] =
    useState('');
  const [editRole, setEditRole] =
    useState<UserRole>('viewer');
  const [editEnabled, setEditEnabled] =
    useState(true);
  const [editError, setEditError] =
    useState<string | null>(null);

  const [passwordUser, setPasswordUser] =
    useState<ProxPilotUser | null>(null);
  const [newPassword, setNewPassword] =
    useState('');
  const [passwordError, setPasswordError] =
    useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] =
    useState<ProxPilotUser | null>(null);
  const [deleteError, setDeleteError] =
    useState<string | null>(null);

  const enabledAdminCount =
    users.data?.filter(
      (user) =>
        user.role === 'admin' &&
        user.enabled,
    ).length ?? 0;

  function isCurrentUser(
    user: ProxPilotUser,
  ): boolean {
    return (
      user.username ===
      authenticatedUser.username
    );
  }

  function isLastEnabledAdmin(
    user: ProxPilotUser,
  ): boolean {
    return (
      user.role === 'admin' &&
      user.enabled &&
      enabledAdminCount <= 1
    );
  }

  function resetCreateForm() {
    setUsername('');
    setPassword('');
    setRole('viewer');
    setCreateError(null);
  }

  function closeCreateModal() {
    if (createUser.isPending) {
      return;
    }

    resetCreateForm();
    createModal.close();
  }

  async function submitUser() {
    if (!username.trim()) {
      setCreateError(
        'Please enter a username.',
      );
      return;
    }

    if (password.length < 8) {
      setCreateError(
        'The password must contain at least 8 characters.',
      );
      return;
    }

    setCreateError(null);

    try {
      await createUser.mutateAsync({
        username: username.trim(),
        password,
        role,
      });

      resetCreateForm();
      createModal.close();
    } catch (requestError) {
      setCreateError(
        getErrorMessage(
          requestError,
          'User could not be created.',
        ),
      );
    }
  }

  function openEditDialog(
    user: ProxPilotUser,
  ) {
    setEditUser(user);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditEnabled(user.enabled);
    setEditError(null);
  }

  function closeEditDialog() {
    if (updateUser.isPending) {
      return;
    }

    setEditUser(null);
    setEditUsername('');
    setEditRole('viewer');
    setEditEnabled(true);
    setEditError(null);
  }

  async function submitEdit() {
    if (!editUser) {
      return;
    }

    if (!editUsername.trim()) {
      setEditError(
        'Please enter a username.',
      );
      return;
    }

    setEditError(null);

    try {
      await updateUser.mutateAsync({
        userId: editUser.id,
        username: editUsername.trim(),
        role: editRole,
        enabled: editEnabled,
      });

      closeEditDialog();
    } catch (requestError) {
      setEditError(
        getErrorMessage(
          requestError,
          'User could not be updated.',
        ),
      );
    }
  }

  function openPasswordDialog(
    user: ProxPilotUser,
  ) {
    setPasswordUser(user);
    setNewPassword('');
    setPasswordError(null);
  }

  function closePasswordDialog() {
    if (updatePassword.isPending) {
      return;
    }

    setPasswordUser(null);
    setNewPassword('');
    setPasswordError(null);
  }

  async function submitPassword() {
    if (!passwordUser) {
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(
        'The password must contain at least 8 characters.',
      );
      return;
    }

    setPasswordError(null);

    try {
      await updatePassword.mutateAsync({
        userId: passwordUser.id,
        password: newPassword,
      });

      closePasswordDialog();
    } catch (requestError) {
      setPasswordError(
        getErrorMessage(
          requestError,
          'Password could not be changed.',
        ),
      );
    }
  }

  function openDeleteDialog(
    user: ProxPilotUser,
  ) {
    setDeleteTarget(user);
    setDeleteError(null);
  }

  function closeDeleteDialog() {
    if (deleteUser.isPending) {
      return;
    }

    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleteError(null);

    try {
      await deleteUser.mutateAsync(
        deleteTarget.id,
      );

      closeDeleteDialog();
    } catch (requestError) {
      setDeleteError(
        getErrorMessage(
          requestError,
          'User could not be deleted.',
        ),
      );
    }
  }

  const editingCurrentUser =
    editUser !== null &&
    isCurrentUser(editUser);

  const editingLastAdmin =
    editUser !== null &&
    isLastEnabledAdmin(editUser);

  return (
    <Stack gap="lg">
      <Group
        justify="space-between"
        align="flex-start"
      >
        <div>
          <Title order={2}>Users</Title>

          <Text c="dimmed" mt={4}>
            Manage ProxPilot users and their
            permissions.
          </Text>
        </div>

        <Button
          leftSection={<IconPlus size={17} />}
          onClick={() => {
            resetCreateForm();
            createModal.open();
          }}
        >
          Add user
        </Button>
      </Group>

      <Card withBorder radius="lg" p="lg">
        {users.isLoading && (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        )}

        {users.isError && (
          <Alert
            color="red"
            icon={
              <IconAlertCircle size={18} />
            }
            title="Users could not be loaded"
          >
            {users.error instanceof Error
              ? users.error.message
              : 'Unknown error'}
          </Alert>
        )}

        {!users.isLoading &&
          !users.isError &&
          users.data?.length === 0 && (
            <Text c="dimmed">
              No users are configured.
            </Text>
          )}

        {!users.isLoading &&
          !users.isError &&
          users.data &&
          users.data.length > 0 && (
            <Table.ScrollContainer
              minWidth={920}
            >
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>
                      Username
                    </Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Source</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>
                      Last login
                    </Table.Th>
                    <Table.Th w={250}>
                      Actions
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {users.data.map((user) => {
                    const current =
                      isCurrentUser(user);

                    const lastAdmin =
                      isLastEnabledAdmin(user);

                    const deleteDisabled =
                      current || lastAdmin;

                    return (
                      <Table.Tr key={user.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <Text fw={600}>
                              {user.username}
                            </Text>

                            {current && (
                              <Badge
                                size="xs"
                                variant="light"
                                color="blue"
                              >
                                You
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>

                        <Table.Td>
                          <Badge
                            color={
                              user.role === 'admin'
                                ? 'blue'
                                : user.role === 'operator'
                                  ? 'violet'
                                  : 'gray'
                            }
                            variant="light"
                          >
                            {user.role === 'admin'
                              ? 'Administrator'
                              : user.role === 'operator'
                                ? 'Operator'
                                : 'Viewer'}
                          </Badge>
                        </Table.Td>

                        <Table.Td>
                          <Badge
                            variant="outline"
                          >
                            {user.source ===
                            'local'
                              ? 'Local'
                              : 'LDAP'}
                          </Badge>
                        </Table.Td>

                        <Table.Td>
                          <Badge
                            color={
                              user.enabled
                                ? 'green'
                                : 'red'
                            }
                            variant="light"
                          >
                            {user.enabled
                              ? 'Enabled'
                              : 'Disabled'}
                          </Badge>
                        </Table.Td>

                        <Table.Td>
                          {formatDate(
                            user.created_at,
                          )}
                        </Table.Td>

                        <Table.Td>
                          {formatDate(
                            user.last_login,
                          )}
                        </Table.Td>

                        <Table.Td>
                          <Group
                            gap="xs"
                            wrap="nowrap"
                          >
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={
                                <IconEdit
                                  size={14}
                                />
                              }
                              onClick={() =>
                                openEditDialog(
                                  user,
                                )
                              }
                            >
                              Edit
                            </Button>

                            {user.source ===
                              'local' && (
                              <Button
                                size="xs"
                                variant="light"
                                color="grape"
                                leftSection={
                                  <IconKey
                                    size={14}
                                  />
                                }
                                onClick={() =>
                                  openPasswordDialog(
                                    user,
                                  )
                                }
                              >
                                Password
                              </Button>
                            )}

                            <Tooltip
                              label={
                                current
                                  ? 'You cannot delete your own account.'
                                  : lastAdmin
                                    ? 'The last enabled administrator cannot be deleted.'
                                    : 'Delete user'
                              }
                              disabled={
                                !deleteDisabled
                              }
                              withArrow
                            >
                              <span
                                style={{
                                  display:
                                    'inline-flex',
                                }}
                              >
                                <Button
                                  size="xs"
                                  variant="light"
                                  color="red"
                                  disabled={
                                    deleteDisabled
                                  }
                                  leftSection={
                                    <IconTrash
                                      size={14}
                                    />
                                  }
                                  onClick={() =>
                                    openDeleteDialog(
                                      user,
                                    )
                                  }
                                >
                                  Delete
                                </Button>
                              </span>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
      </Card>

      <Modal
        opened={editUser !== null}
        onClose={closeEditDialog}
        title={
          editUser
            ? `Edit user — ${editUser.username}`
            : 'Edit user'
        }
        centered
      >
        <Stack gap="md">
          {editError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle size={18} />
              }
              title="User could not be updated"
            >
              {editError}
            </Alert>
          )}

          <TextInput
            label="Username"
            value={editUsername}
            disabled={
              updateUser.isPending ||
              editUser?.source === 'ldap'
            }
            description={
              editUser?.source === 'ldap'
                ? 'LDAP usernames are managed by the directory.'
                : undefined
            }
            onChange={(event) =>
              setEditUsername(
                event.currentTarget.value,
              )
            }
          />

          <Select
            label="Role"
            value={editRole}
            disabled={
              updateUser.isPending ||
              editingCurrentUser ||
              editingLastAdmin
            }
            description={
              editingCurrentUser
                ? 'You cannot change your own role.'
                : editingLastAdmin
                  ? 'The last enabled administrator must retain the administrator role.'
                  : undefined
            }
            data={[
              {
                label: 'Viewer',
                value: 'viewer',
              },
              {
                label: 'Operator',
                value: 'operator',
              },
              {
                label: 'Administrator',
                value: 'admin',
              },
            ]}
            onChange={(value) =>
              setEditRole(
                value === 'admin'
                  ? 'admin'
                  : value === 'operator'
                    ? 'operator'
                    : 'viewer',
              )
            }
          />

          <Checkbox
            label="Enabled"
            checked={editEnabled}
            disabled={
              updateUser.isPending ||
              editingCurrentUser ||
              editingLastAdmin
            }
            description={
              editingCurrentUser
                ? 'You cannot disable your own account.'
                : editingLastAdmin
                  ? 'The last enabled administrator cannot be disabled.'
                  : 'Disabled users cannot sign in.'
            }
            onChange={(event) =>
              setEditEnabled(
                event.currentTarget.checked,
              )
            }
          />

          {editUser && (
            <Stack gap={3}>
              <Text size="xs" c="dimmed">
                Source
              </Text>

              <Text size="sm">
                {editUser.source === 'local'
                  ? 'Local'
                  : 'LDAP'}
              </Text>

              <Text
                size="xs"
                c="dimmed"
                mt="xs"
              >
                Created
              </Text>

              <Text size="sm">
                {formatDate(
                  editUser.created_at,
                )}
              </Text>

              <Text
                size="xs"
                c="dimmed"
                mt="xs"
              >
                Last login
              </Text>

              <Text size="sm">
                {formatDate(
                  editUser.last_login,
                )}
              </Text>
            </Stack>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={updateUser.isPending}
              onClick={closeEditDialog}
            >
              Cancel
            </Button>

            <Button
              loading={updateUser.isPending}
              disabled={
                !editUser ||
                !editUsername.trim()
              }
              onClick={() =>
                void submitEdit()
              }
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={passwordUser !== null}
        onClose={closePasswordDialog}
        title={
          passwordUser
            ? `Change password — ${passwordUser.username}`
            : 'Change password'
        }
        centered
      >
        <Stack gap="md">
          {passwordError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle size={18} />
              }
              title="Password could not be changed"
            >
              {passwordError}
            </Alert>
          )}

          <PasswordInput
            label="New password"
            description="At least 8 characters"
            placeholder="New password"
            value={newPassword}
            disabled={
              updatePassword.isPending
            }
            onChange={(event) =>
              setNewPassword(
                event.currentTarget.value,
              )
            }
          />

          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={
                updatePassword.isPending
              }
              onClick={
                closePasswordDialog
              }
            >
              Cancel
            </Button>

            <Button
              loading={
                updatePassword.isPending
              }
              disabled={
                !passwordUser ||
                newPassword.length < 8
              }
              onClick={() =>
                void submitPassword()
              }
            >
              Change password
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteTarget !== null}
        onClose={closeDeleteDialog}
        title="Delete user"
        centered
      >
        <Stack gap="md">
          {deleteError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle size={18} />
              }
              title="User could not be deleted"
            >
              {deleteError}
            </Alert>
          )}

          <Alert
            color="red"
            icon={
              <IconAlertCircle size={18} />
            }
            title="This action cannot be undone"
          >
            The user account will be
            permanently removed from
            ProxPilot.
          </Alert>

          <Text>
            Delete user{' '}
            <Text span fw={700}>
              {deleteTarget?.username}
            </Text>
            ?
          </Text>

          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={deleteUser.isPending}
              onClick={closeDeleteDialog}
            >
              Cancel
            </Button>

            <Button
              color="red"
              loading={deleteUser.isPending}
              leftSection={
                <IconTrash size={16} />
              }
              onClick={() =>
                void confirmDelete()
              }
            >
              Delete user
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={createOpened}
        onClose={closeCreateModal}
        title="Add local user"
        centered
      >
        <Stack gap="md">
          {createError && (
            <Alert
              color="red"
              icon={
                <IconAlertCircle size={18} />
              }
              title="User could not be created"
            >
              {createError}
            </Alert>
          )}

          <TextInput
            label="Username"
            placeholder="Username"
            value={username}
            disabled={createUser.isPending}
            onChange={(event) =>
              setUsername(
                event.currentTarget.value,
              )
            }
          />

          <PasswordInput
            label="Password"
            description="At least 8 characters"
            placeholder="Password"
            value={password}
            disabled={createUser.isPending}
            onChange={(event) =>
              setPassword(
                event.currentTarget.value,
              )
            }
          />

          <Select
            label="Role"
            value={role}
            disabled={createUser.isPending}
            data={[
              {
                label: 'Viewer',
                value: 'viewer',
              },
              {
                label: 'Operator',
                value: 'operator',
              },
              {
                label: 'Administrator',
                value: 'admin',
              },
            ]}
            onChange={(value) =>
              setRole(
                value === 'admin'
                  ? 'admin'
                  : value === 'operator'
                    ? 'operator'
                    : 'viewer',
              )
            }
          />

          <Group
            justify="flex-end"
            mt="sm"
          >
            <Button
              variant="default"
              disabled={createUser.isPending}
              onClick={closeCreateModal}
            >
              Cancel
            </Button>

            <Button
              loading={createUser.isPending}
              onClick={() =>
                void submitUser()
              }
            >
              Create user
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
