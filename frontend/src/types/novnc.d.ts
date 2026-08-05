declare module '@novnc/novnc' {
  type RfbCredentials = {
    password?: string;
    username?: string;
    target?: string;
  };

  type RfbOptions = {
    credentials?: RfbCredentials;
    shared?: boolean;
    repeaterID?: string;
    wsProtocols?: string[];
  };

  type RfbDisconnectDetail = {
    clean: boolean;
  };

  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      url: string,
      options?: RfbOptions,
    );

    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    showDotCursor: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;

    disconnect(): void;
    focus(): void;
    blur(): void;
    sendCtrlAltDel(): void;
    clipboardPasteFrom(text: string): void;
    machineShutdown(): void;
    machineReboot(): void;
    machineReset(): void;

    addEventListener(
      type: 'connect',
      listener: (event: Event) => void,
    ): void;

    addEventListener(
      type: 'disconnect',
      listener: (
        event: CustomEvent<RfbDisconnectDetail>,
      ) => void,
    ): void;

    addEventListener(
      type: 'credentialsrequired',
      listener: (event: Event) => void,
    ): void;

    addEventListener(
      type: 'securityfailure',
      listener: (
        event: CustomEvent<{
          status: number;
          reason?: string;
        }>,
      ) => void,
    ): void;

    removeEventListener(
      type: string,
      listener: EventListener,
    ): void;
  }
}
