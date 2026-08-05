import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowsMaximize,
  IconKeyboard,
  IconLogout,
  IconRefresh,
} from '@tabler/icons-react';
import RFB from '@novnc/novnc';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { api } from '../api';

type ConsoleTicketResponse = {
  ok: boolean;
  node: string;
  vmid: number;
  console_id: string;
  websocket_path: string;
  vnc_password: string;
  expires_in: number;
};

type ConsoleStatus =
  | 'preparing'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

function getErrorMessage(error: unknown): string {
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

    return (
      response?.data?.detail ??
      'The console could not be opened.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'The console could not be opened.';
}

function buildWebSocketUrl(path: string): string {
  const scheme =
    window.location.protocol === 'https:'
      ? 'wss:'
      : 'ws:';

  return `${scheme}//${window.location.host}${path}`;
}

export function ConsolePage() {
  const screenRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<RFB | null>(null);

  const parameters = new URLSearchParams(
    window.location.search,
  );

  const node = parameters.get('node')?.trim() ?? '';
  const vmid = Number(parameters.get('vmid'));
  const guestName =
    parameters.get('name')?.trim() ||
    (Number.isInteger(vmid)
      ? `VM ${vmid}`
      : 'Virtual machine');

  const [status, setStatus] =
    useState<ConsoleStatus>('preparing');

  const [error, setError] =
    useState<string | null>(null);

  const [scaleViewport, setScaleViewport] =
    useState(true);

  const [resizeSession, setResizeSession] =
    useState(false);

  const disconnect = useCallback(() => {
    const rfb = rfbRef.current;

    if (rfb) {
      try {
        rfb.disconnect();
      } catch {
        // Connection may already be closed.
      }
    }

    rfbRef.current = null;
    setStatus('disconnected');
  }, []);

  const connectConsole = useCallback(async () => {
    if (
      !node ||
      !Number.isInteger(vmid) ||
      vmid <= 0
    ) {
      setStatus('error');
      setError(
        'The console URL does not contain a valid node and VMID.',
      );
      return;
    }

    const screen = screenRef.current;

    if (!screen) {
      setStatus('error');
      setError(
        'The console display could not be initialized.',
      );
      return;
    }

    disconnect();

    screen.replaceChildren();
    setError(null);
    setStatus('preparing');

    try {
      const response =
        await api.post<ConsoleTicketResponse>(
          '/guest/console',
          {
            node,
            vmid,
          },
        );

      setStatus('connecting');

      const rfb = new RFB(
        screen,
        buildWebSocketUrl(
          response.data.websocket_path,
        ),
        {
          shared: true,
          wsProtocols: ['binary'],
          credentials: {
            password: response.data.vnc_password,
          },
        },
      );

      rfb.viewOnly = false;
      rfb.scaleViewport = scaleViewport;
      rfb.resizeSession = resizeSession;
      rfb.clipViewport = false;
      rfb.showDotCursor = true;
      rfb.background = '#111111';
      rfb.qualityLevel = 7;
      rfb.compressionLevel = 2;

      rfb.addEventListener('connect', () => {
        setStatus('connected');
        setError(null);
        rfb.focus();
      });

      rfb.addEventListener(
        'disconnect',
        (event) => {
          rfbRef.current = null;

          if (event.detail.clean) {
            setStatus('disconnected');
          } else {
            setStatus('error');
            setError(
              'The console connection was interrupted.',
            );
          }
        },
      );

      rfb.addEventListener(
        'securityfailure',
        (event) => {
          setStatus('error');
          setError(
            event.detail.reason ||
            'The VNC security handshake failed.',
          );
        },
      );

      rfb.addEventListener(
        'credentialsrequired',
        () => {
          setStatus('error');
          setError(
            'The VNC server unexpectedly requested additional credentials.',
          );
        },
      );

      rfbRef.current = rfb;
    } catch (requestError) {
      setStatus('error');
      setError(
        getErrorMessage(requestError),
      );
    }
  }, [
    disconnect,
    node,
    resizeSession,
    scaleViewport,
    vmid,
  ]);

  useEffect(() => {
    void connectConsole();

    return () => {
      const rfb = rfbRef.current;

      if (rfb) {
        try {
          rfb.disconnect();
        } catch {
          // Ignore cleanup failures.
        }
      }

      rfbRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (rfbRef.current) {
      rfbRef.current.scaleViewport =
        scaleViewport;
    }
  }, [scaleViewport]);

  useEffect(() => {
    if (rfbRef.current) {
      rfbRef.current.resizeSession =
        resizeSession;
    }
  }, [resizeSession]);

  async function enterFullscreen(): Promise<void> {
    const element = document.documentElement;

    if (!document.fullscreenElement) {
      await element.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  return (
    <Stack
      gap={0}
      h="100vh"
      style={{
        overflow: 'hidden',
        background: '#111111',
      }}
    >
      <Group
        justify="space-between"
        px="md"
        py="sm"
        bg="dark.8"
        wrap="nowrap"
      >
        <div>
          <Title order={4} c="white">
            {guestName}
          </Title>

          <Text size="xs" c="dimmed">
            {node} · VMID {vmid}
          </Text>
        </div>

        <Group gap="sm" wrap="nowrap">
          <Switch
            size="sm"
            label="Scale"
            color="blue"
            checked={scaleViewport}
            onChange={(event) =>
              setScaleViewport(
                event.currentTarget.checked,
              )
            }
            styles={{
              label: {
                color: 'white',
              },
            }}
          />

          <Switch
            size="sm"
            label="Remote resize"
            color="blue"
            checked={resizeSession}
            onChange={(event) =>
              setResizeSession(
                event.currentTarget.checked,
              )
            }
            styles={{
              label: {
                color: 'white',
              },
            }}
          />

          <Button
            size="xs"
            variant="light"
            leftSection={
              <IconKeyboard size={16} />
            }
            disabled={status !== 'connected'}
            onClick={() =>
              rfbRef.current?.sendCtrlAltDel()
            }
          >
            Ctrl+Alt+Del
          </Button>

          <Button
            size="xs"
            variant="light"
            leftSection={
              <IconArrowsMaximize size={16} />
            }
            onClick={() =>
              void enterFullscreen()
            }
          >
            Fullscreen
          </Button>

          {status === 'connected' ||
          status === 'connecting' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={
                <IconLogout size={16} />
              }
              onClick={disconnect}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              size="xs"
              variant="light"
              leftSection={
                <IconRefresh size={16} />
              }
              onClick={() =>
                void connectConsole()
              }
            >
              Reconnect
            </Button>
          )}
        </Group>
      </Group>

      <Box
        pos="relative"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Box
          ref={screenRef}
          w="100%"
          h="100%"
          style={{
            overflow: 'hidden',
          }}
        />

        {(status === 'preparing' ||
          status === 'connecting') && (
          <Center
            pos="absolute"
            inset={0}
            style={{
              pointerEvents: 'none',
              background:
                'rgba(17, 17, 17, 0.82)',
            }}
          >
            <Stack align="center">
              <Loader />

              <Text c="white">
                {status === 'preparing'
                  ? 'Preparing console...'
                  : 'Connecting to VM...'}
              </Text>
            </Stack>
          </Center>
        )}

        {status === 'error' && error && (
          <Center
            pos="absolute"
            inset={0}
            p="xl"
            style={{
              background:
                'rgba(17, 17, 17, 0.92)',
            }}
          >
            <Alert
              color="red"
              icon={
                <IconAlertCircle size={20} />
              }
              title="Console connection failed"
              maw={620}
            >
              {error}
            </Alert>
          </Center>
        )}

        {status === 'disconnected' && (
          <Center
            pos="absolute"
            inset={0}
            style={{
              background:
                'rgba(17, 17, 17, 0.88)',
            }}
          >
            <Text c="dimmed">
              Console disconnected.
            </Text>
          </Center>
        )}
      </Box>
    </Stack>
  );
}
