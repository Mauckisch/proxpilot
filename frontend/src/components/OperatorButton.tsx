import {
  Button,
  Tooltip,
  type ButtonProps,
} from '@mantine/core';
import type {
  MouseEvent,
  ReactNode,
} from 'react';

import { useAuth } from '../auth';

type OperatorButtonProps = ButtonProps & {
  children: ReactNode;
  onClick?: (
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  permissionTooltip?: string;
};

export function OperatorButton({
  children,
  disabled,
  onClick,
  permissionTooltip =
    'Operator or administrator permissions required.',
  ...buttonProps
}: OperatorButtonProps) {
  const { canOperate } = useAuth();

  const permissionDenied = !canOperate;
  const isDisabled =
    permissionDenied || Boolean(disabled);

  const button = (
    <Button
      {...buttonProps}
      disabled={isDisabled}
      onClick={
        permissionDenied
          ? undefined
          : onClick
      }
    >
      {children}
    </Button>
  );

  if (!permissionDenied) {
    return button;
  }

  return (
    <Tooltip
      label={permissionTooltip}
      withArrow
    >
      <span style={{ display: 'inline-flex' }}>
        {button}
      </span>
    </Tooltip>
  );
}
