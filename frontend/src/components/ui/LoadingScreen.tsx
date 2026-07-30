import {
  Image,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import classes from './LoadingScreen.module.css';

type LoadingScreenProps = {
  title?: string;
  message?: string;
  minHeight?: number | string;
};

export function LoadingScreen({
  title = 'ProxPilot',
  message = 'Connecting to cluster...',
  minHeight = 440,
}: LoadingScreenProps) {
  return (
    <div
      className={classes.root}
      style={{ minHeight }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <Stack
        className={classes.content}
        align="center"
        gap="md"
      >
        <div className={classes.logoWrapper}>
          <div className={classes.logoGlow} />

          <Image
            className={classes.logo}
            src="/branding/proxpilot-icon.svg"
            alt=""
            aria-hidden="true"
            w={92}
            h={92}
            fit="contain"
          />
        </div>

        <Stack gap={3} align="center">
          <Title order={2}>
            {title}
          </Title>

          <Text c="dimmed" size="sm">
            {message}
          </Text>
        </Stack>

        <div
          className={classes.dots}
          aria-hidden="true"
        >
          <span className={classes.dot} />
          <span className={classes.dot} />
          <span className={classes.dot} />
        </div>
      </Stack>
    </div>
  );
}
