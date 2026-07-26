interface NavigatorUAData {
  readonly platform: string;
}

interface Navigator {
  readonly userAgentData?: NavigatorUAData;
}
